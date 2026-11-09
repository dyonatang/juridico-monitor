/**
 * Números dos gráficos do painel 2.0 — calculados no servidor a partir dos dados reais.
 * Datas no fuso de São Paulo (o DataJud grava data_hora em ISO; o dia é o do ato).
 */
import type { DocumentoMonitorado, Movimentacao, Processo } from "./types";

type MovLeve = Pick<Movimentacao, "processo_id" | "data_hora" | "importancia">;
const DIA_MS = 86_400_000;
const diaSP = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); // AAAA-MM-DD
const hojeSP = () => diaSP(new Date().toISOString());
const somaDias = (dia: string, n: number) => new Date(Date.parse(`${dia}T12:00:00Z`) + n * DIA_MS).toISOString().slice(0, 10);
const ddmm = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

/** Início da busca para os gráficos (26 semanas + folga). */
export const inicioGraficos = () => somaDias(hojeSP(), -26 * 7 - 7);

/** Andamentos por semana (segunda a domingo), últimas `n` semanas — a última é a atual. */
export function porSemana(movs: MovLeve[], n = 26) {
  const hoje = hojeSP();
  const dow = (new Date(`${hoje}T12:00:00Z`).getUTCDay() + 6) % 7; // 0 = segunda
  const inicioAtual = somaDias(hoje, -dow);
  const semanas = Array.from({ length: n }, (_, i) => somaDias(inicioAtual, -(n - 1 - i) * 7));
  const cont = new Map(semanas.map((s) => [s, 0]));
  for (const m of movs) {
    const d = diaSP(m.data_hora);
    const k = Math.floor((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${semanas[0]}T12:00:00Z`)) / (7 * DIA_MS));
    if (k >= 0 && k < n) cont.set(semanas[k], (cont.get(semanas[k]) ?? 0) + 1);
  }
  return semanas.map((s, i) => ({
    rotulo: ddmm(s),
    valor: cont.get(s) ?? 0,
    dica: i === n - 1 ? `semana atual (desde ${ddmm(s)})` : `semana de ${ddmm(s)} a ${ddmm(somaDias(s, 6))}`,
  }));
}

/** Andamentos por dia nas últimas `semanas` semanas, começando num domingo (mapa de calor). */
export function porDia(movs: MovLeve[], semanas = 18) {
  const hoje = hojeSP();
  const dow = new Date(`${hoje}T12:00:00Z`).getUTCDay(); // 0 = domingo
  const inicio = somaDias(hoje, -dow - (semanas - 1) * 7);
  const cont = new Map<string, number>();
  for (const m of movs) { const d = diaSP(m.data_hora); if (d >= inicio && d <= hoje) cont.set(d, (cont.get(d) ?? 0) + 1); }
  const dias: { data: string; valor: number }[] = [];
  for (let d = inicio; d <= hoje; d = somaDias(d, 1)) dias.push({ data: d, valor: cont.get(d) ?? 0 });
  return dias;
}

export const ultimosDias = (movs: MovLeve[], dias: number) => {
  const desde = somaDias(hojeSP(), -dias + 1);
  return movs.filter((m) => diaSP(m.data_hora) >= desde).length;
};

/** Vínculos em ordem FIXA (CNPJs por data de cadastro, depois "Família") — a cor segue o vínculo. */
export function vinculos(docs: DocumentoMonitorado[]) {
  const porId = new Map(docs.map((d) => [d.id, d]));
  const grupoDe = (docId: string | null | undefined): string => {
    const d = docId ? porId.get(docId) : null;
    if (!d) return "_fam";
    if (d.tipo === "CNPJ") return d.id;
    return d.vinculo_id && porId.get(d.vinculo_id)?.tipo === "CNPJ" ? d.vinculo_id : "_fam";
  };
  const cnpjs = docs.filter((d) => d.tipo === "CNPJ").sort((a, b) => a.created_at.localeCompare(b.created_at));
  const lista = [...cnpjs.map((d) => ({ id: d.id, nome: d.apelido || d.nome })), { id: "_fam", nome: "Família / pessoas" }];
  const SLOTS = ["--s1", "--s2", "--s3", "--s4", "--s5"];
  // > 5 vínculos: os excedentes dividem o último tom (não se gera cor nova).
  const cor = new Map(lista.map((g, i) => [g.id, SLOTS[Math.min(i, SLOTS.length - 1)]]));
  return { lista, grupoDe, cor };
}

/** Tribunais (até 4 + "outros"), em ordem de quantidade. */
export function porTribunal(processos: Processo[]) {
  const cont = new Map<string, number>();
  for (const p of processos) { const t = (p.tribunal ?? "?").toUpperCase(); cont.set(t, (cont.get(t) ?? 0) + 1); }
  const ord = [...cont].sort((a, b) => b[1] - a[1]);
  const top = ord.slice(0, 4);
  const resto = ord.slice(4).reduce((s, [, v]) => s + v, 0);
  const SLOTS = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)"];
  const partes = top.map(([t, v], i) => ({ rotulo: t, valor: v, cor: SLOTS[i] }));
  if (resto) partes.push({ rotulo: "Outros", valor: resto, cor: "var(--st-none)" });
  return partes;
}

/** Avaliação de risco (CPC 25) — cores de STATUS, sempre com ícone e rótulo. */
export function porRisco(processos: Processo[]) {
  const c = { provavel: 0, possivel: 0, remoto: 0, nao: 0 };
  for (const p of processos) c[p.classificacao_risco ?? "nao"]++;
  return [
    { rotulo: "Provável", valor: c.provavel, cor: "var(--st-crit)", icone: "▲" },
    { rotulo: "Possível", valor: c.possivel, cor: "var(--st-warn)", icone: "◆" },
    { rotulo: "Remoto", valor: c.remoto, cor: "var(--st-good)", icone: "●" },
    { rotulo: "Não avaliado", valor: c.nao, cor: "var(--st-none)", icone: "○" },
  ];
}

export const ddmmDe = (iso: string | null) => (iso ? ddmm(diaSP(iso)) : null);
