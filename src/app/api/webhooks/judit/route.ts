import { NextRequest, NextResponse } from "next/server";
import * as store from "@/lib/store";
import { compararSeguro } from "@/lib/auth";
import { juditParaRemoto, type JuditLawsuit } from "@/lib/providers/judit";
import { aplicarRemoto, upsertProcessoRemoto } from "@/lib/sync";
import { notificarPendentes } from "@/lib/notify";

export const dynamic = "force-dynamic";

/**
 * Webhook da Judit (tracking):
 * { event_type, reference_type: "tracking", reference_id: <tracking_id>, response_type: "lawsuit", response_data: {...} }
 */
export async function POST(req: NextRequest) {
  if (process.env.WEBHOOK_SECRET && !compararSeguro(req.nextUrl.searchParams.get("secret") ?? "", process.env.WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "json inválido" }, { status: 400 });

  const trackingId: string | undefined = body.reference_id;
  const dados = body.response_data;
  const lawsuits: JuditLawsuit[] = Array.isArray(dados) ? dados : dados?.code ? [dados] : Array.isArray(dados?.page_data) ? dados.page_data : [];
  if (lawsuits.length === 0) return NextResponse.json({ ok: true, ignorado: true });

  const doc = trackingId ? await store.getDocumentoPorTracking(trackingId) : null;
  const procTrack = !doc && trackingId ? await store.getProcessoPorTracking(trackingId) : null;

  let novas = 0;
  for (const l of lawsuits) {
    const remoto = juditParaRemoto(l);
    const { processo } = await upsertProcessoRemoto(remoto, {
      origem: "descoberto",
      documento_id: doc?.id ?? procTrack?.documento_id ?? null,
      provider: "judit",
      provider_tracking_id: doc ? null : trackingId,
    });
    novas += await aplicarRemoto(processo, remoto, "judit");
  }
  if (doc) await store.atualizar("documentos", doc.id, { ultimo_check: store.agora() });
  await notificarPendentes();
  return NextResponse.json({ ok: true, processos: lawsuits.length, novas });
}
