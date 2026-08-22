import { NextRequest, NextResponse } from "next/server";
import * as store from "@/lib/store";
import { idsConhecidos, ingerirDocumento, ingerirProcesso, type JusbrDocumento, type JusbrProcesso } from "@/lib/jusbr";
import { notificarPendentes } from "@/lib/notify";
import { formatarDocumento } from "@/lib/format";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * API usada pelo agente do jus.br (roda no servidor do grupo).
 * Autenticação: Authorization: Bearer <INGEST_TOKEN>
 *
 *  GET  /api/ingestao                      → alvos: CPFs/CNPJs ativos, processos ativos e ids de peças já importadas
 *  POST /api/ingestao  { tipo: "processo",  processo: JusbrProcesso, vinculo?: {documento_id} }
 *  POST /api/ingestao  { tipo: "documento", documento: JusbrDocumento }
 *  POST /api/ingestao  { tipo: "lote",      processos?: [...], documentos?: [...] }   (vários de uma vez)
 *  POST /api/ingestao  { tipo: "status",    mensagem, nivel: "info"|"erro" }          (agente reporta problemas, ex.: sessão expirada)
 */
/** CORS: permite o carregador rodar de dentro do navegador (página do jus.br → este servidor). */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Private-Network": "true",
};
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: CORS });

function autorizado(req: NextRequest) {
  const t = process.env.INGEST_TOKEN;
  if (!t) return false;
  const h = req.headers.get("authorization") ?? "";
  return h === `Bearer ${t}`;
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return json({ error: "unauthorized" }, 401);
  const [docs, processos, conhecidos] = await Promise.all([store.listarDocumentos(true), store.listarProcessos({ apenasAtivos: true }), idsConhecidos()]);
  return json({
    documentos: docs.map((d) => ({ id: d.id, tipo: d.tipo, numero: d.numero, numero_formatado: formatarDocumento(d.tipo, d.numero), nome: d.nome })),
    processos: processos.map((p) => ({ numero: p.numero_cnj, numero_formatado: p.numero_formatado, pecas_conhecidas: conhecidos[p.numero_cnj] ?? [] })),
    gerado_em: store.agora(),
  });
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => null);
  if (!body?.tipo) return json({ error: "body inválido" }, 400);

  try {
    if (body.tipo === "status") {
      if (body.nivel === "erro") {
        await store.inserirAlertas([{ tipo: "erro", processo_id: null, documento_id: null, movimentacao_id: null, titulo: "Agente jus.br: problema", mensagem: String(body.mensagem ?? "") }]);
        await notificarPendentes();
      }
      await store.finalizarSyncLog(await store.iniciarSyncLog(), { detalhes: { agente: "jusbr", nivel: body.nivel, mensagem: body.mensagem } });
      return json({ ok: true });
    }

    const processos: JusbrProcesso[] = body.tipo === "processo" ? [body.processo] : body.processos ?? [];
    const documentos: JusbrDocumento[] = body.tipo === "documento" ? [body.documento] : body.documentos ?? [];
    const resultado = { processos: [] as unknown[], documentos: [] as unknown[], erros: [] as string[] };

    for (const p of processos) {
      try {
        resultado.processos.push(await ingerirProcesso(p, body.vinculo));
      } catch (e) {
        resultado.erros.push(`processo ${p?.numero}: ${e instanceof Error ? e.message : e}`);
      }
    }
    for (const d of documentos) {
      try {
        resultado.documentos.push(await ingerirDocumento(d));
      } catch (e) {
        resultado.erros.push(`documento ${d?.idCodex} (${d?.numero}): ${e instanceof Error ? e.message : e}`);
      }
    }
    await notificarPendentes();
    return json({ ok: resultado.erros.length === 0, ...resultado });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}
