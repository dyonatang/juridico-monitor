/**
 * Tarefas em segundo plano (coleção `tarefas`).
 *
 * Pelo endereço dfv-juridico.web.app o Google corta qualquer pedido em 60 s. Por isso o que
 * demora (atualizar os tribunais, Relatório IA, ficha, explicar andamentos, ler PDF) não roda
 * mais dentro do clique: o botão só cria a tarefa e a tela acompanha por /api/tarefas/[id].
 *
 * Quem executa: a Cloud Function `executarTarefa` (agendador/index.js) dispara quando o
 * documento é criado e chama /api/cron/tarefa?id=… no App Hosting (até 5 min). Em
 * desenvolvimento local, sem a função, a tarefa roda no próprio servidor.
 */
import { revalidatePath } from "next/cache";
import * as store from "./store";
import { sincronizarTudo } from "./sync";
import { explicarAndamentos, gerarFicha } from "./explicador";
import { gerarRelatorio } from "./relatorio";
import { importarPdf } from "./importar";
import { registrarAuditoria } from "./auditoria";
import { apagarArquivo, lerArquivo } from "./storage";
import type { ResultadoProcessoImportado } from "./types";

export type TipoTarefa = "sincronizar" | "relatorio" | "ficha" | "explicar" | "importar";
export type StatusTarefa = "pendente" | "rodando" | "ok" | "erro";

export type ResultadoImportacao = { nome: string; processos: ResultadoProcessoImportado[]; resumo: string | null; erro: string | null }[];

export type Tarefa = {
  id: string;
  tipo: TipoTarefa;
  params: Record<string, unknown>;
  login: string;
  status: StatusTarefa;
  criado_em: string;
  iniciado_em?: string | null;
  fim_em?: string | null;
  mensagem?: string | null;
  resultado?: ResultadoImportacao | null;
};

const COL = "tarefas";
/** Sem começar em 3 min, ou rodando há mais de 7 min: a tela trata como falha. */
export const LIMITE_PENDENTE_MS = 3 * 60_000;
export const LIMITE_RODANDO_MS = 7 * 60_000;

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const tudo = () => ["/", "/documentos", "/processos", "/alertas", "/importar"].forEach((p) => revalidatePath(p));

export async function getTarefa(id: string): Promise<Tarefa | null> {
  const d = await store.fs().collection(COL).doc(id).get();
  return d.exists ? ({ id: d.id, ...d.data() } as Tarefa) : null;
}

/** Situação para a tela, já considerando tarefa que travou (função não disparou, etc.). */
export function situacao(t: Tarefa): { status: StatusTarefa; mensagem: string | null } {
  const desde = (iso?: string | null) => (iso ? Date.now() - new Date(iso).getTime() : 0);
  if (t.status === "pendente" && desde(t.criado_em) > LIMITE_PENDENTE_MS)
    return { status: "erro", mensagem: "A tarefa não chegou a começar no servidor. Tente de novo em alguns minutos." };
  if (t.status === "rodando" && desde(t.iniciado_em) > LIMITE_RODANDO_MS)
    return { status: "erro", mensagem: "A tarefa passou do tempo limite no servidor. Tente de novo." };
  return { status: t.status, mensagem: t.mensagem ?? null };
}

/**
 * Cria a tarefa. Se já existe uma igual em andamento (ex.: dois cliques, ou duas pessoas),
 * devolve a existente em vez de rodar de novo.
 */
export async function criarTarefa(tipo: TipoTarefa, params: Record<string, unknown>, login: string): Promise<string> {
  const chave = JSON.stringify(params);
  const abertas = await store.fs().collection(COL).where("tipo", "==", tipo).where("status", "in", ["pendente", "rodando"]).get();
  const igual = abertas.docs
    .map((d) => ({ id: d.id, ...d.data() }) as Tarefa)
    .find((t) => JSON.stringify(t.params) === chave && situacao(t).status !== "erro");
  if (igual) return igual.id;

  const ref = store.fs().collection(COL).doc();
  const t: Omit<Tarefa, "id"> = { tipo, params, login, status: "pendente", criado_em: store.agora(), mensagem: null, resultado: null };
  await ref.set(t);
  // Local (next dev / next start sem a Cloud Function): executa aqui mesmo, sem esperar.
  if (process.env.TAREFAS_NO_PROPRIO_SERVIDOR === "1" || process.env.NODE_ENV !== "production") {
    void executarTarefa(ref.id).catch(() => null);
  }
  return ref.id;
}

