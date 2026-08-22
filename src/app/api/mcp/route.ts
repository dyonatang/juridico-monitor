import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { z } from "zod";
import * as store from "@/lib/store";
import { formatarCnj, formatarDocumento, fmtData, fmtDataHora, somenteDigitos } from "@/lib/format";
import { cadastrarDocumento, cadastrarEmpresa, cadastrarProcesso, marcarAlertasLidos } from "@/lib/repo";
import { sincronizarProcesso, sincronizarTudo } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const texto = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const json = (v: unknown) => texto(JSON.stringify(v, null, 2));

async function mapaEmpresas() {
  const m = new Map<string, string>();
  for (const e of await store.listarEmpresas()) m.set(e.id, e.apelido || e.nome);
  return m;
}

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "listar_empresas",
      { title: "Listar empresas", description: "Lista as empresas cadastradas no monitor jurídico.", inputSchema: z.object({}) },
      async () => json(await store.listarEmpresas()),
    );

    server.registerTool(
      "listar_documentos_monitorados",
      { title: "Listar CPFs/CNPJs monitorados", description: "Lista os CPFs e CNPJs monitorados, com status do monitoramento.", inputSchema: z.object({}) },
      async () => {
        const emp = await mapaEmpresas();
        return json((await store.listarDocumentos()).map((d) => ({ ...d, numero_formatado: formatarDocumento(d.tipo, d.numero), empresa: d.empresa_id ? emp.get(d.empresa_id) : null })));
      },
    );

    server.registerTool(
      "listar_processos",
      {
        title: "Listar processos",
        description: "Lista processos monitorados. Filtros opcionais por empresa, documento ou apenas ativos.",
        inputSchema: z.object({ empresa_id: z.string().optional(), documento_id: z.string().optional(), apenas_ativos: z.boolean().default(true) }),
      },
      async ({ empresa_id, documento_id, apenas_ativos }) => {
        const emp = await mapaEmpresas();
        const lista = await store.listarProcessos({ empresa_id, documento_id, apenasAtivos: apenas_ativos });
        return json(
          lista.map((p) => ({
            numero: p.numero_formatado, tribunal: p.tribunal, classe: p.classe, assunto: p.assunto, orgao_julgador: p.orgao_julgador,
            polo_ativo: p.polo_ativo, polo_passivo: p.polo_passivo, situacao: p.situacao, descricao: p.descricao, origem: p.origem,
            empresa: p.empresa_id ? emp.get(p.empresa_id) : null, total_movimentacoes: p.total_movimentacoes, ativo: p.ativo,
            ultimo_check: p.ultimo_check, ultimo_erro: p.ultimo_erro,
          })),
        );
      },
    );

    server.registerTool(
      "detalhes_processo",
      {
        title: "Detalhes do processo",
        description: "Capa completa e últimas movimentações de um processo (número CNJ, com ou sem formatação).",
        inputSchema: z.object({ numero: z.string(), limite_movimentacoes: z.number().int().min(1).max(200).default(30) }),
      },
      async ({ numero, limite_movimentacoes }) => {
        const p = await store.getProcessoPorNumero(somenteDigitos(numero));
        if (!p) return texto(`Processo ${numero} não está cadastrado.`);
        const movs = await store.listarMovimentacoes(p.id, limite_movimentacoes);
        return json({ processo: p, movimentacoes: movs.map((m) => ({ data_hora: m.data_hora, codigo: m.codigo, descricao: m.descricao, complemento: m.complemento, fonte: m.fonte })) });
      },
    );

    server.registerTool(
      "andamentos_recentes",
      {
        title: "Andamentos recentes",
        description: "Movimentações detectadas nos últimos N dias em todos os processos (mais recente primeiro).",
        inputSchema: z.object({ dias: z.number().int().min(1).max(365).default(7) }),
      },
      async ({ dias }) => {
        const desde = new Date(Date.now() - dias * 86400000).toISOString();
        const movs = await store.movimentacoesRecentes(desde);
        if (movs.length === 0) return texto(`Nenhum andamento novo detectado nos últimos ${dias} dias.`);
        const emp = await mapaEmpresas();
        const cache = new Map<string, Awaited<ReturnType<typeof store.getProcesso>>>();
        const linhas: string[] = [];
        for (const m of movs) {
          if (!cache.has(m.processo_id)) cache.set(m.processo_id, await store.getProcesso(m.processo_id));
          const p = cache.get(m.processo_id);
          const empresa = p?.empresa_id ? emp.get(p.empresa_id) : null;
          linhas.push(`• ${fmtDataHora(m.data_hora)} — ${p?.descricao ?? p?.numero_formatado} (${p?.numero_formatado}${empresa ? ", " + empresa : ""})\n  ${m.descricao}${m.complemento ? ` — ${m.complemento}` : ""}`);
        }
        return texto(`${movs.length} andamento(s) nos últimos ${dias} dias:\n\n${linhas.join("\n\n")}`);
      },
    );

    server.registerTool(
      "alertas_pendentes",
      {
        title: "Alertas pendentes",
        description: "Alertas ainda não lidos (novos andamentos, novos processos, erros). Use para informar o usuário sobre o que mudou.",
        inputSchema: z.object({ limite: z.number().int().min(1).max(200).default(50) }),
      },
      async ({ limite }) => {
        const alertas = await store.listarAlertas({ apenasNaoLidos: true, limite });
        if (alertas.length === 0) return texto("Nenhum alerta pendente. Tudo em dia.");
        return texto(`${alertas.length} alerta(s) pendente(s):\n\n${alertas.map((a) => `[${a.id}] ${fmtDataHora(a.created_at)} · ${a.tipo}\n${a.titulo}\n${a.mensagem}`).join("\n\n")}`);
      },
    );

    server.registerTool(
      "marcar_alertas_lidos",
      { title: "Marcar alertas como lidos", description: "Marca alertas como lidos. Sem ids, marca todos os pendentes.", inputSchema: z.object({ ids: z.array(z.string()).optional() }) },
      async ({ ids }) => texto(`${await marcarAlertasLidos(ids)} alerta(s) marcado(s) como lido(s).`),
    );

    server.registerTool(
      "cadastrar_empresa",
      { title: "Cadastrar empresa", description: "Cadastra uma empresa do grupo.", inputSchema: z.object({ nome: z.string(), cnpj: z.string().optional(), apelido: z.string().optional() }) },
      async (input) => json(await cadastrarEmpresa(input)),
    );

    server.registerTool(
      "cadastrar_documento",
      {
        title: "Cadastrar CPF/CNPJ para monitorar",
        description: "Cadastra um CPF ou CNPJ para monitoramento de novos processos. Com provedor premium (Judit/Escavador) cria o tracking e importa os processos existentes.",
        inputSchema: z.object({ tipo: z.enum(["CPF", "CNPJ"]), numero: z.string(), nome: z.string(), empresa_id: z.string().optional(), observacao: z.string().optional() }),
      },
      async (input) => json(await cadastrarDocumento(input)),
    );

    server.registerTool(
      "cadastrar_processo",
      {
        title: "Cadastrar processo",
        description: "Cadastra um processo pelo número CNJ e faz a primeira sincronização (DataJud ou provedor premium).",
        inputSchema: z.object({
          numero: z.string().describe("Número CNJ, ex.: 0001234-56.2024.8.08.0024"),
          descricao: z.string().optional().describe("Apelido/resumo interno"),
          empresa_id: z.string().optional(),
          documento_id: z.string().optional(),
        }),
      },
      async (input) => {
        const r = await cadastrarProcesso(input);
        return texto(
          `Processo ${r.processo.numero_formatado} cadastrado (tribunal: ${r.processo.tribunal ?? "?"}). ` +
            (r.erro ? `Primeira sincronização falhou: ${r.erro}` : `${r.novas} movimentação(ões) importada(s).`),
        );
      },
    );

    server.registerTool(
      "sincronizar_agora",
      { title: "Sincronizar agora", description: "Força a consulta às fontes. Com `numero`, só aquele processo; sem, todos os ativos.", inputSchema: z.object({ numero: z.string().optional() }) },
      async ({ numero }) => {
        if (numero) {
          const p = await store.getProcessoPorNumero(somenteDigitos(numero));
          if (!p) return texto("Processo não cadastrado.");
          return texto(`Sincronizado ${p.numero_formatado}: ${await sincronizarProcesso(p)} movimentação(ões) nova(s).`);
        }
        const r = await sincronizarTudo();
        return texto(`Sincronização completa: ${r.verificados} verificado(s), ${r.novas} nova(s), ${r.erros.length} erro(s).${r.erros.length ? "\n" + r.erros.join("\n") : ""}`);
      },
    );

    server.registerTool(
      "documentos_importados",
      {
        title: "Documentos (PDFs) importados",
        description: "Lista os PDFs importados com a análise feita (tipo da peça, resumo, partes, prazos, providência recomendada). Com `numero`, só os do processo.",
        inputSchema: z.object({ numero: z.string().optional(), limite: z.number().int().min(1).max(100).default(20) }),
      },
      async ({ numero, limite }) => {
        const lista = numero ? await store.listarArquivosDoProcesso(somenteDigitos(numero)) : await store.listarArquivos(limite);
        if (lista.length === 0) return texto("Nenhum documento importado.");
        return json(lista.map((a) => ({ id: a.id, nome: a.nome, importado_em: a.created_at, processos: a.processos.map(formatarCnj), analise: a.analise, avisos: a.avisos })));
      },
    );

    server.registerTool(
      "resumo_geral",
      { title: "Resumo geral", description: "Visão geral: contagens, última sincronização e processos com erro.", inputSchema: z.object({}) },
      async () => {
        const [processos, docs, alertas, log, lista] = await Promise.all([
          store.contarProcessosAtivos(), store.contarDocumentosAtivos(), store.contarAlertasNaoLidos(), store.ultimoSyncLog(), store.listarProcessos({ apenasAtivos: true }),
        ]);
        const comErro = lista.filter((p) => p.ultimo_erro);
        return texto(
          [
            `Processos ativos: ${processos}`,
            `CPFs/CNPJs monitorados: ${docs}`,
            `Alertas pendentes: ${alertas}`,
            `Última sincronização: ${log ? `${fmtDataHora(log.iniciado_em)} — ${log.processos_verificados} verificados, ${log.novas_movimentacoes} novas, ${log.erros} erros` : "nunca"}`,
            comErro.length ? `Processos com erro:\n${comErro.map((p) => `  • ${p.numero_formatado}: ${p.ultimo_erro}`).join("\n")}` : "",
            `Data de hoje: ${fmtData(new Date().toISOString())}`,
          ].filter(Boolean).join("\n"),
        );
      },
    );
  },
  { serverInfo: { name: "juridico-monitor", version: "0.2.0" } },
);

/**
 * Aceita o token como Bearer (Claude Code, mcp-remote) ou como ?token= na URL
 * (conector personalizado do Claude.ai / Desktop, que só pede a URL).
 */
const verificarToken = (req: Request, bearer?: string): AuthInfo | undefined => {
  const esperado = process.env.MCP_TOKEN;
  if (!esperado) return undefined;
  const daUrl = new URL(req.url).searchParams.get("token") ?? undefined;
  const recebido = bearer ?? daUrl;
  if (recebido !== esperado) return undefined;
  return { token: recebido, clientId: "juridico-monitor", scopes: [] };
};

const protegido = withMcpAuth(handler, verificarToken, { required: true });
export { protegido as GET, protegido as POST, protegido as DELETE };
