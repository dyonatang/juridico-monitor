"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as store from "@/lib/store";
import { cadastrarDocumento, cadastrarProcesso, marcarAlertasLidos, ativarMonitoramentoDocumento } from "@/lib/repo";
import { sincronizarProcesso } from "@/lib/sync";
import { atualizarUsuario, contarAdmins, criarUsuario, excluirUsuario, exigirAdmin, getUsuario, usuarioAtual } from "@/lib/usuarios";
import { registrarAuditoria } from "@/lib/auditoria";
import type { Papel, PontoControvertido, Prazo } from "@/lib/types";
import { apagarArquivo, salvarArquivo } from "@/lib/storage";
import { iaDisponivel } from "@/lib/explicador";
import { criarTarefa } from "@/lib/tarefas";
import type { ResultadoProcessoImportado } from "@/lib/types";

/** `tarefa`: id de uma tarefa em segundo plano que a tela acompanha (ver lib/tarefas.ts). */
export type ActionState = { erro?: string; ok?: string; tarefa?: string } | undefined;

const str = (fd: FormData, k: string) => (fd.get(k) as string | null)?.toString() ?? "";
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const tudo = () => ["/", "/documentos", "/processos", "/alertas", "/importar"].forEach((p) => revalidatePath(p));
/** Intervalo mínimo entre rodadas para o botão "Sincronizar agora" (ver sincronizarTudoAction). */
const INTERVALO_MINIMO_MANUAL_MS = 10 * 60_000;

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
  const rotulo = col === "processos" ? (await store.getProcesso(id))?.numero_formatado : await store.getDocumento(id).then((d) => (d ? d.apelido || d.nome : null));
  await registrarAuditoria(col === "processos" ? "excluiu_processo" : "excluiu_documento", { tipo: col === "processos" ? "processo" : "documento", id, rotulo }, eu.login);
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

export async function adicionarPontoControvertidoAction(id: string, fd: FormData) {
  const eu = await exigirAdmin();
  const texto = str(fd, "texto").trim();
  if (!texto) return;
  const p = await store.getProcesso(id, { fresco: true });
  if (!p) return;
  const ponto: PontoControvertido = { id: store.novoId("processos"), texto, status: "pendente", created_at: store.agora() };
  const pontos = [...(p.pontos_controvertidos ?? []), ponto];
  await store.atualizar("processos", id, { pontos_controvertidos: pontos });
  await registrarAuditoria("editou_processo", { tipo: "processo", id, rotulo: "adicionou ponto controvertido" }, eu.login);
  revalidatePath(`/processos/${id}`);
}

export async function atualizarStatusPontoAction(id: string, pontoId: string, status: PontoControvertido["status"]) {
  const eu = await exigirAdmin();
  const p = await store.getProcesso(id, { fresco: true });
  if (!p?.pontos_controvertidos) return;
  const pontos = p.pontos_controvertidos.map((pt) => (pt.id === pontoId ? { ...pt, status } : pt));
  await store.atualizar("processos", id, { pontos_controvertidos: pontos });
  await registrarAuditoria("editou_processo", { tipo: "processo", id, rotulo: "atualizou ponto controvertido" }, eu.login);
  revalidatePath(`/processos/${id}`);
}

export async function excluirPontoControvertidoAction(id: string, pontoId: string) {
  const eu = await exigirAdmin();
  const p = await store.getProcesso(id, { fresco: true });
  if (!p?.pontos_controvertidos) return;
  const pontos = p.pontos_controvertidos.filter((pt) => pt.id !== pontoId);
  await store.atualizar("processos", id, { pontos_controvertidos: pontos });
  await registrarAuditoria("editou_processo", { tipo: "processo", id, rotulo: "excluiu ponto controvertido" }, eu.login);
  revalidatePath(`/processos/${id}`);
}

export async function adicionarPrazoAction(id: string, fd: FormData) {
  const eu = await exigirAdmin();
  const data = str(fd, "data").trim();
  const descricao = str(fd, "descricao").trim();
  if (!data || !descricao) return;
  const p = await store.getProcesso(id, { fresco: true });
  if (!p) return;
  const prazo: Prazo = { id: store.novoId("processos"), data, descricao, created_at: store.agora() };
  const prazos = [...(p.proximos_prazos ?? []), prazo];
  await store.atualizar("processos", id, { proximos_prazos: prazos });
  await registrarAuditoria("editou_processo", { tipo: "processo", id, rotulo: "adicionou prazo" }, eu.login);
  revalidatePath(`/processos/${id}`);
  tudo();
}

export async function excluirPrazoAction(id: string, prazoId: string) {
  const eu = await exigirAdmin();
  const p = await store.getProcesso(id, { fresco: true });
  if (!p?.proximos_prazos) return;
  const prazos = p.proximos_prazos.filter((pr) => pr.id !== prazoId);
  await store.atualizar("processos", id, { proximos_prazos: prazos });
  await registrarAuditoria("editou_processo", { tipo: "processo", id, rotulo: "excluiu prazo" }, eu.login);
  revalidatePath(`/processos/${id}`);
  tudo();
}

export async function sincronizarProcessoAction(id: string) {
  const p = await store.getProcesso(id);
  if (p) await sincronizarProcesso(p).catch(() => null);
  revalidatePath(`/processos/${id}`);
  tudo();
}

