/**
 * Versão 2.0 — explicação dos andamentos e ficha do caso (Claude).
 *
 *  - explicarAndamentos: para cada andamento novo, 1-3 frases em português simples dizendo o
 *    que aconteceu, se exige providência e a importância. Roda no fim da atualização de hora
 *    em hora, só para andamentos recentes (não para a carga inicial de processos antigos).
 *  - gerarFicha: resumo do caso sob demanda (situação, quem é quem, pendências e próximo passo).
 *
 * Regra de ouro: só afirmar o que está nos dados. O DataJud entrega o NOME do andamento
 * ("Juntada de Petição", "Conclusos para despacho"), não o conteúdo da peça — então a IA
 * explica o tipo de ato e diz quando o conteúdo não está disponível, sem inventar.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import * as store from "./store";
import { fmtData, fmtDataHora } from "./format";
import type { Movimentacao, Processo } from "./types";

export const iaDisponivel = () => Boolean(process.env.ANTHROPIC_API_KEY);
const modelo = () => process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

/**
 * Chamada estruturada com o modelo de reserva do próprio servidor da Anthropic: se o modelo
 * principal recusar (falso positivo de segurança), a mesma chamada é refeita no modelo
 * indicado pela Anthropic, sem código nosso de nova tentativa.
 */
async function chamar<T extends z.ZodType>(opts: { schema: T; system: string; usuario: string; effort: "low" | "medium" | "high"; maxTokens: number }): Promise<z.infer<T>> {
  const client = new Anthropic({ timeout: 4 * 60 * 1000 });
  const stream = client.beta.messages.stream({
    model: modelo(),
    max_tokens: opts.maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: opts.system,
    messages: [{ role: "user", content: opts.usuario }],
    output_config: { effort: opts.effort, format: betaZodOutputFormat(opts.schema) },
  });
  const resp = await stream.finalMessage();
  if (resp.stop_reason === "refusal") throw new Error("A IA recusou esta análise.");
  if (resp.stop_reason === "max_tokens") throw new Error("A resposta da IA ficou incompleta (limite de tamanho).");
  if (resp.parsed_output == null) throw new Error("A IA não devolveu o formato esperado.");
  return resp.parsed_output as z.infer<T>;
}

const BASE = `Você é o assistente jurídico de um grupo empresarial familiar do Espírito Santo (restaurante Caranguejo do Assis, bufê, holding imobiliária DFV Participações). Quem lê é o dono, empresário sem formação jurídica.
Regras que não podem ser quebradas:
- Use SOMENTE os dados fornecidos. Nunca invente o conteúdo de decisões, petições, valores, nomes ou datas que não estejam nos dados.
- Os andamentos vêm da base pública do CNJ, que traz o NOME do ato (ex.: "Juntada de Petição", "Conclusos para decisão"), quase nunca o conteúdo. Explique o que esse tipo de ato significa e, quando o conteúdo importar e não estiver disponível, diga isso com clareza (ex.: "o texto da petição não aparece aqui — vale abrir no PJe ou pedir à advogada").
- Português do Brasil, frases curtas, sem juridiquês; quando um termo técnico for inevitável, explique-o entre parênteses.
- Não dê certeza sobre o resultado do processo. Nada de "vocês vão ganhar".`;

// ------------------------------------------------------------------ andamentos

const ExplicacoesSchema = z.object({
  itens: z.array(
    z.object({
      id: z.string().describe("o id do andamento, exatamente como recebido"),
      explicacao: z.string().describe("1 a 3 frases: o que aconteceu, em linguagem simples, no contexto deste processo"),
      o_que_fazer: z.string().nullable().describe("providência concreta para o grupo, se houver; null quando o andamento é só trâmite interno do cartório"),
      importancia: z.enum(["alta", "media", "baixa"]).describe("alta = decisão, sentença, intimação/citação, audiência, prazo ou bloqueio; media = petição juntada, conclusão ao juiz, perícia; baixa = trâmite interno (remessa, certidão, expedição de rotina)"),
    }),
  ),
});
export type Explicacao = z.infer<typeof ExplicacoesSchema>["itens"][number];

