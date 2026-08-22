import { somenteDigitos, formatarCnj } from "@/lib/format";
import type { ProcessoProvider, ProcessoRemoto } from "./types";

/**
 * Escavador Business API v2 — https://api.escavador.com/v2/docs/
 * Base:   https://api.escavador.com/api/v2
 * Header: Authorization: Bearer <ESCAVADOR_TOKEN>
 *
 * Requer contratação (escavador.com/business/api). Sem ESCAVADOR_TOKEN o provedor fica inativo.
 * ATENÇÃO: o formato exato do payload de monitoramento/callback deve ser confirmado
 * na documentação do plano contratado; os campos abaixo seguem a doc pública v2.
 */

type EscProcesso = {
  numero_cnj: string;
  titulo_polo_ativo?: string;
  titulo_polo_passivo?: string;
  ano_inicio?: number;
  data_inicio?: string;
  estado_origem?: { sigla?: string };
  unidade_origem?: { tribunal_sigla?: string; nome?: string };
  fontes?: {
    sigla?: string;
    grau?: number;
    capa?: {
      classe?: string;
      assunto?: string;
      orgao_julgador?: string;
      valor_causa?: { valor?: string; valor_formatado?: string };
      situacao?: string;
      data_distribuicao?: string;
    };
  }[];
};
type EscMov = { id?: number; data: string; tipo?: string; conteudo: string; fonte?: { sigla?: string } };

export class EscavadorProvider implements ProcessoProvider {
  readonly nome = "escavador" as const;
  private token: string;
  private base = "https://api.escavador.com/api/v2";

  constructor() {
    const t = process.env.ESCAVADOR_TOKEN;
    if (!t) throw new Error("ESCAVADOR_TOKEN não configurado");
    this.token = t;
  }

  private async req<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
        ...(init.headers ?? {}),
      },
      cache: "no-store",
    });
    if (res.status === 404) return null as T;
    if (!res.ok) throw new Error(`Escavador ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return (await res.json()) as T;
  }

  private capa(p: EscProcesso) {
    const f = p.fontes?.find((x) => x.capa) ?? p.fontes?.[0];
    return { f, c: f?.capa };
  }

  async consultarProcesso(numeroCnj: string): Promise<ProcessoRemoto | null> {
    const cnj = formatarCnj(numeroCnj);
    const p = await this.req<EscProcesso | null>(`/processos/${cnj}`);
    if (!p) return null;
    const movs = await this.req<{ items?: EscMov[] } | null>(`/processos/${cnj}/movimentacoes?limit=100`);
    const { f, c } = this.capa(p);
    const valor = c?.valor_causa?.valor ? Number(c.valor_causa.valor) : null;
    return {
      numeroCnj: somenteDigitos(p.numero_cnj),
      tribunal: (f?.sigla ?? p.unidade_origem?.tribunal_sigla)?.toLowerCase() ?? null,
      classe: c?.classe ?? null,
      assunto: c?.assunto ?? null,
      orgaoJulgador: c?.orgao_julgador ?? p.unidade_origem?.nome ?? null,
      grau: f?.grau ? `G${f.grau}` : null,
      dataAjuizamento: (c?.data_distribuicao ?? p.data_inicio)?.slice(0, 10) ?? null,
      poloAtivo: p.titulo_polo_ativo ?? null,
      poloPassivo: p.titulo_polo_passivo ?? null,
      valorCausa: valor && !isNaN(valor) ? valor : null,
      situacao: c?.situacao ?? null,
      movimentacoes: (movs?.items ?? []).map((m) => ({
        dataHora: m.data,
        descricao: m.conteudo,
        complemento: m.tipo ?? null,
      })),
    };
  }

  async buscarPorDocumento(_tipo: "CPF" | "CNPJ", numero: string): Promise<ProcessoRemoto[]> {
    const data = await this.req<{ items?: EscProcesso[] } | null>(
      `/envolvido/processos?cpf_cnpj=${somenteDigitos(numero)}&limit=100`,
    );
    const out: ProcessoRemoto[] = [];
    for (const p of data?.items ?? []) {
      const { f, c } = this.capa(p);
      out.push({
        numeroCnj: somenteDigitos(p.numero_cnj),
        tribunal: (f?.sigla ?? p.unidade_origem?.tribunal_sigla)?.toLowerCase() ?? null,
        classe: c?.classe ?? null,
        assunto: c?.assunto ?? null,
        orgaoJulgador: c?.orgao_julgador ?? null,
        dataAjuizamento: (c?.data_distribuicao ?? p.data_inicio)?.slice(0, 10) ?? null,
        poloAtivo: p.titulo_polo_ativo ?? null,
        poloPassivo: p.titulo_polo_passivo ?? null,
        movimentacoes: [], // buscadas depois via consultarProcesso
      });
    }
    return out;
  }

  async criarMonitoramento(alvo: { tipo: "CPF" | "CNPJ" | "CNJ"; valor: string }, callbackUrl: string) {
    const body =
      alvo.tipo === "CNJ"
        ? { tipo: "UNICO", valor: formatarCnj(alvo.valor), callback_url: callbackUrl }
        : { tipo: "NUMDOC", valor: somenteDigitos(alvo.valor), callback_url: callbackUrl };
    const r = await this.req<{ id: number | string }>(`/monitoramentos`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return String(r.id);
  }

  async removerMonitoramento(trackingId: string) {
    await this.req(`/monitoramentos/${trackingId}`, { method: "DELETE" });
  }
}
