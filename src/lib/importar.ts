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

/** Tenta descobrir a qual empresa/documento do grupo o PDF se refere. */
async function vincular(analise: Analise | null, texto: string) {
  const [empresas, docs] = await Promise.all([store.listarEmpresas(), store.listarDocumentos()]);
  const digitosNoTexto = new Set<string>();
  for (const m of texto.matchAll(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g)) digitosNoTexto.add(somenteDigitos(m[0]));
  for (const p of analise?.partes ?? []) if (p.documento) digitosNoTexto.add(somenteDigitos(p.documento));

  // 1) por CPF/CNPJ monitorado
  for (const d of docs) if (digitosNoTexto.has(d.numero)) return { empresa_id: d.empresa_id, documento_id: d.id, como: `documento ${d.nome}` };
  // 2) por CNPJ da empresa
  for (const e of empresas) if (e.cnpj && digitosNoTexto.has(e.cnpj)) return { empresa_id: e.id, documento_id: null, como: `CNPJ de ${e.apelido || e.nome}` };
  // 3) por nome (partes da análise ou texto)
  const alvo = normalizar([...(analise?.partes ?? []).map((p) => p.nome), texto.slice(0, 20000)].join(" "));
  for (const e of empresas) {
    const nomes = [e.nome, e.apelido].filter(Boolean).map((n) => normalizar(n!)).filter((n) => n.length >= 6);
    if (nomes.some((n) => alvo.includes(n))) return { empresa_id: e.id, documento_id: null, como: `nome ${e.apelido || e.nome}` };
  }
  for (const d of docs) {
    const n = normalizar(d.nome);
    if (n.length >= 8 && alvo.includes(n)) return { empresa_id: d.empresa_id, documento_id: d.id, como: `nome ${d.nome}` };
  }
  return { empresa_id: null, documento_id: null, como: null };
}

export async function importarPdf(input: {
  nome: string;
  bytes: Buffer;
  empresa_id?: string | null;
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
      analise = await analisarComClaude(input.bytes);
    } catch (e) {
      avisos.push(`Leitura por IA falhou: ${e instanceof Error ? e.message : e}`);
    }
  } else {
    avisos.push("Leitura por IA desativada (sem ANTHROPIC_API_KEY): só números de processo foram extraídos.");
  }

  const cnjs = new Set<string>(encontrarCnjs(texto));
  for (const n of analise?.numeros_processo ?? []) {
    const d = somenteDigitos(n);
    if (d.length === 20 && validarCnj(d)) cnjs.add(d);
  }

  let empresa_id = input.empresa_id || null;
  let documento_id = input.documento_id || null;
  let vinculo: string | null = null;
  if (!empresa_id && !documento_id) {
    const v = await vincular(analise, texto);
    empresa_id = v.empresa_id;
    documento_id = v.documento_id;
    vinculo = v.como;
  }

  const descricaoBase = analise ? [analise.tipo_documento, analise.assunto].filter(Boolean).join(" — ") : `Importado de ${nomeLimpo}`;
  const processos: ResultadoProcessoImportado[] = [];
  for (const numero of cnjs) {
    const existente = await store.getProcesso(numero);
    if (existente) {
      processos.push({ numero, numero_formatado: existente.numero_formatado, criado: false, novas: 0, erro: null });
      if (!existente.empresa_id && empresa_id) await store.atualizar("processos", numero, { empresa_id, documento_id: existente.documento_id ?? documento_id });
      continue;
    }
    try {
      const r = await cadastrarProcesso({ numero, descricao: descricaoBase.slice(0, 120), empresa_id, documento_id });
      processos.push({ numero, numero_formatado: r.processo.numero_formatado, criado: true, novas: r.novas, erro: r.erro });
    } catch (e) {
      processos.push({ numero, numero_formatado: formatarCnj(numero), criado: false, novas: 0, erro: e instanceof Error ? e.message : String(e) });
    }
  }

  const arquivo: Arquivo = {
    id,
    nome: nomeLimpo,
    tamanho: input.bytes.length,
    storage_path: caminho,
    empresa_id,
    documento_id,
    vinculo,
    processos: [...cnjs],
    resultado: processos,
    analise,
    texto_preview: texto.slice(0, 3000),
    avisos,
    status: cnjs.size > 0 ? "ok" : "sem_processo",
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
