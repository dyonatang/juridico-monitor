import { createHash } from "node:crypto";
import * as store from "./store";
import { formatarCnj, somenteDigitos, tribunalDoCnj, fmtDataHora } from "./format";
import { datajud, provedorDeProcesso, type ProcessoRemoto } from "./providers";
import type { Processo } from "./types";
import { notificarPendentes } from "./notify";

const hashMov = (m: { dataHora: string; codigo?: number | null; descricao: string; complemento?: string | null }) =>
  createHash("sha256")
    .update(`${m.dataHora}|${m.codigo ?? ""}|${m.descricao}|${m.complemento ?? ""}`)
    .digest("hex");

/** Garante que o processo exista. Se for novo e "descoberto", gera alerta de novo processo. */
export async function upsertProcessoRemoto(
  remoto: ProcessoRemoto,
  meta: {
    origem: "manual" | "descoberto";
    empresa_id?: string | null;
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
    empresa_id: meta.empresa_id ?? null,
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
  const capa: Record<string, unknown> = { ultimo_check: store.agora(), ultimo_erro: null };
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
      await store.atualizar("processos", processo.id, { ultimo_check: store.agora(), ultimo_erro: "Processo não encontrado na fonte" });
      return 0;
    }
    return await aplicarRemoto(processo, remoto, provider.nome);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await store.atualizar("processos", processo.id, { ultimo_check: store.agora(), ultimo_erro: msg });
    throw e;
  }
}

/** Sincroniza todos os ativos, grava log e dispara notificações. */
export async function sincronizarTudo(): Promise<{ verificados: number; novas: number; erros: string[] }> {
  const logId = await store.iniciarSyncLog();
  const processos = (await store.listarProcessos({ apenasAtivos: true })).sort((a, b) => (a.ultimo_check ?? "").localeCompare(b.ultimo_check ?? ""));

  let verificados = 0;
  let novas = 0;
  const erros: string[] = [];
  for (const p of processos) {
    try {
      novas += await sincronizarProcesso(p);
      verificados++;
    } catch (e) {
      erros.push(`${p.numero_formatado}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const notificados = await notificarPendentes();
  await store.finalizarSyncLog(logId, { processos_verificados: verificados, novas_movimentacoes: novas, erros: erros.length, detalhes: { erros, notificados } });
  return { verificados, novas, erros };
}
