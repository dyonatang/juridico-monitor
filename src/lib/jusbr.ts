/**
 * Ingestão de dados vindos do jus.br (portaldeservicos.pdpj.jus.br), enviados pelo agente.
 * O agente roda fora (servidor do grupo) com o login gov.br do usuário e chama /api/ingestao.
 */
import * as store from "./store";
import { salvarArquivo } from "./storage";
import { analisarComClaude, htmlParaTexto, leitorIaDisponivel, type Analise } from "./leitor";
import { aplicarRemoto, upsertProcessoRemoto } from "./sync";
import { formatarCnj, somenteDigitos, tribunalDoCnj, validarCnj } from "./format";
import type { ProcessoRemoto } from "./providers";
import type { Arquivo, Processo } from "./types";

// ---- formato que o agente envia (espelha a API v2 do jus.br, já simplificado)
export type JusbrParte = { nome: string; polo: "ATIVO" | "PASSIVO" | string; documentos?: string[] };
export type JusbrProcesso = {
  numero: string; // com ou sem formatação
  tribunal?: string | null; // sigla, ex. TJES
  classe?: string | null;
  assunto?: string | null;
  orgao?: string | null;
  ajuizamento?: string | null; // ISO
  valor?: number | null;
  ativo?: boolean | null;
  partes?: JusbrParte[];
  movimentos?: { dataHora: string; descricao: string; codigo?: number | null }[];
};
export type JusbrDocumento = {
  numero: string;
  idCodex: number | string;
  idOrigem?: string | null;
  nome: string;
  tipo?: string | null; // "Decisão", "Sentença", "Petição"...
  dataHoraJuntada?: string | null;
  mime?: string | null;
  sigilo?: string | null;
  texto?: string | null; // texto puro (endpoint /texto)
  binario_base64?: string | null; // arquivo original (endpoint /binario), opcional
};

const idArquivo = (idCodex: number | string) => `jusbr_${String(idCodex).replace(/\D/g, "") || String(idCodex)}`;

function paraRemoto(p: JusbrProcesso): ProcessoRemoto {
  const numero = somenteDigitos(p.numero);
  const lado = (x?: string) => (x ?? "").toUpperCase();
  const ativos = (p.partes ?? []).filter((x) => lado(x.polo) === "ATIVO").map((x) => x.nome);
  const passivos = (p.partes ?? []).filter((x) => lado(x.polo) === "PASSIVO").map((x) => x.nome);
  return {
    numeroCnj: numero,
    tribunal: p.tribunal ? p.tribunal.toLowerCase() : tribunalDoCnj(numero),
    classe: p.classe ?? null,
    assunto: p.assunto ?? null,
    orgaoJulgador: p.orgao ?? null,
    dataAjuizamento: p.ajuizamento ? p.ajuizamento.slice(0, 10) : null,
    poloAtivo: ativos.join("; ") || null,
    poloPassivo: passivos.join("; ") || null,
    valorCausa: p.valor ?? null,
    situacao: p.ativo === false ? "Encerrado/arquivado" : p.ativo === true ? "Ativo" : null,
    movimentacoes: (p.movimentos ?? [])
      .filter((m) => m.dataHora && m.descricao)
      .map((m) => ({ dataHora: m.dataHora, codigo: m.codigo ?? null, descricao: m.descricao })),
  };
}

/** Descobre o CPF/CNPJ do grupo a partir das partes (CPF/CNPJ) do processo. */
async function vincularPorPartes(p: JusbrProcesso) {
  const docs = await store.listarDocumentos();
  const nums = new Set((p.partes ?? []).flatMap((x) => x.documentos ?? []).map(somenteDigitos));
  for (const d of docs) if (nums.has(d.numero)) return { documento_id: d.id };
  return { documento_id: null };
}

/**
 * Recebe um processo completo (capa + partes + movimentos). Cria se não existir (origem "descoberto")
 * e aplica as movimentações. Retorna o que aconteceu.
 */
export async function ingerirProcesso(p: JusbrProcesso, vinculo?: { documento_id?: string | null }) {
  const numero = somenteDigitos(p.numero);
  if (numero.length !== 20 || !validarCnj(numero)) throw new Error(`Número CNJ inválido: ${p.numero}`);
  const remoto = paraRemoto(p);
  const v = vinculo?.documento_id ? vinculo : await vincularPorPartes(p);
  const { processo, criado } = await upsertProcessoRemoto(remoto, {
    origem: "descoberto",
    documento_id: v.documento_id ?? null,
    provider: "jusbr",
    descricao: [p.classe, remoto.poloAtivo && remoto.poloPassivo ? `${remoto.poloAtivo} x ${remoto.poloPassivo}` : null].filter(Boolean).join(" — ").slice(0, 120) || null,
  });
  // completa vínculo de processo antigo sem documento
  if (!criado && !processo.documento_id && v.documento_id) {
    await store.atualizar("processos", processo.id, { documento_id: v.documento_id });
  }
  const novas = remoto.movimentacoes.length ? await aplicarRemoto(processo, remoto, "jusbr") : 0;
  return { numero: processo.numero_formatado, criado, novas };
}

