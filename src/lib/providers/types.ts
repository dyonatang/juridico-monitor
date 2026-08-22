/**
 * Contrato comum dos provedores de dados processuais.
 *
 *  - DataJud (CNJ): gratuito; consulta SOMENTE por número CNJ.
 *  - Judit.io / Escavador: pagos; consultam e monitoram por CPF/CNPJ e CNJ.
 */

export type MovimentacaoRemota = {
  dataHora: string; // ISO
  codigo?: number | null;
  descricao: string;
  complemento?: string | null;
};

export type ProcessoRemoto = {
  numeroCnj: string; // 20 dígitos
  tribunal?: string | null;
  classe?: string | null;
  assunto?: string | null;
  orgaoJulgador?: string | null;
  grau?: string | null;
  dataAjuizamento?: string | null; // ISO date
  poloAtivo?: string | null;
  poloPassivo?: string | null;
  valorCausa?: number | null;
  situacao?: string | null;
  movimentacoes: MovimentacaoRemota[];
};

export interface ProcessoProvider {
  readonly nome: "datajud" | "judit" | "escavador";
  /** Capa + movimentações de um processo. `null` se não encontrado. */
  consultarProcesso(numeroCnj: string): Promise<ProcessoRemoto | null>;
  /** Lista processos em que o CPF/CNPJ é parte (só provedores pagos). */
  buscarPorDocumento?(tipo: "CPF" | "CNPJ", numero: string): Promise<ProcessoRemoto[]>;
  /** Cria monitoramento contínuo no provedor; retorna id do tracking. */
  criarMonitoramento?(alvo: { tipo: "CPF" | "CNPJ" | "CNJ"; valor: string }, callbackUrl: string): Promise<string>;
  /** Remove monitoramento no provedor. */
  removerMonitoramento?(trackingId: string): Promise<void>;
}
