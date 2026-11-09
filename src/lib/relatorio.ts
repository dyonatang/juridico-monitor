/**
 * Relatório executivo da carteira (2.0) — Claude Fable 5.2 lê TODOS os processos ativos de uma vez
 * (capa, resumo registrado, ficha, prazos e os andamentos mais recentes já explicados) e devolve:
 * manchete, resumo, termômetro, destaques, próximos passos e a fase de cada processo.
 *
 * Mesma regra de ouro do explicador: só afirmar o que está nos dados. Os ids de processo que a IA
 * devolve são conferidos contra a lista enviada; o que não bate é descartado.
 * Guardado em `relatorios/{id}`; a tela mostra o mais recente.
 */
import { z } from "zod";
import * as store from "./store";
import { BASE, capaTexto, chamar, linhaMov, modelo, nossoLado } from "./explicador";
import { FASES, FASE_DESCRICAO, type Fase } from "./fases";
import { fmtData } from "./format";
import type { Movimentacao, Processo } from "./types";

const RelatorioSchema = z.object({
  manchete: z.string().describe("uma frase curta (até ~110 caracteres) que resume a situação da carteira hoje, para um empresário"),
  resumo: z.string().describe("3 a 5 frases: panorama geral, o que mudou recentemente e onde está o risco"),
  termometro: z.enum(["tranquilo", "atencao", "critico"]).describe("tranquilo = nada exige ação imediata; atencao = há prazos/decisões a acompanhar; critico = bloqueio, penhora, prazo vencendo ou decisão contra o grupo que pede ação já"),
  termometro_motivo: z.string().describe("1 frase justificando o termômetro com fatos dos dados"),
  destaques: z.array(z.object({
    titulo: z.string().describe("até ~60 caracteres"),
    texto: z.string().describe("2 a 3 frases, com o fato e o que significa"),
    tom: z.enum(["atencao", "positivo", "neutro"]),
    processo_id: z.string().nullable().describe("o id (20 dígitos) exatamente como recebido, ou null se o destaque é geral"),
  })).describe("3 a 6 destaques, o mais importante primeiro"),
  proximos_passos: z.array(z.object({
    acao: z.string().describe("ação concreta, começando com verbo"),
    urgencia: z.enum(["agora", "esta_semana", "acompanhar"]),
    processo_id: z.string().nullable(),
  })).describe("até 8 passos, do mais urgente ao menos urgente"),
  processos: z.array(z.object({
    id: z.string().describe("o id (20 dígitos) exatamente como recebido"),
    fase: z.enum([...FASES, "indefinida"]),
    frase: z.string().describe("1 frase curta: em que pé está, do ponto de vista do nosso lado"),
    atencao: z.boolean().describe("true se este processo pede ação ou acompanhamento próximo agora"),
  })).describe("um item para CADA processo recebido"),
  limites: z.array(z.string()).describe("o que não dá para saber com estes dados"),
});
type RelatorioIA = z.infer<typeof RelatorioSchema>;

export type Relatorio = RelatorioIA & {
  id: string;
  gerado_em: string;
  modelo: string;
  duracao_ms: number;
  total_processos: number;
  gerado_por: string;
};
export type FaseRelatorio = { fase: Fase; frase: string; atencao: boolean };

const COL = "relatorios";

function blocoProcesso(p: Processo, movs: Movimentacao[]) {
  const recentes = movs.slice(0, 6).map((m) => {
    const exp = m.explicacao ? `\n      explicação: ${m.explicacao}${m.o_que_fazer ? ` | providência: ${m.o_que_fazer}` : ""}` : "";
    return `    - ${linhaMov(m)}${m.importancia ? ` [${m.importancia}]` : ""}${exp}`;
  });
  const f = p.ficha;
  return [
    `### id=${p.id}`,
    capaTexto(p),
    p.classificacao_risco && `Risco avaliado pelo usuário: ${p.classificacao_risco}${p.valor_provisionado != null ? ` (provisão R$ ${p.valor_provisionado})` : ""}`,
    p.proximos_prazos?.length ? `Prazos: ${p.proximos_prazos.map((x) => `${fmtData(x.data)} ${x.descricao}`).join("; ")}` : null,
    f && `Ficha do caso (${fmtData(f.gerada_em)}): ${f.situacao_atual}${f.proximo_passo ? ` Próximo passo: ${f.proximo_passo}` : ""}`,
    `Total de andamentos: ${movs.length}; mais recentes:`,
    recentes.length ? recentes.join("\n") : "    (nenhum)",
  ].filter(Boolean).join("\n");
}

export async function gerarRelatorio(geradoPor: string): Promise<Relatorio> {
  const t0 = Date.now();
  const processos = await store.listarProcessos({ apenasAtivos: true });
  if (!processos.length) throw new Error("Nenhum processo ativo para analisar.");
  const movsPorProcesso = await Promise.all(processos.map((p) => store.listarMovimentacoes(p.id)));
  const alertas = await store.listarAlertas({ apenasNaoLidos: true });
  const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

  const usuario = [
    `HOJE: ${hoje}`,
    `NOSSO LADO (pessoas e empresas que acompanhamos): ${await nossoLado()}`,
    `ALERTAS NÃO LIDOS: ${alertas.length}`,
    "",
    FASE_DESCRICAO,
    "",
    `PROCESSOS ATIVOS (${processos.length})`,
    ...processos.map((p, i) => blocoProcesso(p, movsPorProcesso[i])),
    "",
    "Monte o relatório executivo da carteira, do ponto de vista do NOSSO LADO. Classifique a fase de CADA processo.",
  ].join("\n");

  const r = await chamar({
    schema: RelatorioSchema,
    system: `${BASE}\n- Você escreve o relatório executivo semanal do dono: direto, sem enrolação, priorizando o que pede ação.`,
    usuario,
    effort: "medium",
    maxTokens: 32000,
  });

  const ids = new Set(processos.map((p) => p.id));
  const idOk = (id: string | null) => (id && ids.has(id) ? id : null);
  const vistos = new Set<string>();
  const relatorio: Relatorio = {
    ...r,
    destaques: r.destaques.map((d) => ({ ...d, processo_id: idOk(d.processo_id) })),
    proximos_passos: r.proximos_passos.map((d) => ({ ...d, processo_id: idOk(d.processo_id) })),
    processos: r.processos.filter((x) => ids.has(x.id) && !vistos.has(x.id) && vistos.add(x.id)),
    id: store.novoId(COL),
    gerado_em: store.agora(),
    modelo: modelo(),
    duracao_ms: Date.now() - t0,
    total_processos: processos.length,
    gerado_por: geradoPor,
  };
  const { id, ...dados } = relatorio;
  await store.fs().collection(COL).doc(id).set(dados);
  store.limparCache();
  return relatorio;
}

export async function ultimoRelatorio(): Promise<Relatorio | null> {
  const s = await store.fs().collection(COL).orderBy("gerado_em", "desc").limit(1).get();
  const d = s.docs[0];
  return d ? ({ id: d.id, ...(d.data() as Omit<Relatorio, "id">) }) : null;
}

/** Fase de cada processo segundo o relatório mais recente (para a tela do processo e o painel). */
export function fasesDoRelatorio(r: Relatorio | null): Map<string, FaseRelatorio> {
  return new Map((r?.processos ?? []).map((x) => [x.id, { fase: x.fase, frase: x.frase, atencao: x.atencao }]));
}
