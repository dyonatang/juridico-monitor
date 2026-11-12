import { NextRequest, NextResponse } from "next/server";
import { compararSeguro } from "@/lib/auth";
import { executarTarefa } from "@/lib/tarefas";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Executa uma tarefa em segundo plano (coleção `tarefas`). Chamado pela Cloud Function
 * `executarTarefa` quando a tarefa é criada, com o mesmo CRON_SECRET dos robôs.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET não configurado" }, { status: 503 });
  const auth = req.headers.get("authorization") ?? "";
  if (!compararSeguro(auth, `Bearer ${secret}`)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!/^[A-Za-z0-9]{10,40}$/.test(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });
  const t = await executarTarefa(id);
  if (!t) return NextResponse.json({ error: "tarefa não encontrada" }, { status: 404 });
  return NextResponse.json({ ok: true, id, tipo: t.tipo, status: t.status, mensagem: t.mensagem ?? null });
}
