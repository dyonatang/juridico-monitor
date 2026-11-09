/** Fases de um processo, em ordem. A IA classifica cada processo numa delas (ficha ou relatório). */
export const FASES = ["inicial", "instrucao", "sentenca", "recurso", "execucao", "encerrado"] as const;
export type Fase = (typeof FASES)[number] | "indefinida";

export const FASE_ROTULO: Record<Fase, string> = {
  inicial: "Início e citação",
  instrucao: "Provas e audiências",
  sentenca: "Sentença",
  recurso: "Recurso",
  execucao: "Execução / cobrança",
  encerrado: "Encerrado / arquivado",
  indefinida: "Sem dados suficientes",
};

/** Rampa ordinal (azul claro → escuro) — `--o7` é o cinza de "sem dados". */
export const FASE_COR: Record<Fase, string> = {
  inicial: "var(--o1)",
  instrucao: "var(--o2)",
  sentenca: "var(--o3)",
  recurso: "var(--o4)",
  execucao: "var(--o5)",
  encerrado: "var(--o6)",
  indefinida: "var(--o7)",
};

export const FASE_DESCRICAO = `Fases possíveis (escolha UMA):
- inicial: ação proposta, citação/intimação inicial, prazo de defesa;
- instrucao: produção de provas, perícia, audiências de instrução/conciliação;
- sentenca: concluso para sentença ou sentença recém-proferida, prazo de recurso correndo;
- recurso: recurso em andamento (apelação, recurso ordinário/revista, agravo) em qualquer tribunal;
- execucao: cumprimento de sentença, execução, penhora, bloqueio, leilão, cobrança, embargos à execução;
- encerrado: arquivado definitivamente, extinto, acordo cumprido, baixa;
- indefinida: os dados não permitem saber.`;
