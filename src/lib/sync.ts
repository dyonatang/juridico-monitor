import * as store from "./store";
import { formatarCnj, somenteDigitos, tribunalDoCnj, fmtDataHora } from "./format";
import { datajud, provedorDeProcesso, type ProcessoRemoto } from "./providers";
import type { ResultadoLote } from "./providers/datajud";
import type { Processo } from "./types";
import { notificarPendentes } from "./notify";
import { hashMov } from "./movimento";
import { explicarPendentes } from "./explicador";

/** Garante que o processo exista. Se for novo e "descoberto", gera alerta de novo processo. */
export async function upsertProcessoRemoto(
  remoto: ProcessoRemoto,
  meta: {
    origem: "manual" | "descoberto";
    documento_id?: string | null;
    provider?: string | null;
    provider_tracking_id?: string | null;
    descricao?: string | null;
  },
): Promise<{ processo: Processo; criado: boolean }> {
  const numero = somenteDigitos(remoto.numeroCnj);
  const existente = await store.getProcessoPorNumero(numero);
  if (existente) return { processo: existente, criado: false };

  const processo = await store.criarProcesso({
    numero_cnj: numero,
    numero_formatado: formatarCnj(numero),
    tribunal: remoto.tribunal ?? tribunalDoCnj(numero),
    classe: remoto.classe ?? null,
    assunto: remoto.assunto ?? null,
    orgao_julgador: remoto.orgaoJulgador ?? null,
    grau: remoto.grau ?? null,
    data_ajuizamento: remoto.dataAjuizamento ?? null,
    polo_ativo: remoto.poloAtivo ?? null,
    polo_passivo: remoto.poloPassivo ?? null,
    valor_causa: remoto.valorCausa ?? null,
    situacao: remoto.situacao ?? null,
    descricao: meta.descricao ?? null,
    documento_id: meta.documento_id ?? null,
    origem: meta.origem,
    provider: meta.provider ?? null,
    provider_tracking_id: meta.provider_tracking_id ?? null,
  });

  if (meta.origem === "descoberto") {
    await store.inserirAlertas([
      {
        tipo: "novo_processo",
        processo_id: processo.id,
        documento_id: meta.documento_id ?? null,
        movimentacao_id: null,
        titulo: `Novo processo encontrado: ${formatarCnj(numero)}`,
        mensagem: [
          remoto.classe && `Classe: ${remoto.classe}`,
          remoto.assunto && `Assunto: ${remoto.assunto}`,
          remoto.poloAtivo && `Polo ativo: ${remoto.poloAtivo}`,
          remoto.poloPassivo && `Polo passivo: ${remoto.poloPassivo}`,
          remoto.orgaoJulgador && `Órgão: ${remoto.orgaoJulgador}`,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ]);
  }
  return { processo, criado: true };
}

/**
 * Aplica capa + movimentações ao processo. Retorna quantas movimentações eram inéditas.
 * Na primeira carga gera só um alerta-resumo (não um por movimentação).
 */
export async function aplicarRemoto(processo: Processo, remoto: ProcessoRemoto, fonte: string): Promise<number> {
  const capa: Record<string, unknown> = { ultimo_check: store.agora(), ultimo_erro: null, aviso_fonte: null };
  const set = (k: string, v: unknown) => {
    if (v !== null && v !== undefined && v !== "") capa[k] = v;
  };
  set("tribunal", remoto.tribunal);
  set("classe", remoto.classe);
  set("assunto", remoto.assunto);
  set("orgao_julgador", remoto.orgaoJulgador);
  set("grau", remoto.grau);
  set("data_ajuizamento", remoto.dataAjuizamento);
  set("polo_ativo", remoto.poloAtivo);
  set("polo_passivo", remoto.poloPassivo);
  set("valor_causa", remoto.valorCausa);
  set("situacao", remoto.situacao);

  const conhecidos = await store.hashesDoProcesso(processo.id);
  const primeiraCarga = conhecidos.size === 0;
  const novas = remoto.movimentacoes.map((m) => ({ ...m, hash: hashMov(m) })).filter((m) => !conhecidos.has(m.hash));

  const inseridas = await store.inserirMovimentacoes(
    processo.id,
    novas.map((m) => ({ data_hora: m.dataHora, codigo: m.codigo ?? null, descricao: m.descricao, complemento: m.complemento ?? null, fonte, hash: m.hash })),
  );
  capa.total_movimentacoes = conhecidos.size + inseridas.length;
  const todasDatas = [...remoto.movimentacoes.map((m) => m.dataHora), processo.ultima_movimentacao_em ?? ""].filter(Boolean);
  if (todasDatas.length) capa.ultima_movimentacao_em = todasDatas.sort().at(-1);
  await store.atualizar("processos", processo.id, capa);
  if (inseridas.length === 0) return 0;

  const rotulo = processo.descricao ? `${processo.descricao} (${processo.numero_formatado})` : processo.numero_formatado;
  if (primeiraCarga) {
    const ultima = [...inseridas].sort((a, b) => b.data_hora.localeCompare(a.data_hora))[0];
    await store.inserirAlertas([
      {
        tipo: "nova_movimentacao",
        processo_id: processo.id,
        documento_id: null,
        movimentacao_id: ultima?.id ?? null,
        titulo: `Processo carregado: ${rotulo}`,
        mensagem: `${inseridas.length} movimentações importadas. Última: ${ultima ? `${fmtDataHora(ultima.data_hora)} — ${ultima.descricao}` : "—"}`,
      },
    ]);
  } else {
    await store.inserirAlertas(
      inseridas.map((m) => ({
        tipo: "nova_movimentacao" as const,
        processo_id: processo.id,
        documento_id: null,
        movimentacao_id: m.id,
        titulo: `Novo andamento: ${rotulo}`,
        mensagem: `${fmtDataHora(m.data_hora)} — ${m.descricao}${m.complemento ? ` (${m.complemento})` : ""}`,
      })),
    );
  }
  return inseridas.length;
}

/** Consulta o provedor e aplica ao processo. Em falha, registra em `ultimo_erro` e relança. */
export async function sincronizarProcesso(processo: Processo): Promise<number> {
  try {
    const provider = provedorDeProcesso();
    let remoto: ProcessoRemoto | null = null;
    try {
      remoto = await provider.consultarProcesso(processo.numero_cnj);
    } catch (e) {
      if (provider.nome !== "datajud") remoto = await datajud.consultarProcesso(processo.numero_cnj, processo.tribunal);
      else throw e;
    }
    if (!remoto && provider.nome !== "datajud") remoto = await datajud.consultarProcesso(processo.numero_cnj, processo.tribunal);
    if (!remoto) {
      await registrarAusente(processo);
      return 0;
    }
    return await aplicarRemoto(processo, remoto, provider.nome);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await store.atualizar("processos", processo.id, { ultimo_check: store.agora(), ultimo_erro: msg });
    throw e;
  }
}

export const AVISO_FORA_DA_FONTE =
  "Este processo não consta na base pública do CNJ (DataJud) — é o normal para processos em segredo de justiça. Os andamentos não chegam por aqui: acompanhe pelo PJe com a advogada ou importe as peças em PDF.";

/** A fonte respondeu normalmente, mas sem esse processo. */
async function registrarAusente(processo: Processo) {
  if (processo.total_movimentacoes > 0) {
    // Já veio dado dessa fonte antes: um "0 resultados" agora é quase sempre instabilidade
    // do DataJud, não o processo sumindo — fica como erro pra ser tentado de novo.
    await store.atualizar("processos", processo.id, {
      ultimo_check: store.agora(),
      ultimo_erro: "A fonte não retornou o processo nesta consulta (já tinha andamentos antes — provável instabilidade; será tentado de novo)",
    });
  } else {
    // Nunca apareceu na fonte (tipicamente sigiloso): é uma característica do processo,
    // não uma falha — vira aviso e não entra na contagem de erros do painel.
    await store.atualizar("processos", processo.id, { ultimo_check: store.agora(), ultimo_erro: null, aviso_fonte: AVISO_FORA_DA_FONTE });
  }
}

/** Executa `fn` para cada item com no máximo `n` em paralelo. */
async function emParalelo<T>(itens: T[], fn: (item: T) => Promise<void>, n = 6) {
  const fila = [...itens];
  await Promise.all(Array.from({ length: Math.min(n, fila.length) }, async () => {
    for (let item = fila.shift(); item !== undefined; item = fila.shift()) await fn(item);
  }));
}

/** Máximo de processos por consulta ao DataJud — lotes menores pesam menos na fonte. */
const MAX_POR_CONSULTA = 25;
/** Pausa entre uma consulta e a próxima (a fonte do CNJ devolve 429 quando recebe consultas seguidas). */
const PAUSA_ENTRE_LOTES_MS = 8_000;
/** Depois de uma recusa por sobrecarga, espera mais antes de tentar o próximo lote. */
const PAUSA_APOS_SOBRECARGA_MS = 25_000;
/** Com tantas recusas seguidas na mesma rodada, para de insistir: o resto fica pra próxima passada. */
const MAX_SOBRECARGAS_SEGUIDAS = 2;

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Divide em partes iguais de no máximo `max` (42 → 21 + 21, em vez de 25 + 17). */
function fatiar<T>(lista: T[], max: number): T[][] {
  const partes = Math.ceil(lista.length / max);
  const tam = Math.ceil(lista.length / partes);
  return Array.from({ length: partes }, (_, i) => lista.slice(i * tam, (i + 1) * tam));
}

/**
 * Verificação via DataJud em lotes, UM DE CADA VEZ (v2.1, 12/11/2026). Antes eram todos os
 * tribunais em paralelo, com até 100 números por consulta e novas tentativas em sequência
 * rápida — o CNJ respondia 429 ("muitas consultas") em quase toda rodada (36 de 36 em
 * 11-12/11). Agora: lotes de até 25, em fila, com pausa entre eles; os processos checados
 * há mais tempo vão primeiro, e o que não couber na rodada fica pra próxima passada. Falha de
 * um lote vira UMA linha de erro no log, sem marcar cada processo como "com erro".
 */
async function sincronizarViaDataJudEmLote(processos: Processo[], prazoFinal: number) {
  let verificados = 0;
  let novas = 0;
  let pendentes = 0;
  const erros: string[] = [];
  const naoVerificados: string[] = []; // números dos processos que ficaram sem checar nesta rodada
  const grupos = new Map<string, Processo[]>();
  for (const p of processos) {
    const alias = p.tribunal || tribunalDoCnj(p.numero_cnj);
    if (!alias) {
      erros.push(`${p.numero_formatado}: não foi possível deduzir o tribunal`);
      continue;
    }
    grupos.set(alias, [...(grupos.get(alias) ?? []), p]);
  }
  // `processos` já vem do checado há mais tempo para o mais recente: o lote com o processo
  // mais "velho" vai primeiro, então quem ficou de fora numa rodada é o primeiro da próxima.
  const lotes = [...grupos]
    .flatMap(([alias, lista]) => fatiar(lista, MAX_POR_CONSULTA).map((parte) => [alias, parte] as const))
    .sort(([, a], [, b]) => (a[0].ultimo_check ?? "").localeCompare(b[0].ultimo_check ?? ""));

  const deixarParaDepois = (alias: string, lista: readonly Processo[], motivo: string) => {
    erros.push(`${alias.toUpperCase()} (${lista.length} processo(s) não verificados): ${motivo}`);
    pendentes += lista.length;
    naoVerificados.push(...lista.map((p) => p.numero_formatado));
  };

  let sobrecargasSeguidas = 0;
  for (let i = 0; i < lotes.length; i++) {
    const [alias, lista] = lotes[i];
    if (i > 0) await espera(sobrecargasSeguidas ? PAUSA_APOS_SOBRECARGA_MS : PAUSA_ENTRE_LOTES_MS);
    if (sobrecargasSeguidas >= MAX_SOBRECARGAS_SEGUIDAS || prazoFinal - Date.now() < 15_000) {
      // Para de insistir nesta rodada: junta o que sobrou numa linha por tribunal.
      const resto = new Map<string, Processo[]>();
      for (const [a, l] of lotes.slice(i)) resto.set(a, [...(resto.get(a) ?? []), ...l]);
      const motivo = sobrecargasSeguidas >= MAX_SOBRECARGAS_SEGUIDAS
        ? "a fonte do CNJ recusou as últimas consultas — fica para a próxima rodada, sem insistir"
        : "não coube no tempo desta rodada — fica para a próxima";
      for (const [a, l] of resto) deixarParaDepois(a, l, motivo);
      break;
    }
    let lote: ResultadoLote;
    try {
      lote = await datajud.consultarLote(alias, lista.map((p) => p.numero_cnj), { prazoFinal });
      sobrecargasSeguidas = 0;
    } catch (e) {
      sobrecargasSeguidas++;
      deixarParaDepois(alias, lista, e instanceof Error ? e.message : String(e));
      continue;
    }
    {
      await emParalelo(lista, async (p) => {
        const remoto = lote.encontrados.get(p.numero_cnj);
        try {
          if (remoto) {
            const n = await aplicarRemoto(p, remoto, "datajud");
            novas += n;
            verificados++;
          } else if (lote.parcial) {
            pendentes++; // resposta parcial: ausência não prova nada — tenta na próxima rodada
            naoVerificados.push(p.numero_formatado);
          } else {
            await registrarAusente(p);
            verificados++;
          }
        } catch (e) {
          erros.push(`${p.numero_formatado}: ${e instanceof Error ? e.message : String(e)}`);
          naoVerificados.push(p.numero_formatado);
        }
      });
    }
  }
  return { verificados, novas, erros, pendentes, naoVerificados };
}

const PAUSA_ENTRE_CONSULTAS_MS = 1200;

/** Caminho antigo, um processo por vez — só usado com provedor pago (Judit/Escavador), que não tem lote. */
async function sincronizarUmPorUm(processos: Processo[], prazoFinal: number) {
  let verificados = 0;
  let novas = 0;
  let tentados = 0;
  const erros: string[] = [];
  for (const p of processos) {
    if (Date.now() > prazoFinal) break;
    if (tentados > 0) await new Promise((r) => setTimeout(r, PAUSA_ENTRE_CONSULTAS_MS));
    tentados++;
    try {
      novas += await sincronizarProcesso(p);
      verificados++;
    } catch (e) {
      erros.push(`${p.numero_formatado}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { verificados, novas, erros, pendentes: processos.length - tentados, naoVerificados: processos.slice(tentados).map((p) => p.numero_formatado) };
}

/**
 * Sincroniza todos os ativos, grava log e dispara notificações.
 * Com o DataJud (padrão) a consulta é em lote — uma requisição por tribunal — e a carteira
 * inteira cabe numa rodada. `orcamentoMs` limita o tempo total: o que não couber (fonte fora
 * do ar ou lenta demais) fica como pendente no log e entra na próxima rodada. O log é sempre
 * fechado no `finally`, pra nunca ficar "em andamento" pra sempre.
 */
/**
 * Processo sem verificação bem-sucedida há mais que isso entra em "atrasados" e gera alerta.
 * v2.1: a consulta roda em duas janelas por dia (6h e 18h) — entre uma e outra são 12 h, então
 * só é atraso de verdade quando uma janela inteira falhou para o processo.
 */
export const LIMITE_ATRASO_H = 14;
/** Agendador: já verificado há menos que isso = feito nesta janela (passadas de 20 em 20 min). */
const JANELA_MS = 2 * 3_600_000;

export type ResultadoSincronizacao = {
  verificados: number;
  novas: number;
  erros: string[];
  pendentes: number;
  /** Números dos processos que ficaram sem checar nesta rodada. */
  naoVerificados: string[];
  /** Dos não verificados, os que já estavam sem verificação há mais de LIMITE_ATRASO_H horas. */
  atrasados: string[];
  /** Passada do agendador sem nada pendente nesta janela (não grava log). */
  nada?: boolean;
};

export async function sincronizarTudo(opts: { orcamentoMs?: number; soPendentesDaJanela?: boolean } = {}): Promise<ResultadoSincronizacao> {
  const prazoFinal = Date.now() + (opts.orcamentoMs ?? 240_000);
  let processos = (await store.listarProcessos({ apenasAtivos: true })).sort((a, b) => (a.ultimo_check ?? "").localeCompare(b.ultimo_check ?? ""));
  if (opts.soPendentesDaJanela) {
    // Robô 6h/18h: a 1ª passada da janela pega todos; as seguintes (20 e 40 min depois) só
    // o que a fonte recusou ou não coube. Sem nada pendente, não consulta nem grava log.
    const limite = Date.now() - JANELA_MS;
    processos = processos.filter((p) => !p.ultimo_check || new Date(p.ultimo_check).getTime() < limite);
    if (!processos.length) return { verificados: 0, novas: 0, erros: [], pendentes: 0, naoVerificados: [], atrasados: [], nada: true };
  }
  const logId = await store.iniciarSyncLog();

  let r: Omit<ResultadoSincronizacao, "atrasados"> = {
    verificados: 0, novas: 0, erros: [], pendentes: processos.length, naoVerificados: processos.map((p) => p.numero_formatado),
  };
  let atrasados: string[] = [];
  let explicacao: { explicados: number; erros: string[] } = { explicados: 0, erros: [] };
  try {
    r = provedorDeProcesso().nome === "datajud"
      ? await sincronizarViaDataJudEmLote(processos, prazoFinal)
      : await sincronizarUmPorUm(processos, prazoFinal);
    // v2.0: explicação dos andamentos novos (IA), com o tempo que sobrou da rodada (+40 s de
    // folga dentro do limite de 300 s da rota). O que não couber fica para a próxima rodada.
    // Falha aqui nunca derruba a atualização nem conta como erro do CNJ.
    explicacao = await explicarPendentes(prazoFinal + 40_000).catch((e) => ({
      explicados: 0,
      erros: [`Explicação dos andamentos: ${e instanceof Error ? e.message : String(e)}`],
    }));
  } catch (e) {
    r.erros.push(`Falha geral na atualização: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    // Atrasado = não foi checado agora E a última checagem bem-sucedida já passou do limite.
    // Fica de fora quem nunca aparece na fonte (aviso_fonte, ex.: sigiloso): só conta como
    // checado quando o tribunal responde 100%, então com o CNJ instável parecia "atrasado"
    // sem haver nada pra buscar — gerou falso alarme em 05/11/2026 às 08h.
    const limite = Date.now() - LIMITE_ATRASO_H * 3_600_000;
    const pendentes = new Set(r.naoVerificados);
    atrasados = processos
      .filter((p) => !p.aviso_fonte)
      .filter((p) => pendentes.has(p.numero_formatado) && (!p.ultimo_check || new Date(p.ultimo_check).getTime() < limite))
      .map((p) => p.numero_formatado);
    const notificados = await notificarPendentes().catch(() => 0);
    await store.finalizarSyncLog(logId, {
      processos_verificados: r.verificados,
      novas_movimentacoes: r.novas,
      erros: r.erros.length,
      detalhes: { erros: r.erros, notificados, pendentes: r.pendentes, parcial: r.pendentes > 0, nao_verificados: r.naoVerificados, atrasados, explicados: explicacao.explicados, erros_explicacao: explicacao.erros },
    });
  }
  return { ...r, atrasados };
}
