import { somenteDigitos, formatarCnj } from "@/lib/format";
import type { ProcessoProvider, ProcessoRemoto } from "./types";

/**
 * Judit.io — https://docs.judit.io
 *   requests: https://requests.production.judit.io   (consultas assíncronas)
 *   tracking: https://tracking.production.judit.io   (monitoramento contínuo + webhook)
 *   lawsuits: https://lawsuits.production.judit.io   (consulta síncrona ao datalake)
 * Header: api-key: <JUDIT_API_KEY>
 *
 * Requer contratação (judit.io/planos-api). Sem JUDIT_API_KEY o provedor fica inativo.
 */

export type JuditLawsuit = {
  code: string; // número CNJ formatado
  name?: string;
  tribunal_acronym?: string;
  instance?: number;
  distribution_date?: string;
  status?: string;
  phase?: string;
  amount?: number;
  county?: string;
  subjects?: { name?: string }[] | string[];
  classifications?: { name?: string }[] | string[];
  steps?: { step_id?: string; step_date: string; content: string }[];
  parties?: { name: string; side?: string; main_document?: string }[];
};

export function juditParaRemoto(l: JuditLawsuit): ProcessoRemoto {
  const nomes = (arr?: ({ name?: string } | string)[]) =>
    arr?.map((x) => (typeof x === "string" ? x : x.name)).filter(Boolean).join("; ") || null;
  const lado = (s?: string) => (s ?? "").toLowerCase();
  const ativo = l.parties?.filter((p) => lado(p.side).startsWith("act") || lado(p.side) === "autor");
  const passivo = l.parties?.filter((p) => lado(p.side).startsWith("pass") || lado(p.side) === "réu");
  return {
    numeroCnj: somenteDigitos(l.code),
    tribunal: l.tribunal_acronym?.toLowerCase() ?? null,
    classe: nomes(l.classifications),
    assunto: nomes(l.subjects),
    orgaoJulgador: l.county ?? null,
    grau: l.instance ? `G${l.instance}` : null,
    dataAjuizamento: l.distribution_date?.slice(0, 10) ?? null,
    poloAtivo: ativo?.map((p) => p.name).join("; ") || null,
    poloPassivo: passivo?.map((p) => p.name).join("; ") || null,
    valorCausa: l.amount ?? null,
    situacao: [l.status, l.phase].filter(Boolean).join(" / ") || null,
    movimentacoes: (l.steps ?? []).map((s) => ({
      dataHora: s.step_date,
      descricao: s.content,
    })),
  };
}

export class JuditProvider implements ProcessoProvider {
  readonly nome = "judit" as const;
  private key: string;

  constructor() {
    const key = process.env.JUDIT_API_KEY;
    if (!key) throw new Error("JUDIT_API_KEY não configurada");
    this.key = key;
  }

  private async req<T>(url: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", "api-key": this.key, ...(init.headers ?? {}) },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Judit ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return (await res.json()) as T;
  }

  /** Consulta síncrona ao datalake (não vai ao tribunal; dados já coletados). */
  async consultarProcesso(numeroCnj: string): Promise<ProcessoRemoto | null> {
    const cnj = formatarCnj(numeroCnj);
    const data = await this.req<{ page_data?: JuditLawsuit[] }>(
      `https://lawsuits.production.judit.io/lawsuits?search_type=lawsuit_cnj&search_key=${encodeURIComponent(cnj)}&page_size=5`,
    );
    const l = data.page_data?.[0];
    return l ? juditParaRemoto(l) : null;
  }

  async buscarPorDocumento(tipo: "CPF" | "CNPJ", numero: string): Promise<ProcessoRemoto[]> {
    const data = await this.req<{ page_data?: JuditLawsuit[] }>(
      `https://lawsuits.production.judit.io/lawsuits?search_type=${tipo.toLowerCase()}&search_key=${somenteDigitos(numero)}&page_size=100`,
    );
    return (data.page_data ?? []).map(juditParaRemoto);
  }

  async criarMonitoramento(alvo: { tipo: "CPF" | "CNPJ" | "CNJ"; valor: string }, callbackUrl: string) {
    const search_type = alvo.tipo === "CNJ" ? "lawsuit_cnj" : alvo.tipo.toLowerCase();
    const search_key = alvo.tipo === "CNJ" ? formatarCnj(alvo.valor) : somenteDigitos(alvo.valor);
    const r = await this.req<{ tracking_id: string }>("https://tracking.production.judit.io/tracking", {
      method: "POST",
      body: JSON.stringify({
        recurrence: Number(process.env.JUDIT_RECURRENCE_DAYS || 1),
        search: { search_type, search_key },
        callback_url: callbackUrl,
      }),
    });
    return r.tracking_id;
  }

  async removerMonitoramento(trackingId: string) {
    await this.req(`https://tracking.production.judit.io/tracking/${trackingId}`, { method: "DELETE" });
  }
}
