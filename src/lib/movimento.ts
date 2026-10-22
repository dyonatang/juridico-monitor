import { createHash } from "node:crypto";

/** Tira o prefixo de grau ("[G1] ", "[JE] ") que a descrição ganha quando o DataJud devolve mais de um registro do processo. */
export const semPrefixoDeGrau = (descricao: string) => descricao.replace(/^\[[A-Z0-9]{1,4}\] /, "");

/**
 * Identidade de um andamento. O prefixo de grau fica de fora: o DataJud às vezes devolve 1 e às
 * vezes 2 registros do mesmo processo (G1 + JE, p.ex.), e com o prefixo na conta o mesmo andamento
 * virava "novo" a cada variação — gerava duplicatas e alertas falsos.
 */
export const hashMov = (m: { dataHora: string; codigo?: number | null; descricao: string; complemento?: string | null }) =>
  createHash("sha256")
    .update(`${m.dataHora}|${m.codigo ?? ""}|${semPrefixoDeGrau(m.descricao)}|${m.complemento ?? ""}`)
    .digest("hex");

/** Mesma identidade, a partir de um andamento já gravado (não confia no campo `hash` antigo, calculado com o prefixo). */
export const hashGravado = (m: { data_hora: string; codigo?: number | null; descricao: string; complemento?: string | null }) =>
  hashMov({ dataHora: m.data_hora, codigo: m.codigo, descricao: m.descricao, complemento: m.complemento });
