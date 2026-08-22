/**
 * Importação de PDF: guarda o arquivo, lê, encontra processos e cadastra.
 */
import * as store from "./store";
import { salvarArquivo } from "./storage";
import { analisarComClaude, encontrarCnjs, extrairTexto, leitorIaDisponivel, type Analise } from "./leitor";
import { cadastrarProcesso } from "./repo";
import { formatarCnj, somenteDigitos, validarCnj } from "./format";
import type { Arquivo, ResultadoProcessoImportado } from "./types";

const normalizar = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\b(ltda|me|epp|s\/a|sa|eireli)\b/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Nomes das partes de um polo, segundo a análise da IA (ex.: "Fulano; Empresa X LTDA"). */
function poloDeAnalise(analise: Analise | null, polo: "ativo" | "passivo"): string | null {
  const nomes = (analise?.partes ?? []).filter((p) => p.polo === polo).map((p) => p.nome);
  return nomes.length ? nomes.join("; ") : null;
}

/** Primeiro nome de um polo (corta em ";" ou "(observação)"), curto o bastante pra caber numa descrição. */
function nomeCurto(s: string | null, max = 30): string | null {
  if (!s) return null;
  const primeiro = s.split(";")[0].split(" (")[0].trim();
  return primeiro.length > max ? `${primeiro.slice(0, max - 1)}…` : primeiro;
}

/** Tenta descobrir a qual CPF/CNPJ do grupo o PDF se refere. */
async function vincular(analise: Analise | null, texto: string) {
  const docs = await store.listarDocumentos();
  const digitosNoTexto = new Set<string>();
  for (const m of texto.matchAll(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g)) digitosNoTexto.add(somenteDigitos(m[0]));
  for (const p of analise?.partes ?? []) if (p.documento) digitosNoTexto.add(somenteDigitos(p.documento));

  // 1) por CPF/CNPJ monitorado
  for (const d of docs) if (digitosNoTexto.has(d.numero)) return { documento_id: d.id, como: `documento ${d.nome}` };
  // 2) por nome (partes da análise ou texto)
  const alvo = normalizar([...(analise?.partes ?? []).map((p) => p.nome), texto.slice(0, 20000)].join(" "));
  for (const d of docs) {
    const nomes = [d.nome, d.apelido].filter(Boolean).map((n) => normalizar(n!)).filter((n) => n.length >= 6);
    if (nomes.some((n) => alvo.includes(n))) return { documento_id: d.id, como: `nome ${d.apelido || d.nome}` };
  }
  return { documento_id: null, como: null };
}

