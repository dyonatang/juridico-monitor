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
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

export class DataJudProvider implements ProcessoProvider {
  readonly nome = "datajud" as const;

  /** POST com timeout e novas tentativas em 429/5xx/timeout (o DataJud fica sobrecarregado com frequência). */
  private async buscar(alias: string, digits: string): Promise<DataJudResposta> {
    const url = `https://api-publica.datajud.cnj.jus.br/api_publica_${alias}/_search`;
    let ultimoErro = "";
    for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `APIKey ${process.env.DATAJUD_API_KEY || CHAVE_PUBLICA_CNJ}`,
          },
          body: JSON.stringify({ size: 20, query: { match: { numeroProcesso: digits } } }),
          cache: "no-store",
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (e) {
        const nome = e instanceof Error ? e.name : "";
        ultimoErro = nome === "TimeoutError" || nome === "AbortError" ? `DataJud ${alias} não respondeu em ${TIMEOUT_MS / 1000}s` : `DataJud ${alias}: falha de rede`;
        if (tentativa < TENTATIVAS) await espera(3000 * tentativa ** 2);
        continue;
      }
      if (res.ok) return (await res.json()) as DataJudResposta;
      const corpo = (await res.text()).slice(0, 200);
      if (res.status !== 429 && res.status < 500) throw new Error(`DataJud ${alias} respondeu ${res.status}: ${corpo}`);
      ultimoErro = `DataJud ${alias} respondeu ${res.status} (sobrecarga)`;
      const retryAfter = Number(res.headers.get("retry-after"));
      if (tentativa < TENTATIVAS) await espera(retryAfter > 0 ? Math.min(retryAfter, 30) * 1000 : 3000 * tentativa ** 2);
    }
    throw new DataJudIndisponivel(`${ultimoErro} — ${TENTATIVAS} tentativas; tentar de novo mais tarde`);
  }

  async consultarProcesso(numeroCnj: string, tribunalAlias?: string | null): Promise<ProcessoRemoto | null> {
    const digits = somenteDigitos(numeroCnj);
    const alias = tribunalAlias || tribunalDoCnj(digits);
    if (!alias) throw new Error(`Não foi possível deduzir o tribunal do número ${numeroCnj}`);

    const json = await this.buscar(alias, digits);
    // Sob carga o DataJud pode responder 200 com resultado parcial (timed_out / shards
    // com falha) e zero hits — isso não quer dizer que o processo não existe.
    if (json.timed_out || (json._shards?.failed ?? 0) > 0) {
      throw new DataJudIndisponivel(`DataJud ${alias} respondeu com resultado parcial (sobrecarga) — tentar de novo mais tarde`);
    }
    const hits = json.hits?.hits ?? [];
    if (hits.length === 0) return null;

    // O DataJud retorna um "hit" por instância/grau; mesclamos tudo.
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
}
