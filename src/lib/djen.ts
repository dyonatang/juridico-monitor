/**
 * Robô de publicações (v2.1, 12/11/2026) — Diário de Justiça Eletrônico Nacional (DJEN/CNJ).
 *
 * O DataJud só diz QUE houve uma publicação ("Disponibilização no Diário da Justiça"); o DJEN
 * traz o TEXTO do despacho/decisão/intimação. É público, gratuito e sem login:
 *   GET https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroProcesso=<20 dígitos>
 * Limite medido: 20 consultas por minuto (cabeçalho X-RateLimit-Limit). Por isso a fila anda
 * devagar (1 consulta a cada 3,5 s) e, se o DJEN pedir pausa (429), a passada para e o resto
 * fica para a próxima — o agendador roda 3 passadas em cada janela (6h e 18h).
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import * as store from "./store";
import { fmtData } from "./format";
import { BASE, capaTexto, chamar, iaDisponivel, nossoLado } from "./explicador";
import type { Processo, Publicacao } from "./types";

const API = "https://comunicaapi.pje.jus.br/api/v1/comunicacao";
const PAUSA_MS = 3_500;
const POR_PAGINA = 100;
const MAX_PAGINAS = 10;
/** Já consultado há menos que isso = feito nesta janela (as passadas são de 20 em 20 min). */
const JANELA_MS = 2 * 3_600_000;
/** Na primeira consulta de um processo, só gera alerta do que saiu nos últimos dias (o resto é histórico). */
const DIAS_ALERTA_PRIMEIRA_CARGA = 15;
/** Só explica com IA o que saiu nos últimos dias (histórico antigo fica só com o texto). */
const DIAS_EXPLICAR = 60;

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
/** Dia (AAAA-MM-DD) no horário de Brasília, `dias` atrás de `base`. */
const diaBr = (dias = 0, base = Date.now()) => new Date(base - 3 * 3_600_000 - dias * 86_400_000).toISOString().slice(0, 10);

/** O DJEN pediu pausa (limite de consultas por minuto). */
export class DjenLimite extends Error {}

type ItemDjen = {
  id: number;
  data_disponibilizacao: string;
  tipoComunicacao?: string | null;
  tipoDocumento?: string | null;
  nomeOrgao?: string | null;
  texto?: string | null;
  link?: string | null;
  ativo?: boolean;
  data_cancelamento?: string | null;
  destinatarios?: { nome?: string }[] | null;
};

/** CPF de terceiros que apareça no texto não é guardado. */
const semCpf = (t: string) => t.replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, "***.***.***-**");
/** Alguns tribunais mandam o texto com HTML (<br>, <a href>) — fica só o texto. */
export const semHtml = (t: string) => t.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ");

