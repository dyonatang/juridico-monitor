export type DocumentoMonitorado = {
  id: string; // = numero (só dígitos)
  tipo: "CPF" | "CNPJ";
  numero: string;
  nome: string;
  apelido: string | null; // nome curto de exibição (ex.: "Caranguejo do Assis" pra um CNPJ)
  vinculo_id: string | null; // id de outro documento (tipicamente um CNPJ) ao qual este está associado
  observacao: string | null;
  ativo: boolean;
  provider: string | null;
  provider_tracking_id: string | null;
  ultimo_check: string | null;
  ultimo_erro: string | null;
  created_at: string;
};

export type PontoControvertido = {
  id: string;
  texto: string; // o que precisa ser provado/decidido (ex.: "se a requerida emitiu os cheques")
  status: "pendente" | "favoravel" | "desfavoravel"; // favoravel/desfavoravel = já resolvido, a favor/contra o nosso lado
  created_at: string;
};

export type Prazo = {
  id: string;
  data: string; // AAAA-MM-DD
  descricao: string; // ex.: "Audiência una — comparecer com preposto"
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
  resumo_status: string | null; // resumo em linguagem simples de como está o processo, tipo advogado explicando pro cliente
  classificacao_risco: "provavel" | "possivel" | "remoto" | null; // avaliação de risco (CPC 25), definida manualmente
  valor_provisionado: number | null; // valor provisionado contabilmente pra esse processo
  pontos_controvertidos: PontoControvertido[] | null; // o que ainda falta provar/decidir nesse processo
  proximos_prazos: Prazo[] | null; // audiências e prazos com data marcada
  descricao: string | null;
  documento_id: string | null;
  origem: "manual" | "descoberto";
  provider: string | null;
  provider_tracking_id: string | null;
  ativo: boolean;
  total_movimentacoes: number;
  ultima_movimentacao_em: string | null;
  ultimo_check: string | null;
  ultimo_erro: string | null;
  aviso_fonte?: string | null; // observação sobre a fonte que NÃO é erro (ex.: processo sigiloso, fora do DataJud)
  djen_check?: string | null; // última consulta bem-sucedida ao Diário de Justiça Eletrônico Nacional
  djen_erro?: string | null;
  ficha?: import("./explicador").Ficha | null; // v2.0: resumo do caso gerado pela IA sob demanda
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
  // v2.0: explicação em linguagem simples (IA), gravada depois da atualização
  explicacao?: string | null;
  o_que_fazer?: string | null;
  importancia?: "alta" | "media" | "baixa" | null;
  explicado_em?: string | null;
};

export type Alerta = {
  id: string;
  tipo: "nova_movimentacao" | "novo_processo" | "erro" | "documento_importado" | "publicacao";
  processo_id: string | null;
  documento_id: string | null;
  movimentacao_id: string | null;
  publicacao_id?: string | null; // robô de publicações (DJEN)
  titulo: string;
  mensagem: string;
  explicacao?: string | null; // v2.0: copiada do andamento quando a IA explica
  o_que_fazer?: string | null;
  importancia?: "alta" | "media" | "baixa" | null;
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

/**
 * Publicação/intimação do Diário de Justiça Eletrônico Nacional (DJEN, CNJ) — com o TEXTO do
 * ato, que o DataJud não traz. Id = hash de processo + data + texto (a mesma intimação vem
 * repetida para cada destinatário).
 */
export type Publicacao = {
  id: string;
  processo_id: string;
  djen_id: number;
  data_disponibilizacao: string; // AAAA-MM-DD
  tipo_comunicacao: string | null; // ex.: "Intimação"
  tipo_documento: string | null; // ex.: "Despacho", "Sentença"
  orgao: string | null;
  texto: string;
  link: string | null;
  destinatarios: string[]; // só nomes
  explicacao?: string | null;
  o_que_fazer?: string | null;
  prazo?: string | null; // como o texto da IA descreve o prazo; null se não houver
  importancia?: "alta" | "media" | "baixa" | null;
  explicado_em?: string | null;
  created_at: string;
};