/** Lista de ids (jus.br) de documentos já importados por processo — para o agente só baixar o que falta. */
export async function idsConhecidos(): Promise<Record<string, string[]>> {
  const r = await store.fs().collection("arquivos").where("origem", "==", "jusbr").select("processos", "jusbr").get();
  const out: Record<string, string[]> = {};
  for (const d of r.docs) {
    const data = d.data() as { processos?: string[]; jusbr?: { idCodex?: string } };
    const id = data.jusbr?.idCodex ? String(data.jusbr.idCodex) : d.id.replace(/^jusbr_/, "");
    for (const p of data.processos ?? []) (out[p] ??= []).push(id);
  }
  return out;
}

/** Recebe uma peça do jus.br: guarda, lê com IA, liga ao processo, gera alerta. */
export async function ingerirDocumento(d: JusbrDocumento): Promise<{ id: string; novo: boolean; resumo: string | null }> {
  const numero = somenteDigitos(d.numero);
  const id = idArquivo(d.idCodex);
  const existente = await store.getArquivo(id);
  if (existente) return { id, novo: false, resumo: existente.analise?.resumo ?? null };

  let processo: Processo | null = await store.getProcesso(numero);
  if (!processo) {
    const r = await upsertProcessoRemoto({ numeroCnj: numero, tribunal: tribunalDoCnj(numero), movimentacoes: [] }, { origem: "descoberto", provider: "jusbr" });
    processo = r.processo;
  }

  // texto: prioridade ao texto puro; senão, HTML → texto; senão, nada (PDF só com IA)
  const mime = (d.mime ?? "").toLowerCase();
  const bin = d.binario_base64 ? Buffer.from(d.binario_base64, "base64") : null;
  let texto = (d.texto ?? "").trim();
  if (!texto && bin && mime.includes("html")) texto = htmlParaTexto(bin.toString("utf8"));
  const ehPdf = mime.includes("pdf") || (bin ? bin.subarray(0, 4).toString() === "%PDF" : false);

  const ext = ehPdf ? "pdf" : mime.includes("html") ? "html" : "txt";
  const nomeBase = (d.nome || `${d.tipo ?? "documento"}`).replace(/\.[a-z0-9]+$/i, "").replace(/[^\w.\- ()]/g, "_").slice(0, 80);
  const caminho = `arquivos/${id}/${nomeBase}.${ext}`;
  const conteudoSalvo = bin ?? Buffer.from(texto, "utf8");
  await salvarArquivo(caminho, conteudoSalvo, ehPdf ? "application/pdf" : mime.includes("html") ? "text/html; charset=utf-8" : "text/plain; charset=utf-8");

  const avisos: string[] = [];
  let analise: Analise | null = null;
  if (leitorIaDisponivel()) {
    try {
      const contexto = `Este documento é a peça "${d.tipo ?? d.nome}" do processo ${formatarCnj(numero)}${processo.descricao ? ` (${processo.descricao})` : ""}, juntada em ${d.dataHoraJuntada ?? "data não informada"}.`;
      analise = await analisarComClaude(ehPdf && bin ? { pdf: bin, contexto } : { texto, contexto });
    } catch (e) {
      avisos.push(`Leitura por IA falhou: ${e instanceof Error ? e.message : e}`);
    }
  } else {
    avisos.push("Leitura por IA desativada (sem ANTHROPIC_API_KEY).");
  }

  const arquivo: Arquivo = {
    id,
    nome: `${nomeBase}.${ext}`,
    tamanho: conteudoSalvo.length,
    storage_path: caminho,
    documento_id: processo.documento_id,
    vinculo: "processo",
    processos: [numero],
    resultado: [{ numero, numero_formatado: formatarCnj(numero), criado: false, novas: 0, erro: null }],
    analise,
    texto_preview: texto.slice(0, 3000),
    avisos,
    status: "ok",
    origem: "jusbr",
    mime: ehPdf ? "application/pdf" : mime || "text/plain",
    jusbr: { idCodex: String(d.idCodex), idOrigem: d.idOrigem ?? null, tipo: d.tipo ?? null, dataHoraJuntada: d.dataHoraJuntada ?? null, sigilo: d.sigilo ?? null },
    created_at: store.agora(),
  };
  await store.salvarArquivo(arquivo);

  const rotulo = processo.descricao ? `${processo.descricao} (${processo.numero_formatado})` : processo.numero_formatado;
  await store.inserirAlertas([
    {
      tipo: "documento_importado",
      processo_id: processo.id,
      documento_id: processo.documento_id,
      movimentacao_id: null,
      titulo: `${d.tipo ?? "Documento"} no processo — ${rotulo}`,
      mensagem: [
        d.dataHoraJuntada ? `Juntado em ${new Date(d.dataHoraJuntada).toLocaleDateString("pt-BR")}` : null,
        analise?.resumo ?? texto.slice(0, 300),
        analise?.acao_recomendada ? `⚠️ Providência: ${analise.acao_recomendada}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ]);
  return { id, novo: true, resumo: analise?.resumo ?? null };
}
