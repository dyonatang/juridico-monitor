import { NextRequest, NextResponse } from "next/server";
import * as store from "@/lib/store";
import { compararSeguro } from "@/lib/auth";
import { somenteDigitos } from "@/lib/format";
import { provedorPremium } from "@/lib/providers";
import { aplicarRemoto, upsertProcessoRemoto } from "@/lib/sync";
import { notificarPendentes } from "@/lib/notify";

export const dynamic = "force-dynamic";

/**
 * Callback do Escavador. O payload varia por evento, então: extrai todos os números CNJ
 * presentes no JSON e re-consulta cada um via API.
 */
export async function POST(req: NextRequest) {
  if (process.env.WEBHOOK_SECRET && !compararSeguro(req.nextUrl.searchParams.get("secret") ?? "", process.env.WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const texto = await req.text();
  const cnjs = new Set<string>();
  for (const m of texto.matchAll(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/g)) cnjs.add(somenteDigitos(m[0]));
  if (cnjs.size === 0) return NextResponse.json({ ok: true, ignorado: true });

  const provider = provedorPremium();
  if (!provider || provider.nome !== "escavador") return NextResponse.json({ error: "provedor escavador não configurado" }, { status: 400 });

  let monitoramentoId: string | null = null;
  try {
    const j = JSON.parse(texto);
    monitoramentoId = String(j?.monitoramento_id ?? j?.monitoramento?.id ?? j?.id ?? "") || null;
  } catch {}
  const doc = monitoramentoId ? await store.getDocumentoPorTracking(monitoramentoId) : null;

  let novas = 0;
  for (const cnj of cnjs) {
    const remoto = await provider.consultarProcesso(cnj).catch(() => null);
    if (!remoto) continue;
    const { processo } = await upsertProcessoRemoto(remoto, { origem: "descoberto", documento_id: doc?.id ?? null, provider: "escavador" });
    novas += await aplicarRemoto(processo, remoto, "escavador");
  }
  await notificarPendentes();
  return NextResponse.json({ ok: true, processos: cnjs.size, novas });
}
