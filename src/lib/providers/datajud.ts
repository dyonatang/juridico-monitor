import { somenteDigitos, tribunalDoCnj } from "@/lib/format";
import type { ProcessoProvider, ProcessoRemoto, MovimentacaoRemota } from "./types";

/**
 * API Pública do DataJud (CNJ).
 * Endpoint: https://api-publica.datajud.cnj.jus.br/api_publica_<tribunal>/_search
 * Header:   Authorization: APIKey <chave pública divulgada pelo CNJ>
 *
 * A chave pública abaixo é a divulgada na wiki do CNJ; pode ser trocada
 * pela variável DATAJUD_API_KEY caso o CNJ a rotacione.
 */
const CHAVE_PUBLICA_CNJ = "cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==";

/** O DataJud às vezes manda "2025-08-14T..." (ISO) e às vezes "20250814150000" (só dígitos) — normaliza pros dois casos. */
function normalizarDataAjuizamento(raw?: string): string | null {
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const digitos = raw.replace(/\D/g, "");
  return digitos.length >= 8 ? `${digitos.slice(0, 4)}-${digitos.slice(4, 6)}-${digitos.slice(6, 8)}` : null;
}

const TIMEOUT_MS = 40_000;
const TENTATIVAS = 3;
/** Uma consulta em lote leva quase o mesmo tempo que uma individual (~30-40s), mas precisa de folga. */
const TIMEOUT_LOTE_MS = 90_000;
/** Números por requisição em lote — cada processo pode vir em vários "hits" (um por grau). */
const MAX_POR_LOTE = 100;
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type ResultadoLote = {
  /** Processos encontrados, por número CNJ (20 dígitos). */
  encontrados: Map<string, ProcessoRemoto>;
  /** true se a fonte respondeu com resultado parcial — ausentes NÃO significam "não existe". */
  parcial: boolean;
};

/** Erro passageiro da fonte (sobrecarga, timeout) — diferente de "o processo não existe lá". */
export class DataJudIndisponivel extends Error {}

type DataJudHit = {
  _source: {
    numeroProcesso: string;
    tribunal?: string;
    grau?: string;
    dataAjuizamento?: string;
    classe?: { codigo?: number; nome?: string };
    orgaoJulgador?: { nome?: string };
    assuntos?: { codigo?: number; nome?: string }[];
    movimentos?: {
      codigo?: number;
      nome?: string;
      dataHora?: string;
      complementosTabelados?: { nome?: string; descricao?: string; valor?: number }[];
    }[];
  };
};

type DataJudResposta = { timed_out?: boolean; _shards?: { failed?: number }; hits?: { hits?: DataJudHit[] } };

const resultadoParcial = (json: DataJudResposta) => !!json.timed_out || (json._shards?.failed ?? 0) > 0;

/** Junta os "hits" de um mesmo processo (o DataJud retorna um por instância/grau) num ProcessoRemoto. */
function montarRemoto(alias: string, digits: string, hits: DataJudHit[]): ProcessoRemoto {
  const capa = hits[0]._source;
  const movs = new Map<string, MovimentacaoRemota>();
  let grauMaisAlto = capa.grau ?? null;
  for (const h of hits) {
    const s = h._source;
    if (s.grau && s.grau > (grauMaisAlto ?? "")) grauMaisAlto = s.grau;
    for (const m of s.movimentos ?? []) {
      if (!m.dataHora || !m.nome) continue;
      const complemento =
        m.complementosTabelados?.map((c) => [c.nome, c.descricao].filter(Boolean).join(": ")).join("; ") ||
        null;
      const key = `${m.dataHora}|${m.codigo ?? ""}|${m.nome}|${complemento ?? ""}`;
      if (!movs.has(key)) {
        movs.set(key, {
          dataHora: m.dataHora,
          codigo: m.codigo ?? null,
          descricao: s.grau && hits.length > 1 ? `[${s.grau}] ${m.nome}` : m.nome,
          complemento,
        });
      }
    }
  }

  return {
    numeroCnj: digits,
    tribunal: alias,
    classe: capa.classe?.nome ?? null,
    assunto: capa.assuntos?.map((a) => a.nome).filter(Boolean).join("; ") || null,
    orgaoJulgador: capa.orgaoJulgador?.nome ?? null,
    grau: grauMaisAlto,
    dataAjuizamento: normalizarDataAjuizamento(capa.dataAjuizamento),
    // DataJud não expõe partes (Portaria CNJ 160/2020) — ficam em branco.
    poloAtivo: null,
    poloPassivo: null,
    movimentacoes: [...movs.values()].sort((a, b) => a.dataHora.localeCompare(b.dataHora)),
  };
}

export class DataJudProvider implements ProcessoProvider {
  readonly nome = "datajud" as const;

