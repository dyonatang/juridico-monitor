"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as store from "@/lib/store";
import { cadastrarDocumento, cadastrarEmpresa, cadastrarProcesso, marcarAlertasLidos, ativarMonitoramentoDocumento } from "@/lib/repo";
import { sincronizarProcesso, sincronizarTudo } from "@/lib/sync";
import { importarPdf } from "@/lib/importar";
import { apagarArquivo } from "@/lib/storage";
import type { ResultadoProcessoImportado } from "@/lib/types";

export type ActionState = { erro?: string; ok?: string } | undefined;

const str = (fd: FormData, k: string) => (fd.get(k) as string | null)?.toString() ?? "";
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const tudo = () => ["/", "/empresas", "/documentos", "/processos", "/alertas", "/importar"].forEach((p) => revalidatePath(p));

export async function criarEmpresaAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await cadastrarEmpresa({ nome: str(fd, "nome"), cnpj: str(fd, "cnpj"), apelido: str(fd, "apelido") });
    tudo();
    return { ok: "Empresa cadastrada." };
  } catch (e) {
    return { erro: msg(e) };
  }
}

export async function criarDocumentoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const doc = await cadastrarDocumento({
      tipo: str(fd, "tipo") as "CPF" | "CNPJ",
      numero: str(fd, "numero"),
      nome: str(fd, "nome"),
      empresa_id: str(fd, "empresa_id") || null,
      observacao: str(fd, "observacao"),
    });
    tudo();
    return { ok: doc.ultimo_erro ? `Cadastrado. Aviso: ${doc.ultimo_erro}` : "Documento cadastrado e monitoramento ativado." };
  } catch (e) {
    return { erro: msg(e) };
  }
}

export async function criarProcessoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const r = await cadastrarProcesso({
      numero: str(fd, "numero"),
      descricao: str(fd, "descricao"),
      empresa_id: str(fd, "empresa_id") || null,
      documento_id: str(fd, "documento_id") || null,
    });
    tudo();
    return r.erro
      ? { ok: `Processo cadastrado, mas a primeira consulta falhou: ${r.erro}` }
      : { ok: `Processo cadastrado — ${r.novas} movimentação(ões) importada(s).` };
  } catch (e) {
    return { erro: msg(e) };
  }
}

export async function alternarAtivoAction(col: store.Colecao, id: string, ativo: boolean) {
  await store.atualizar(col, id, { ativo });
  tudo();
}

export async function excluirAction(col: store.Colecao, id: string) {
  await store.excluir(col, id);
  tudo();
  if (col === "processos") redirect("/processos");
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
  const files = fd.getAll("arquivos").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { erro: "Escolha pelo menos um PDF." };
  const empresa_id = str(fd, "empresa_id") || null;
  const resultados: NonNullable<ImportState>["resultados"] = [];
  for (const f of files) {
    if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") {
      resultados.push({ nome: f.name, processos: [], resumo: null, erro: "Não é um PDF." });
      continue;
    }
    try {
      const a = await importarPdf({ nome: f.name, bytes: Buffer.from(await f.arrayBuffer()), empresa_id });
      resultados.push({ nome: f.name, processos: a.resultado, resumo: a.analise?.resumo ?? null, erro: null });
    } catch (e) {
      resultados.push({ nome: f.name, processos: [], resumo: null, erro: msg(e) });
    }
  }
  tudo();
  return { resultados };
}

export async function excluirArquivoAction(id: string) {
  const a = await store.getArquivo(id);
  if (a) {
    await apagarArquivo(a.storage_path).catch(() => null);
    await store.excluirArquivo(id);
  }
  tudo();
}
