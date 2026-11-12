import { NextRequest, NextResponse } from "next/server";
import { compararSeguro } from "@/lib/auth";
import { sincronizarPublicacoes } from "@/lib/djen";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Robô de publicações (DJEN). Chamado pelo agendador às 6h e às 18h (3 passadas por janela),
 * com o mesmo CRON_SECRET da sincronização de andamentos.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET não configurado" }, { status: 503 });
  const auth = req.headers.get("authorization") ?? "";
  const daUrl = req.nextUrl.searchParams.get("secret") ?? "";
  const ok = compararSeguro(auth, `Bearer ${secret}`) || compararSeguro(daUrl, secret);
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const resultado = await sincronizarPublicacoes();
  return NextResponse.json({ ok: true, ...resultado, em: new Date().toISOString() });
}