function capaTexto(p: Processo) {
  return [
    `Processo ${p.numero_formatado}${p.descricao ? ` — ${p.descricao}` : ""}`,
    p.classe && `Classe: ${p.classe}`,
    p.assunto && `Assunto: ${p.assunto}`,
    p.orgao_julgador && `Órgão: ${p.orgao_julgador}${p.tribunal ? ` (${p.tribunal.toUpperCase()})` : ""}`,
    p.polo_ativo && `Polo ativo (autor): ${p.polo_ativo}`,
    p.polo_passivo && `Polo passivo (réu): ${p.polo_passivo}`,
    p.valor_causa && `Valor da causa: ${p.valor_causa.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
    p.resumo_status && `Resumo registrado pelo usuário: ${p.resumo_status}`,
  ].filter(Boolean).join("\n");
}
/** Quem é o "nosso lado": os CPFs/CNPJs cadastrados para monitoramento (dado real, não suposição). */
async function nossoLado() {
  const docs = await store.listarDocumentos();
  return docs.map((d) => d.apelido ? `${d.apelido} (${d.nome})` : d.nome).join("; ");
}
const linhaMov = (m: Movimentacao) => `${fmtDataHora(m.data_hora)} — ${m.descricao}${m.complemento ? ` (${m.complemento})` : ""}`;

/** Explica os andamentos indicados de UM processo (uma chamada) e grava o resultado. */
export async function explicarAndamentos(processo: Processo, novos: Movimentacao[]): Promise<number> {
  if (!novos.length) return 0;
  const todos = await store.listarMovimentacoes(processo.id); // mais recente primeiro
  const ids = new Set(novos.map((m) => m.id));
  const historico = todos.filter((m) => !ids.has(m.id)).slice(0, 25);
  const usuario = [
    `NOSSO LADO (pessoas e empresas que acompanhamos): ${await nossoLado()}`,
    "",
    "DADOS DO PROCESSO",
    capaTexto(processo),
    "",
    "ANDAMENTOS ANTERIORES (mais recente primeiro, só para contexto)",
    historico.length ? historico.map(linhaMov).join("\n") : "(nenhum)",
    "",
    "ANDAMENTOS A EXPLICAR",
    novos.map((m) => `[id=${m.id}] ${linhaMov(m)}`).join("\n"),
    "",
    "Explique cada andamento da lista ANDAMENTOS A EXPLICAR (um item por id).",
  ].join("\n");
  const r = await chamar({ schema: ExplicacoesSchema, system: BASE, usuario, effort: "medium", maxTokens: 8000 });
  const validos = r.itens.filter((i) => ids.has(i.id));
  await store.salvarExplicacoes(validos);
  return validos.length;
}

/**
 * Passo final da atualização automática: explica andamentos gravados nos últimos dias que
 * ainda não têm explicação. Ignora andamentos antigos (data do ato > 60 dias): são a carga
 * inicial de um processo recém-cadastrado, não novidade. Respeita o prazo da rodada.
 */
export async function explicarPendentes(prazoFinal: number, maxProcessos = 8): Promise<{ explicados: number; erros: string[] }> {
  const erros: string[] = [];
  if (!iaDisponivel()) return { explicados: 0, erros };
  const desde = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const recenteAto = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const pendentes = (await store.movimentacoesSemExplicacao(desde)).filter((m) => m.data_hora >= recenteAto);
  const porProcesso = new Map<string, Movimentacao[]>();
  for (const m of pendentes) porProcesso.set(m.processo_id, [...(porProcesso.get(m.processo_id) ?? []), m]);
  let explicados = 0;
  for (const [processoId, movs] of [...porProcesso].slice(0, maxProcessos)) {
    if (Date.now() > prazoFinal - 45_000) break; // não começa chamada que pode estourar a rodada
    try {
      const p = await store.getProcesso(processoId);
      if (p) explicados += await explicarAndamentos(p, movs.slice(0, 15));
    } catch (e) {
      erros.push(`Explicação ${processoId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { explicados, erros };
}

// ------------------------------------------------------------------ ficha do caso

const FichaSchema = z.object({
  situacao_atual: z.string().describe("3 a 6 frases: em que pé está o processo hoje e o que isso significa para o grupo"),
  quem_e_quem: z.array(z.object({ nome: z.string(), papel: z.string().describe("ex.: autor (nosso lado), réu, advogado do réu, juízo") })).describe("só pessoas/empresas que aparecem nos dados"),
  ultima_decisao: z.string().nullable().describe("a decisão/despacho mais recente e o que ela determinou, se os dados mostrarem; null se não houver"),
  pendencias: z.array(z.string()).describe("o que está pendente para o processo andar (ex.: citação de alguém, prazo de manifestação, perícia)"),
  proximo_passo: z.string().nullable().describe("o que o grupo pode fazer agora para o processo andar, de forma concreta"),
  limites: z.array(z.string()).describe("o que NÃO dá para saber com estes dados (ex.: conteúdo de decisões que só aparecem pelo nome)"),
});
export type Ficha = z.infer<typeof FichaSchema> & { gerada_em: string; modelo: string };

export async function gerarFicha(processoId: string): Promise<Ficha> {
  const [p, movs, arquivos] = await Promise.all([
    store.getProcesso(processoId, { fresco: true }),
    store.listarMovimentacoes(processoId),
    store.listarArquivosDoProcesso(processoId),
  ]);
  if (!p) throw new Error("Processo não encontrado");
  const pecas = arquivos.filter((a) => a.analise).slice(0, 15).map((a) => {
    const an = a.analise!;
    return [
      `• ${an.tipo_documento}${a.jusbr?.dataHoraJuntada ? ` (juntada ${fmtDataHora(a.jusbr.dataHoraJuntada)})` : ` (importado ${fmtData(a.created_at)})`}: ${an.resumo}`,
      an.acao_recomendada && `  Providência indicada: ${an.acao_recomendada}`,
      an.partes.length ? `  Partes no documento: ${an.partes.map((x) => `${x.nome} (${x.polo})`).join("; ")}` : null,
    ].filter(Boolean).join("\n");
  });
  const usuario = [
    `NOSSO LADO (pessoas e empresas que acompanhamos): ${await nossoLado()}`,
    "DADOS DO PROCESSO",
    capaTexto(p),
    p.proximos_prazos?.length ? `Prazos/audiências registrados: ${p.proximos_prazos.map((x) => `${fmtData(x.data)} ${x.descricao}`).join("; ")}` : "",
    p.pontos_controvertidos?.length ? `Pontos controvertidos registrados: ${p.pontos_controvertidos.map((x) => `${x.texto} [${x.status}]`).join("; ")}` : "",
    "",
    "PEÇAS LIDAS (PDFs importados e resumidos — é a única fonte com CONTEÚDO de decisões e petições)",
    pecas.length ? pecas.join("\n") : "(nenhuma peça importada para este processo)",
    "",
    `ANDAMENTOS (${movs.length}, mais recente primeiro)`,
    movs.slice(0, 150).map(linhaMov).join("\n") || "(nenhum)",
    "",
    "Monte a ficha do caso, do ponto de vista do NOSSO LADO.",
  ].filter((l) => l !== "").join("\n");
  const r = await chamar({ schema: FichaSchema, system: BASE, usuario, effort: "high", maxTokens: 16000 });
  const ficha: Ficha = { ...r, gerada_em: store.agora(), modelo: modelo() };
  await store.atualizar("processos", processoId, { ficha });
  return ficha;
}