async function buscarPagina(numero: string, pagina: number, desde?: string): Promise<{ count: number; items: ItemDjen[] }> {
  const qs = new URLSearchParams({ numeroProcesso: numero, itensPorPagina: String(POR_PAGINA), pagina: String(pagina) });
  if (desde) {
    qs.set("dataDisponibilizacaoInicio", desde);
    qs.set("dataDisponibilizacaoFim", diaBr(-1));
  }
  let res: Response;
  try {
    res = await fetch(`${API}?${qs}`, {
      headers: { Accept: "application/json", "User-Agent": "JuridicoMonitor/2.1" },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    const nome = e instanceof Error ? e.name : "";
    throw new Error(nome === "TimeoutError" || nome === "AbortError" ? "DJEN não respondeu em 30 s" : "DJEN: falha de rede");
  }
  if (res.status === 429) throw new DjenLimite("DJEN pediu pausa (limite de consultas por minuto)");
  if (!res.ok) throw new Error(`DJEN respondeu ${res.status}`);
  const j = (await res.json()) as { count?: number; items?: ItemDjen[] };
  return { count: j.count ?? 0, items: j.items ?? [] };
}

/** Todas as comunicações de um processo (desde a data indicada, se houver). */
export async function consultarDjen(numeroCnj: string, desde?: string): Promise<ItemDjen[]> {
  const todos: ItemDjen[] = [];
  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    if (pagina > 1) await espera(PAUSA_MS);
    const { count, items } = await buscarPagina(numeroCnj, pagina, desde);
    todos.push(...items);
    if (!items.length || todos.length >= count) break;
  }
  return todos;
}

/** Converte para o formato do sistema, sem canceladas e sem repetidas (uma por destinatário). */
export function montarPublicacoes(processoId: string, itens: ItemDjen[]): Omit<Publicacao, "created_at">[] {
  const porId = new Map<string, Omit<Publicacao, "created_at">>();
  for (const i of itens) {
    if (i.ativo === false || i.data_cancelamento || !i.texto || !i.data_disponibilizacao) continue;
    // O id usa o texto como veio (só espaços normalizados) — assim a primeira carga de 12/11/2026,
    // gravada antes da limpeza de HTML, continua com o mesmo id e não duplica.
    const bruto = semCpf(i.texto.replace(/\s+/g, " ").trim());
    const id = createHash("sha1").update(`${processoId}|${i.data_disponibilizacao}|${bruto}`).digest("hex").slice(0, 28);
    const texto = semCpf(semHtml(i.texto).replace(/\s+/g, " ").trim());
    const anterior = porId.get(id);
    const nomes = (i.destinatarios ?? []).map((d) => d.nome?.trim()).filter((n): n is string => !!n);
    if (anterior) {
      anterior.destinatarios = [...new Set([...anterior.destinatarios, ...nomes])];
      continue;
    }
    porId.set(id, {
      id,
      processo_id: processoId,
      djen_id: i.id,
      data_disponibilizacao: i.data_disponibilizacao.slice(0, 10),
      tipo_comunicacao: i.tipoComunicacao ?? null,
      tipo_documento: i.tipoDocumento ?? null,
      orgao: i.nomeOrgao ?? null,
      texto,
      link: i.link ?? null,
      destinatarios: [...new Set(nomes)],
    });
  }
  return [...porId.values()];
}

const rotuloProc = (p: Processo) => (p.descricao ? `${p.descricao} (${p.numero_formatado})` : p.numero_formatado);

export type ResultadoPublicacoes = {
  pendentes: number;
  consultados: number;
  novas: number;
  alertas: number;
  explicadas: number;
  erros: string[];
  /** true se o DJEN pediu pausa e a passada parou antes de terminar a fila. */
  pausado: boolean;
};

/**
 * Uma passada do robô: consulta os processos ainda não consultados nesta janela (o mais
 * antigo primeiro), grava as publicações inéditas, gera alertas e explica as recentes.
 */
export async function sincronizarPublicacoes(opts: { orcamentoMs?: number } = {}): Promise<ResultadoPublicacoes> {
  const prazoFinal = Date.now() + (opts.orcamentoMs ?? 220_000);
  const limite = Date.now() - JANELA_MS;
  const processos = await store.listarProcessos({ apenasAtivos: true });
  const pendentes = processos
    .filter((p) => !p.djen_check || new Date(p.djen_check).getTime() < limite)
    .sort((a, b) => (a.djen_check ?? "").localeCompare(b.djen_check ?? ""));

  const r: ResultadoPublicacoes = { pendentes: pendentes.length, consultados: 0, novas: 0, alertas: 0, explicadas: 0, erros: [], pausado: false };
  for (let i = 0; i < pendentes.length; i++) {
    const p = pendentes[i];
    if (prazoFinal - Date.now() < 20_000) break;
    if (i > 0) await espera(PAUSA_MS);
    const primeira = !p.djen_check;
    // Nas seguintes, olha 7 dias para trás do último check: cobre publicação que o DJEN indexou com atraso.
    const desde = primeira ? undefined : diaBr(7, new Date(p.djen_check!).getTime());
    try {
      const pubs = montarPublicacoes(p.id, await consultarDjen(p.numero_cnj, desde));
      const inseridas = await store.inserirPublicacoes(pubs);
      r.novas += inseridas.length;
      const corte = diaBr(DIAS_ALERTA_PRIMEIRA_CARGA);
      const alertar = primeira ? inseridas.filter((x) => x.data_disponibilizacao >= corte) : inseridas;
      if (alertar.length) {
        await store.inserirAlertas(
          alertar.map((x) => ({
            tipo: "publicacao" as const,
            processo_id: p.id,
            documento_id: null,
            movimentacao_id: null,
            publicacao_id: x.id,
            titulo: `Publicação no Diário: ${rotuloProc(p)}`,
            mensagem: `${fmtData(x.data_disponibilizacao)} — ${x.tipo_documento || x.tipo_comunicacao || "Comunicação"}${x.orgao ? ` · ${x.orgao}` : ""}`,
          })),
        );
        r.alertas += alertar.length;
      }
      await store.atualizar("processos", p.id, { djen_check: store.agora(), djen_erro: null });
      r.consultados++;
    } catch (e) {
      if (e instanceof DjenLimite) {
        r.pausado = true;
        r.erros.push(`${e.message} — os ${pendentes.length - i} restantes ficam para a próxima passada`);
        break;
      }
      r.erros.push(`${p.numero_formatado}: ${msg(e)}`);
      await store.atualizar("processos", p.id, { djen_erro: msg(e) });
    }
  }

  const ex = await explicarPublicacoesPendentes(prazoFinal + 40_000).catch((e) => ({ explicadas: 0, erros: [`Explicação das publicações: ${msg(e)}`] }));
  r.explicadas = ex.explicadas;
  r.erros.push(...ex.erros);
  await store.fs().collection("djen_log").add({ em: store.agora(), ...r }).catch(() => undefined);
  return r;
}

// ------------------------------------------------------------------ explicação pela IA

const PublicacoesSchema = z.object({
  itens: z.array(
    z.object({
      id: z.string().describe("o id da publicação, exatamente como recebido"),
      explicacao: z.string().describe("2 a 4 frases: o que o juiz ou o cartório determinou, para quem, em linguagem simples"),
      o_que_fazer: z.string().nullable().describe("providência concreta para o nosso lado; null quando o ato não exige nada de nós"),
      prazo: z.string().nullable().describe("o prazo que o PRÓPRIO TEXTO fixa e para quem (ex.: '15 dias para o réu contestar'); null se o texto não fixa prazo"),
      importancia: z.enum(["alta", "media", "baixa"]).describe("alta = decisão/sentença, prazo ou providência para o nosso lado, audiência, bloqueio; media = despacho que mexe no processo mas não exige nada de nós; baixa = certidão ou rotina"),
    }),
  ),
});

const SISTEMA_PUBLICACOES = `${BASE}
Diferente dos andamentos, aqui você recebe o TEXTO do ato publicado no Diário de Justiça — então explique o conteúdo de verdade.
- Diga a quem o ato se dirige (autor, réu, interessado, perito) e se isso atinge o nosso lado. Se o ato manda outra parte fazer algo, diga que não exige nada de nós.
- Prazo: só o que o texto fixar. Não calcule datas-limite (prazos processuais contam em dias úteis a partir da intimação e dependem de quem foi intimado).
- A data do Diário é a da publicação; o ato em si pode ser mais antigo (ex.: despacho de agosto publicado em novembro) — quando isso aparecer no texto, mencione.`;

/** Explica publicações recentes ainda sem explicação, um processo por chamada. */
export async function explicarPublicacoesPendentes(prazoFinal: number, maxProcessos = 8): Promise<{ explicadas: number; erros: string[] }> {
  const erros: string[] = [];
  if (!iaDisponivel()) return { explicadas: 0, erros };
  const pendentes = await store.publicacoesSemExplicacao(diaBr(DIAS_EXPLICAR));
  const porProcesso = new Map<string, Publicacao[]>();
  for (const p of pendentes) porProcesso.set(p.processo_id, [...(porProcesso.get(p.processo_id) ?? []), p]);
  let explicadas = 0;
  const lado = await nossoLado();
  for (const [processoId, pubs] of [...porProcesso].slice(0, maxProcessos)) {
    if (Date.now() > prazoFinal - 45_000) break;
    try {
      const proc = await store.getProcesso(processoId);
      if (!proc) continue;
      const lista = pubs.sort((a, b) => b.data_disponibilizacao.localeCompare(a.data_disponibilizacao)).slice(0, 6);
      const ids = new Set(lista.map((x) => x.id));
      const usuario = [
        `NOSSO LADO (pessoas e empresas que acompanhamos): ${lado}`,
        "",
        "DADOS DO PROCESSO",
        capaTexto(proc),
        "",
        "PUBLICAÇÕES A EXPLICAR (texto do Diário de Justiça Eletrônico Nacional)",
        ...lista.map((x) => `[id=${x.id}] ${fmtData(x.data_disponibilizacao)} — ${x.tipo_documento || x.tipo_comunicacao || "Comunicação"}${x.orgao ? ` · ${x.orgao}` : ""}\n${x.texto.slice(0, 6000)}`),
        "",
        "Explique cada publicação (um item por id).",
      ].join("\n");
      const resp = await chamar({ schema: PublicacoesSchema, system: SISTEMA_PUBLICACOES, usuario, effort: "medium", maxTokens: 8000 });
      const validos = resp.itens.filter((x) => ids.has(x.id));
      await store.salvarExplicacoesPublicacoes(validos);
      explicadas += validos.length;
    } catch (e) {
      erros.push(`Explicação ${processoId}: ${msg(e)}`);
    }
  }
  return { explicadas, erros };
}
