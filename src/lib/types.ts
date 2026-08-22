export type Empresa = {
  id: string;
  nome: string;
  cnpj: string | null;
  apelido: string | null;
  ativo: boolean;
  created_at: string;
};

export type DocumentoMonitorado = {
  id: string; // = numero (só dígitos)
  tipo: "CPF" | "CNPJ";
  numero: string;
  nome: string;
  empresa_id: string | null;
  observacao: string | null;
  ativo: boolean;
  provider: string | null;
  provider_tracking_id: string | null;
  ultimo_check: string | null;
  ultimo_erro: string | null;
  created_at: string;
};

export type Processo = {
  id: string; // = numero_cnj (20 dígitos)
  numero_cnj: string;
  numero_formatado: string;
  tribunal: string | null;
  classe: string | null;
  assunto: string | null;
  orgao_julgador: string | null;
  grau: string | null;
  data_ajuizamento: string | null;
  polo_ativo: string | null;
  polo_passivo: string | null;
  valor_causa: number | null;
  situacao: string | null;
  descricao: string | null;
  empresa_id: string | null;
  documento_id: string | null;
  origem: "manual" | "descoberto";
  provider: string | null;
  provider_tracking_id: string | null;
  ativo: boolean;
  total_movimentacoes: number;
  ultima_movimentacao_em: string | null;
  ultimo_check: string | null;
  ultimo_erro: string | null;
  created_at: string;
};

export type Movimentacao = {
  id: string;
  processo_id: string;
  data_hora: string;
  codigo: number | null;
  descricao: string;
  complemento: string | null;
  fonte: string;
  hash: string;
  created_at: string;
};

export type Alerta = {
  id: string;
  tipo: "nova_movimentacao" | "novo_processo" | "erro" | "documento_importado";
  processo_id: string | null;
  documento_id: string | null;
  movimentacao_id: string | null;
  titulo: string;
  mensagem: string;
  lido: boolean;
  notificado_em: string | null;
  created_at: string;
};

export type ResultadoProcessoImportado = {
  numero: string;
  numero_formatado: string;
  criado: boolean;
  novas: number;
  erro: string | null;
};

export type Arquivo = {
  id: string;
  nome: string;
  tamanho: number;
  storage_path: string;
  empresa_id: string | null;
  documento_id: string | null;
  vinculo: string | null; // como o sistema ligou o PDF a uma empresa/documento
  processos: string[]; // números CNJ (20 dígitos)
  resultado: ResultadoProcessoImportado[];
  analise: import("./leitor").Analise | null;
  texto_preview: string;
  avisos: string[];
  status: "ok" | "sem_processo";
  origem?: "upload" | "jusbr";
  mime?: string;
  jusbr?: { idCodex: string; idOrigem: string | null; tipo: string | null; dataHoraJuntada: string | null; sigilo: string | null };
  created_at: string;
};

export type Papel = "admin" | "leitura";

export type Usuario = {
  id: string; // = login
  login: string;
  nome: string;
  papel: Papel;
  senha_hash: string | null;
  ativo: boolean;
  ultimo_acesso: string | null;
  created_at: string;
};
