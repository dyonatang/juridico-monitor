"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as store from "@/lib/store";
import { cadastrarDocumento, cadastrarProcesso, marcarAlertasLidos, ativarMonitoramentoDocumento } from "@/lib/repo";
import { sincronizarProcesso, sincronizarTudo } from "@/lib/sync";
import { importarPdf } from "@/lib/importar";
import { atualizarUsuario, contarAdmins, criarUsuario, excluirUsuario, exigirAdmin, getUsuario } from "@/lib/usuarios";
import { registrarAuditoria } from "@/lib/auditoria";
import type { Papel } from "@/lib/types";
import { apagarArquivo } from "@/lib/storage";
import type { ResultadoProcessoImportado } from "@/lib/types";

export type ActionState = { erro?: string; ok?: string } | undefined;

const str = (fd: FormData, k: string) => (fd.get(k) as string | null)?.toString() ?? "";
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const tudo = () => ["/", "/documentos", "/processos", "/alertas", "/importar"].forEach((p) => revalidatePath(p));

export async function criarDocumentoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const eu = await exigirAdmin();
    const doc = await cadastrarDocumento({
      tipo: str(fd, "tipo") as "CPF" | "CNPJ",
      numero: str(fd, "numero"),
      nome: str(fd, "nome"),
      apelido: str(fd, "apelido") || null,
      vinculo_id: str(fd, "vinculo_id") || null,
      observacao: str(fd, "observacao"),
    });
    await registrarAuditoria("criou_documento", { tipo: "documento", id: doc.id, rotulo: doc.apelido || doc.nome }, eu.login);
    tudo();
    return { ok: doc.ultimo_erro ? `Cadastrado. Aviso: ${doc.ultimo_erro}` : "Documento cadastrado e monitoramento ativado." };
  } catch (e) {
    return { erro: msg(e) };
  }
}

export async function criarProcessoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const eu = await exigirAdmin();
    const r = await cadastrarProcesso({
      numero: str(fd, "numero"),
      descricao: str(fd, "descricao"),
      documento_id: str(fd, "documento_id") || null,
    });
    await registrarAuditoria("criou_processo", { tipo: "processo", id: r.processo.id, rotulo: r.processo.numero_formatado }, eu.login);
    tudo();
    return r.erro
      ? { ok: `Processo cadastrado, mas a primeira consulta falhou: ${r.erro}` }
      : { ok: `Processo cadastrado — ${r.novas} movimentação(ões) importada(s).` };
  } catch (e) {
    return { erro: msg(e) };
  }
}

export async function alternarAtivoAction(col: store.Colecao, id: string, ativo: boolean) {
  await exigirAdmin();
  await store.atualizar(col, id, { ativo });
  tudo();
}

export async function excluirAction(col: store.Colecao, id: string) {
  const eu = await exigirAdmin();
  await registrarAuditoria(col === "processos" ? "excluiu_processo" : "excluiu_documento", { tipo: col === "processos" ? "processo" : "documento", id }, eu.login);
  await store.excluir(col, id);
  tudo();
  if (col === "processos") redirect("/processos");
}

export async function atualizarRiscoAction(id: string, fd: FormData) {
  const eu = await exigirAdmin();
  const classificacao = str(fd, "classificacao_risco");
  const valorStr = str(fd, "valor_provisionado");
  await store.atualizar("processos", id, {
    classificacao_risco: classificacao === "provavel" || classificacao === "possivel" || classificacao === "remoto" ? classificacao : null,
    valor_provisionado: valorStr ? Number(valorStr) : null,
  });
  await registrarAuditoria("editou_processo", { tipo: "processo", id, rotulo: "avaliação de risco" }, eu.login);
  revalidatePath(`/processos/${id}`);
  tudo();
}

export async function sincronizarProcessoAction(id: string) {
  const p = await store.getProcesso(id);
  if (p) await sincronizarProcesso(p).catch(() => null);
  revalidatePath(`/processos/${id}`);
  tudo();
}

export async function sincronizarTudoAction() {
  await sincronizarTudo();
  tudo();
}

