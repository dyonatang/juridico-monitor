import { NextRequest, NextResponse } from "next/server";
import { sincronizarTudo } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Sincronização periódica. Chamada pelo Vercel Cron (header Authorization: Bearer CRON_SECRET)
 * ou por qualquer agendador externo com ?secret=CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const ok = !secret || auth === `Bearer ${secret}` || req.nextUrl.searchParams.get("secret") === secret;
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const resultado = await sincronizarTudo();
  return NextResponse.json({ ok: true, ...resultado, em: new Date().toISOString() });
}