/** Executa uma tarefa pendente (chamado por /api/cron/tarefa). Roda no máximo uma vez. */
export async function executarTarefa(id: string): Promise<Tarefa | null> {
  const ref = store.fs().collection(COL).doc(id);
  const pegou = await store.fs().runTransaction(async (tx) => {
    const d = await tx.get(ref);
    if (!d.exists || d.data()?.status !== "pendente") return false;
    tx.update(ref, { status: "rodando", iniciado_em: store.agora() });
    return true;
  });
  if (!pegou) return getTarefa(id);

  const t = (await getTarefa(id))!;
  let fim: Partial<Tarefa>;
  try {
    fim = await rodar(t);
  } catch (e) {
    fim = { status: "erro", mensagem: msg(e) };
  }
  await ref.update({ status: "ok", ...fim, fim_em: store.agora() });
  return getTarefa(id);
}

async function rodar(t: Tarefa): Promise<Partial<Tarefa>> {
  const p = t.params;
  switch (t.tipo) {
    case "sincronizar": {
      // Em segundo plano há até 5 min; o que não couber fica para o robô (6h e 18h).
      const r = await sincronizarTudo({ orcamentoMs: 200_000 });
      tudo();
      const partes = [`${r.verificados} processo(s) verificado(s)`, `${r.novas} andamento(s) novo(s)`];
      if (r.erros.length) partes.push(`${r.erros.length} lote(s) com problema`);
      const pend = r.pendentes ? ` ${r.pendentes} ficaram para a próxima rodada automática (a consulta é feita aos poucos, para o CNJ não recusar).` : "";
      return r.erros.length
        ? { status: "erro", mensagem: `Terminou com problemas: ${partes.join(", ")}.${pend}` }
        : { status: "ok", mensagem: `Pronto: ${partes.join(", ")}.${pend}` };
    }
    case "relatorio": {
      const r = await gerarRelatorio(t.login);
      await registrarAuditoria("gerou_relatorio", { tipo: "relatorio", id: r.id, rotulo: `${r.total_processos} processos` }, t.login);
      revalidatePath("/relatorio");
      revalidatePath("/");
      return { status: "ok", mensagem: `Relatório pronto em ${Math.round(r.duracao_ms / 1000)} s.` };
    }
    case "ficha": {
      const id = String(p.processo_id);
      await gerarFicha(id);
      await registrarAuditoria("editou_processo", { tipo: "processo", id, rotulo: "gerou ficha do caso (IA)" }, t.login);
      revalidatePath(`/processos/${id}`);
      return { status: "ok", mensagem: "Ficha atualizada." };
    }
    case "explicar": {
      const id = String(p.processo_id);
      const proc = await store.getProcesso(id, { fresco: true });
      if (!proc) return { status: "erro", mensagem: "Processo não encontrado." };
      const sem = (await store.listarMovimentacoes(id)).filter((m) => !m.explicado_em).slice(0, 15);
      if (!sem.length) return { status: "ok", mensagem: "Os andamentos recentes já estão explicados." };
      const n = await explicarAndamentos(proc, sem);
      await registrarAuditoria("editou_processo", { tipo: "processo", id, rotulo: `explicou ${n} andamento(s) (IA)` }, t.login);
      revalidatePath(`/processos/${id}`);
      tudo();
      return { status: "ok", mensagem: `${n} andamento(s) explicado(s).` };
    }
    case "importar": {
      const arquivos = (p.arquivos as { nome: string; caminho: string }[]) ?? [];
      const documento_id = (p.documento_id as string | null) ?? null;
      const resultados: ResultadoImportacao = [];
      for (const f of arquivos) {
        try {
          const a = await importarPdf({ nome: f.nome, bytes: await lerArquivo(f.caminho), documento_id });
          await registrarAuditoria("importou_pdf", { tipo: "arquivo", id: a.id, rotulo: f.nome }, t.login);
          resultados.push({ nome: f.nome, processos: a.resultado, resumo: a.analise?.resumo ?? null, erro: null });
        } catch (e) {
          resultados.push({ nome: f.nome, processos: [], resumo: null, erro: msg(e) });
        } finally {
          await apagarArquivo(f.caminho).catch(() => null); // cópia temporária do envio
        }
      }
      tudo();
      const falhas = resultados.filter((r) => r.erro).length;
      return { status: "ok", mensagem: falhas ? `${falhas} de ${resultados.length} arquivo(s) com problema.` : `${resultados.length} arquivo(s) lido(s).`, resultado: resultados };
    }
  }
}