export async function sincronizarTudoAction(_: ActionState): Promise<ActionState> {
  try {
    // Uma rodada logo depois da outra é justamente o que faz o CNJ recusar (429): o botão só
    // consulta se a última rodada (automática ou manual) começou há mais de 10 minutos.
    const ultimo = await store.ultimoSyncLog();
    const desde = ultimo ? Date.now() - new Date(ultimo.iniciado_em).getTime() : Infinity;
    if (desde < INTERVALO_MINIMO_MANUAL_MS) {
      const falta = Math.ceil((INTERVALO_MINIMO_MANUAL_MS - desde) / 60_000);
      return { erro: `A última consulta aos tribunais começou há ${Math.floor(desde / 60_000)} min. Para não sobrecarregar a fonte do CNJ, aguarde mais ${falta} min — ou espere o robô automático (6h e 18h).` };
    }
    // Roda em segundo plano (lib/tarefas.ts); a tela acompanha e mostra o resultado no fim.
    const login = (await usuarioAtual())?.login ?? "sistema";
    return { tarefa: await criarTarefa("sincronizar", {}, login) };
  } catch (e) {
    return { erro: `A atualização falhou: ${msg(e)}` };
  }
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
  | { erro?: string; tarefa?: string; resultados?: { nome: string; processos: ResultadoProcessoImportado[]; resumo: string | null; erro: string | null }[] }
  | undefined;

/**
 * Guarda os PDFs numa pasta temporária e cria a tarefa que lê cada um com IA em segundo
 * plano (a leitura leva de 20 s a 2 min por documento — ver lib/tarefas.ts).
 */
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
  const pdfs = files.filter((f) => /\.pdf$/i.test(f.name) || f.type === "application/pdf");
  if (pdfs.length === 0) return { erro: "Nenhum dos arquivos é PDF." };
  try {
    const lote = store.novoId("tarefas");
    const arquivos: { nome: string; caminho: string }[] = [];
    for (const [i, f] of pdfs.entries()) {
      const caminho = `envios/${lote}/${i}.pdf`; // cópia temporária, apagada depois da leitura
      await salvarArquivo(caminho, Buffer.from(await f.arrayBuffer()), "application/pdf");
      arquivos.push({ nome: f.name, caminho });
    }
    return { tarefa: await criarTarefa("importar", { arquivos, documento_id }, eu.login) };
  } catch (e) {
    return { erro: `Não foi possível enviar: ${msg(e)}` };
  }
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
    const u = await criarUsuario({ nome: str(fd, "nome"), login: str(fd, "login"), senha: str(fd, "senha"), papel, email: str(fd, "email") || null });
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

/** E-mail do usuário (usado no "Esqueci minha senha" e para entrar digitando o e-mail). */
export async function salvarEmailUsuarioAction(login: string, fd: FormData) {
  const eu = await exigirAdmin();
  await atualizarUsuario(login, { email: str(fd, "email") });
  await registrarAuditoria("alterou_usuario", { tipo: "usuario", id: login, rotulo: "e-mail" }, eu.login);
  revalidatePath("/usuarios");
}

export async function redefinirSenhaAction(login: string, fd: FormData) {
  const eu = await exigirAdmin();
  await atualizarUsuario(login, { senha: str(fd, "senha") });
  await registrarAuditoria("redefiniu_senha", { tipo: "usuario", id: login }, eu.login);
  revalidatePath("/usuarios");
}

// ------------------------------------------------------------------ v2.0 (IA)

// As três rodam em segundo plano (lib/tarefas.ts): o pedido volta na hora com o id da tarefa
// e a tela acompanha — pelo endereço .web.app nenhum pedido pode passar de 60 s.

/** Gera (ou atualiza) a ficha do caso. Leva de 20 s a 2 min. */
export async function gerarFichaAction(id: string, _: ActionState): Promise<ActionState> {
  try {
    const eu = await exigirAdmin();
    if (!iaDisponivel()) return { erro: "Leitura por IA não configurada (ANTHROPIC_API_KEY)." };
    return { tarefa: await criarTarefa("ficha", { processo_id: id }, eu.login) };
  } catch (e) {
    return { erro: msg(e) };
  }
}

/** Explica os andamentos mais recentes que ainda não têm explicação (até 15). */
export async function explicarRecentesAction(id: string, _: ActionState): Promise<ActionState> {
  try {
    const eu = await exigirAdmin();
    if (!iaDisponivel()) return { erro: "Leitura por IA não configurada (ANTHROPIC_API_KEY)." };
    const sem = (await store.listarMovimentacoes(id)).filter((m) => !m.explicado_em);
    if (!sem.length) return { ok: "Os andamentos recentes já estão explicados." };
    return { tarefa: await criarTarefa("explicar", { processo_id: id }, eu.login) };
  } catch (e) {
    return { erro: msg(e) };
  }
}

/** Relatório executivo da carteira inteira (Claude Fable 5.2). Leva de 1 a 3 minutos. */
export async function gerarRelatorioAction(_: ActionState): Promise<ActionState> {
  try {
    const eu = await exigirAdmin();
    if (!iaDisponivel()) return { erro: "Leitura por IA não configurada (ANTHROPIC_API_KEY)." };
    return { tarefa: await criarTarefa("relatorio", {}, eu.login) };
  } catch (e) {
    return { erro: msg(e) };
  }
}