export async function importarPdf(input: {
  nome: string;
  bytes: Buffer;
  documento_id?: string | null;
}): Promise<Arquivo> {
  const id = store.novoId("arquivos");
  const nomeLimpo = input.nome.replace(/[^\w.\- ()]/g, "_").slice(0, 120) || "documento.pdf";
  const caminho = `arquivos/${id}/${nomeLimpo}`;
  await salvarArquivo(caminho, input.bytes, "application/pdf");

  const avisos: string[] = [];
  let texto = "";
  try {
    texto = await extrairTexto(input.bytes);
  } catch (e) {
    avisos.push(`Não foi possível extrair texto localmente (${e instanceof Error ? e.message : e}).`);
  }
  if (texto.length < 50) avisos.push("O PDF tem pouco ou nenhum texto selecionável — provavelmente é digitalizado.");

  let analise: Analise | null = null;
  if (leitorIaDisponivel()) {
    try {
      analise = await analisarComClaude({ pdf: input.bytes });
    } catch (e) {
      avisos.push(`Leitura por IA falhou: ${e instanceof Error ? e.message : e}`);
    }
  } else {
    avisos.push("Leitura por IA desativada (sem ANTHROPIC_API_KEY): só números de processo foram extraídos.");
  }

  // A IA lê o documento inteiro e sabe distinguir "processo tratado aqui" de números
  // citados como jurisprudência/precedente — usamos só o dela quando disponível. A
  // regex bruta em cima do texto inteiro (encontrarCnjs) pega QUALQUER CNJ válido no
  // texto, incluindo citações de outros processos em petições longas — só serve como
  // fallback (com aviso) quando a IA não rodou.
  let cnjs: Set<string>;
  if (analise) {
    cnjs = new Set<string>();
    for (const n of analise.numeros_processo) {
      const d = somenteDigitos(n);
      if (d.length === 20 && validarCnj(d)) cnjs.add(d);
    }
  } else {
    cnjs = new Set<string>(encontrarCnjs(texto));
    if (cnjs.size > 1) {
      avisos.push(
        `Sem leitura por IA, ${cnjs.size} números de processo foram encontrados no texto por busca simples — documentos longos podem citar processos de terceiros como jurisprudência. Confira antes de confiar nos vínculos.`,
      );
    }
  }

  let documento_id = input.documento_id || null;
  let vinculo: string | null = null;
  if (!documento_id) {
    const v = await vincular(analise, texto);
    documento_id = v.documento_id;
    vinculo = v.como;
  }

  const poloAtivoIa = poloDeAnalise(analise, "ativo");
  const poloPassivoIa = poloDeAnalise(analise, "passivo");
  // Descrição curta e padronizada: "Tipo — Parte1 x Parte2 (assunto)" quando temos as
  // partes; senão cai pro tipo+assunto crus, e por último no nome do arquivo.
  const partesResumo = poloAtivoIa && poloPassivoIa ? `${nomeCurto(poloAtivoIa)} x ${nomeCurto(poloPassivoIa)}` : null;
  const tipoCurto = analise?.tipo_documento ? analise.tipo_documento.split(/[,(]/)[0].trim() : null;
  const assuntoCurto = analise?.assunto ? analise.assunto.split(";")[0].trim() : null;
  const descricaoBase = partesResumo
    ? [tipoCurto, `${partesResumo}${assuntoCurto ? ` (${assuntoCurto})` : ""}`].filter(Boolean).join(" — ")
    : analise
      ? [analise.tipo_documento, analise.assunto].filter(Boolean).join(" — ")
      : `Importado de ${nomeLimpo}`;
  const resumoStatusIa = analise
    ? [analise.resumo, analise.acao_recomendada ? `⚠️ ${analise.acao_recomendada}` : null].filter(Boolean).join("\n\n")
    : null;

  // O DataJud costuma omitir as partes em processos criminais e trabalhistas (LGPD) —
  // quando a IA leu o próprio documento e sabe quem são as partes, completamos a capa
  // com isso em vez de deixar em branco (tanto num processo recém-criado quanto num
  // que já existia e ficou incompleto de uma sincronização anterior).
  const completarCapa = async (numeroCnj: string, atual: { polo_ativo: string | null; polo_passivo: string | null; descricao: string | null; resumo_status: string | null }) => {
    const patch: Record<string, unknown> = {};
    if (!atual.polo_ativo && poloAtivoIa) patch.polo_ativo = poloAtivoIa;
    if (!atual.polo_passivo && poloPassivoIa) patch.polo_passivo = poloPassivoIa;
    const descricaoGenerica = !atual.descricao || atual.descricao.startsWith("Importado de ") || (!!partesResumo && !atual.descricao.includes(" x "));
    if (descricaoGenerica && analise) patch.descricao = descricaoBase.slice(0, 160);
    if (!atual.resumo_status && resumoStatusIa) patch.resumo_status = resumoStatusIa;
    if (Object.keys(patch).length) await store.atualizar("processos", numeroCnj, patch);
  };

  const processos: ResultadoProcessoImportado[] = [];
  for (const numero of cnjs) {
    const existente = await store.getProcesso(numero);
    if (existente) {
      processos.push({ numero, numero_formatado: existente.numero_formatado, criado: false, novas: 0, erro: null });
      if (!existente.documento_id && documento_id) await store.atualizar("processos", numero, { documento_id });
      await completarCapa(numero, existente);
      continue;
    }
    try {
      const r = await cadastrarProcesso({ numero, descricao: descricaoBase.slice(0, 160), documento_id });
      processos.push({ numero, numero_formatado: r.processo.numero_formatado, criado: true, novas: r.novas, erro: r.erro });
      await completarCapa(numero, r.processo);
    } catch (e) {
      processos.push({ numero, numero_formatado: formatarCnj(numero), criado: false, novas: 0, erro: e instanceof Error ? e.message : String(e) });
    }
  }

  const arquivo: Arquivo = {
    id,
    nome: nomeLimpo,
    tamanho: input.bytes.length,
    storage_path: caminho,
    documento_id,
    vinculo,
    processos: [...cnjs],
    resultado: processos,
    analise,
    texto_preview: texto.slice(0, 3000),
    avisos,
    status: cnjs.size > 0 ? "ok" : "sem_processo",
    origem: "upload",
    mime: "application/pdf",
    created_at: store.agora(),
  };
  await store.salvarArquivo(arquivo);

  const criados = processos.filter((p) => p.criado);
  await store.inserirAlertas([
    {
      tipo: "documento_importado",
      processo_id: processos[0]?.numero ?? null,
      documento_id,
      movimentacao_id: null,
      titulo: `Documento importado: ${analise?.tipo_documento ?? nomeLimpo}`,
      mensagem: [
        analise?.resumo,
        cnjs.size ? `Processo(s): ${[...cnjs].map(formatarCnj).join(", ")}${criados.length ? ` (${criados.length} cadastrado(s) agora)` : ""}` : "Nenhum número de processo encontrado.",
        analise?.acao_recomendada ? `⚠️ Providência: ${analise.acao_recomendada}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ]);

  return arquivo;
}
