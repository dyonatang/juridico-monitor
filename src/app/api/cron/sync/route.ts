import { NextRequest, NextResponse } from "next/server";
import { compararSeguro } from "@/lib/auth";
import { sincronizarTudo } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Sincronização periódica. Chamada pelo Vercel Cron (header Authorization: Bearer CRON_SECRET)
 * ou por qualquer agendador externo com ?secret=CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  // Sem CRON_SECRET configurado a rota fica fechada (antes ficava aberta pra qualquer um).
  if (!secret) return NextResponse.json({ error: "CRON_SECRET não configurado" }, { status: 503 });
  const auth = req.headers.get("authorization") ?? "";
  const daUrl = req.nextUrl.searchParams.get("secret") ?? "";
  const ok = compararSeguro(auth, `Bearer ${secret}`) || compararSeguro(daUrl, secret);
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Robô 4h–10h e 19h–23h (v2.3): cada passada consulta até 4 processos ainda não verificados nesta janela,
  // um por vez; o resto fica na fila para a passada seguinte (10 min depois).
  const resultado = await sincronizarTudo({ soPendentesDaJanela: true, porPassada: 4 });
  return NextResponse.json({ ok: true, ...resultado, em: new Date().toISOString() });
}
