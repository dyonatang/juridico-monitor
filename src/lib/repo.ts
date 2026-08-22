/**
 * Operações de cadastro compartilhadas entre o dashboard (server actions) e o MCP.
 */
import * as store from "./store";
import { formatarCnj, somenteDigitos, tribunalDoCnj, validarCnj, validarCnpj, validarCpf } from "./format";
import { provedorPremium } from "./providers";
import { aplicarRemoto, sincronizarProcesso, upsertProcessoRemoto } from "./sync";
import type { DocumentoMonitorado } from "./types";

const baseUrl = () => process.env.APP_URL?.replace(/\/$/, "") || "http://localhost:3000";
const callback = (provider: string) => `${baseUrl()}/api/webhooks/${provider}?secret=${process.env.WEBHOOK_SECRET ?? ""}`;

export async function cadastrarEmpresa(input: { nome: string; cnpj?: string | null; apelido?: string | null }) {
  const nome = input.nome?.trim();
  if (!nome) throw new Error("Nome da empresa é obrigatório");
  const cnpj = input.cnpj ? somenteDigitos(input.cnpj) : null;
  if (cnpj && !validarCnpj(cnpj)) throw new Error("CNPJ inválido");
  return store.criarEmpresa({ nome, cnpj: cnpj || null, apelido: input.apelido?.trim() || null });
}

/**
 * Cadastra CPF/CNPJ. Com provedor premium configurado:
 *   1. cria tracking no provedor (webhook → /api/webhooks/<provedor>)
 *   2. importa os processos existentes em que o documento é parte
 */
export async function cadastrarDocumento(input: {
  tipo: "CPF" | "CNPJ";
  numero: string;
  nome: string;
  empresa_id?: string | null;
  observacao?: string | null;
}) {
  const numero = somenteDigitos(input.numero);
  const nome = input.nome?.trim();
  if (!nome) throw new Error("Nome é obrigatório");
  if (input.tipo === "CPF" && !validarCpf(numero)) throw new Error("CPF inválido");
  if (input.tipo === "CNPJ" && !validarCnpj(numero)) throw new Error("CNPJ inválido");

  const doc = await store.criarDocumento({
    tipo: input.tipo,
    numero,
    nome,
    empresa_id: input.empresa_id || null,
    observacao: input.observacao?.trim() || null,
  });
  try {
    await ativarMonitoramentoDocumento(doc);
  } catch (e) {
    doc.ultimo_erro = e instanceof Error ? e.message : String(e);
    await store.atualizar("documentos", doc.id, { ultimo_erro: doc.ultimo_erro });
  }
  return (await store.getDocumento(doc.id)) ?? doc;
}

/** Liga o documento ao provedor premium (tracking + importação inicial). */
export async function ativarMonitoramentoDocumento(doc: DocumentoMonitorado) {
  const provider = provedorPremium();
  if (!provider) {
    await store.atualizar("documentos", doc.id, {
      ultimo_erro: "Nenhum provedor de busca por CPF/CNPJ configurado (JUDIT_API_KEY ou ESCAVADOR_TOKEN). Cadastre os processos manualmente.",
    });
    return { importados: 0, tracking: null as string | null };
  }

  let tracking = doc.provider_tracking_id;
  if (!tracking && provider.criarMonitoramento) {
    tracking = await provider.criarMonitoramento({ tipo: doc.tipo, valor: doc.numero }, callback(provider.nome));
  }

  let importados = 0;
  if (provider.buscarPorDocumento) {
    for (const remoto of await provider.buscarPorDocumento(doc.tipo, doc.numero)) {
      const { processo, criado } = await upsertProcessoRemoto(remoto, {
        origem: "descoberto",
        documento_id: doc.id,
        empresa_id: doc.empresa_id,
        provider: provider.nome,
      });
      if (criado) importados++;
      if (remoto.movimentacoes.length > 0) await aplicarRemoto(processo, remoto, provider.nome);
      else await sincronizarProcesso(processo).catch(() => null);
    }
  }

  await store.atualizar("documentos", doc.id, {
    provider: provider.nome,
    provider_tracking_id: tracking,
    ultimo_check: store.agora(),
    ultimo_erro: null,
  });
  return { importados, tracking };
}

/** Cadastra processo por número CNJ e faz a primeira sincronização. */
export async function cadastrarProcesso(input: { numero: string; descricao?: string | null; empresa_id?: string | null; documento_id?: string | null }) {
  const numero = somenteDigitos(input.numero);
  if (numero.length !== 20) throw new Error("Número CNJ deve ter 20 dígitos (NNNNNNN-DD.AAAA.J.TR.OOOO)");
  if (!validarCnj(numero)) throw new Error("Número CNJ inválido (dígito verificador não confere)");

  const processo = await store.criarProcesso({
    numero_cnj: numero,
    numero_formatado: formatarCnj(numero),
    tribunal: tribunalDoCnj(numero),
    classe: null,
    assunto: null,
    orgao_julgador: null,
    grau: null,
    data_ajuizamento: null,
    polo_ativo: null,
    polo_passivo: null,
    valor_causa: null,
    situacao: null,
    descricao: input.descricao?.trim() || null,
    empresa_id: input.empresa_id || null,
    documento_id: input.documento_id || null,
    origem: "manual",
    provider: null,
    provider_tracking_id: null,
  });

  const provider = provedorPremium();
  if (provider?.criarMonitoramento) {
    try {
      const tracking = await provider.criarMonitoramento({ tipo: "CNJ", valor: numero }, callback(provider.nome));
      await store.atualizar("processos", processo.id, { provider: provider.nome, provider_tracking_id: tracking });
    } catch (e) {
      console.error("tracking:", e);
    }
  }

  let novas = 0;
  let erro: string | null = null;
  try {
    novas = await sincronizarProcesso(processo);
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e);
  }
  return { processo, novas, erro };
}

export const marcarAlertasLidos = store.marcarAlertasLidos;