export async function reativarMonitoramentoAction(id: string) {
  await exigirAdmin();
  const doc = await store.getDocumento(id);
  if (doc) {
    await ativarMonitoramentoDocumento(doc).catch(async (e) => {
      await store.atualizar("documentos", id, { ultimo_erro: msg(e) });
    });
  }
  tudo();
}

export async function marcarLidoAction(id?: string) {
  await marcarAlertasLidos(id ? [id] : undefined);
  tudo();
}

export type ImportState =
  | { erro?: string; resultados?: { nome: string; processos: ResultadoProcessoImportado[]; resumo: string | null; erro: string | null }[] }
  | undefined;

export async function importarPdfAction(_: ImportState, fd: FormData): Promise<ImportState> {
  let eu;
  try {
    eu = await exigirAdmin();
  } catch (e) {
    return { erro: msg(e) };
  }
  const files = fd.getAll("arquivos").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { erro: "Escolha pelo menos um PDF." };
  const documento_id = str(fd, "documento_id") || null;
  const resultados: NonNullable<ImportState>["resultados"] = [];
  for (const f of files) {
    if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") {
      resultados.push({ nome: f.name, processos: [], resumo: null, erro: "Não é um PDF." });
      continue;
    }
    try {
      const a = await importarPdf({ nome: f.name, bytes: Buffer.from(await f.arrayBuffer()), documento_id });
      await registrarAuditoria("importou_pdf", { tipo: "arquivo", id: a.id, rotulo: f.name }, eu.login);
      resultados.push({ nome: f.name, processos: a.resultado, resumo: a.analise?.resumo ?? null, erro: null });
    } catch (e) {
      resultados.push({ nome: f.name, processos: [], resumo: null, erro: msg(e) });
    }
  }
  tudo();
  return { resultados };
}

export async function excluirArquivoAction(id: string) {
  const eu = await exigirAdmin();
  const a = await store.getArquivo(id);
  if (a) {
    await apagarArquivo(a.storage_path).catch(() => null);
    await store.excluirArquivo(id);
    await registrarAuditoria("excluiu_arquivo", { tipo: "arquivo", id, rotulo: a.nome }, eu.login);
  }
  tudo();
}

// ------------------------------------------------------------------ Usuários
export async function criarUsuarioAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const eu = await exigirAdmin();
    const papel = (str(fd, "papel") === "admin" ? "admin" : "leitura") as Papel;
    const u = await criarUsuario({ nome: str(fd, "nome"), login: str(fd, "login"), senha: str(fd, "senha"), papel });
    await registrarAuditoria("criou_usuario", { tipo: "usuario", id: u.login, rotulo: u.nome }, eu.login);
    revalidatePath("/usuarios");
    return { ok: `Usuário ${u.nome} (${u.login}) cadastrado.` };
  } catch (e) {
    return { erro: msg(e) };
  }
}

export async function alternarUsuarioAction(login: string, ativo: boolean) {
  const eu = await exigirAdmin();
  if (login === eu.login) return;
  if (!ativo) {
    const alvo = await getUsuario(login);
    if (alvo?.papel === "admin" && (await contarAdmins()) <= 1) throw new Error("Não é possível bloquear o único administrador.");
  }
  await atualizarUsuario(login, { ativo });
  await registrarAuditoria("alterou_usuario", { tipo: "usuario", id: login, rotulo: ativo ? "reativado" : "bloqueado" }, eu.login);
  revalidatePath("/usuarios");
}

export async function excluirUsuarioAction(login: string) {
  const eu = await exigirAdmin();
  if (login === eu.login) return;
  const alvo = await getUsuario(login);
  if (alvo?.papel === "admin" && alvo.ativo && (await contarAdmins()) <= 1) throw new Error("Não é possível excluir o único administrador.");
  await excluirUsuario(login);
  await registrarAuditoria("excluiu_usuario", { tipo: "usuario", id: login, rotulo: alvo?.nome ?? login }, eu.login);
  revalidatePath("/usuarios");
}

export async function redefinirSenhaAction(login: string, fd: FormData) {
  const eu = await exigirAdmin();
  await atualizarUsuario(login, { senha: str(fd, "senha") });
  await registrarAuditoria("redefiniu_senha", { tipo: "usuario", id: login }, eu.login);
  revalidatePath("/usuarios");
}