  /**
   * POST com timeout e novas tentativas em 429/5xx/timeout (o DataJud fica sobrecarregado com frequência).
   * Com `prazoFinal` (epoch ms), não começa tentativa que não caberia no tempo restante.
   */
  private async buscar(
    alias: string,
    corpo: object,
    opts: { timeoutMs?: number; prazoFinal?: number } = {},
  ): Promise<DataJudResposta> {
    const url = `https://api-publica.datajud.cnj.jus.br/api_publica_${alias}/_search`;
    const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
    let ultimoErro = "";
    for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
      const restante = opts.prazoFinal ? opts.prazoFinal - Date.now() : timeoutMs;
      if (restante < 10_000) {
        ultimoErro ||= `DataJud ${alias}: sem tempo para consultar nesta rodada`;
        break;
      }
      const limite = Math.min(timeoutMs, restante);
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `APIKey ${process.env.DATAJUD_API_KEY || CHAVE_PUBLICA_CNJ}`,
          },
          body: JSON.stringify(corpo),
          cache: "no-store",
          signal: AbortSignal.timeout(limite),
        });
      } catch (e) {
        const nome = e instanceof Error ? e.name : "";
        ultimoErro = nome === "TimeoutError" || nome === "AbortError" ? `DataJud ${alias} não respondeu em ${Math.round(limite / 1000)}s` : `DataJud ${alias}: falha de rede`;
        if (tentativa < TENTATIVAS) await espera(3000 * tentativa ** 2);
        continue;
      }
      if (res.ok) return (await res.json()) as DataJudResposta;
      const texto = (await res.text()).slice(0, 200);
      if (res.status !== 429 && res.status < 500) throw new Error(`DataJud ${alias} respondeu ${res.status}: ${texto}`);
      ultimoErro = `DataJud ${alias} respondeu ${res.status} (sobrecarga)`;
      const retryAfter = Number(res.headers.get("retry-after"));
      if (tentativa < TENTATIVAS) await espera(retryAfter > 0 ? Math.min(retryAfter, 30) * 1000 : 3000 * tentativa ** 2);
    }
    throw new DataJudIndisponivel(`${ultimoErro} — tentar de novo mais tarde`);
  }

  async consultarProcesso(numeroCnj: string, tribunalAlias?: string | null): Promise<ProcessoRemoto | null> {
    const digits = somenteDigitos(numeroCnj);
    const alias = tribunalAlias || tribunalDoCnj(digits);
    if (!alias) throw new Error(`Não foi possível deduzir o tribunal do número ${numeroCnj}`);

    const json = await this.buscar(alias, { size: 20, query: { match: { numeroProcesso: digits } } });
    // Sob carga o DataJud pode responder 200 com resultado parcial (timed_out / shards
    // com falha) e zero hits — isso não quer dizer que o processo não existe.
    if (resultadoParcial(json)) {
      throw new DataJudIndisponivel(`DataJud ${alias} respondeu com resultado parcial (sobrecarga) — tentar de novo mais tarde`);
    }
    const hits = json.hits?.hits ?? [];
    return hits.length ? montarRemoto(alias, digits, hits) : null;
  }

  /**
   * Consulta vários processos do MESMO tribunal numa só requisição. O DataJud demora quase o
   * mesmo para 1 ou para 40 números (~30-40s), então isso é o que torna viável verificar a
   * carteira inteira de uma vez — consultando um por um, cada rodada só cobria 1-3 processos.
   */
  async consultarLote(alias: string, numeros: string[], opts: { prazoFinal?: number } = {}): Promise<ResultadoLote> {
    const encontrados = new Map<string, ProcessoRemoto>();
    let parcial = false;
    let parcialFinal = false;
    const unicos = [...new Set(numeros.map(somenteDigitos))];
    for (let i = 0; i < unicos.length; i += MAX_POR_LOTE) {
      let faltando = unicos.slice(i, i + MAX_POR_LOTE);
      // Sob carga o DataJud devolve resposta parcial (alguns shards falham) e só parte dos
      // processos vem. Repete a consulta só com os que faltaram, enquanto houver tempo.
      for (let passada = 1; faltando.length > 0; passada++) {
        let json: DataJudResposta;
        try {
          json = await this.buscar(
            alias,
            { size: Math.min(faltando.length * 6, 1000), query: { terms: { numeroProcesso: faltando } } },
            { timeoutMs: TIMEOUT_LOTE_MS, prazoFinal: opts.prazoFinal },
          );
        } catch (e) {
          // Nova passada falhou mas a anterior já trouxe parte: devolve o que tem como parcial.
          if (passada > 1 && e instanceof DataJudIndisponivel) break;
          throw e;
        }
        const porNumero = new Map<string, DataJudHit[]>();
        for (const h of json.hits?.hits ?? []) {
          const n = somenteDigitos(h._source.numeroProcesso ?? "");
          if (!faltando.includes(n)) continue;
          porNumero.set(n, [...(porNumero.get(n) ?? []), h]);
        }
        for (const [n, hits] of porNumero) encontrados.set(n, montarRemoto(alias, n, hits));
        faltando = faltando.filter((n) => !encontrados.has(n));
        parcial = resultadoParcial(json);
        if (!parcial || passada >= TENTATIVAS) break;
        await espera(2000);
      }
      if (faltando.length && parcial) parcialFinal = true;
    }
    return { encontrados, parcial: parcialFinal };
  }
}
