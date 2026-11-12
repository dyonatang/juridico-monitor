import { NextRequest, NextResponse } from "next/server";
import { getTarefa, situacao } from "@/lib/tarefas";
import { usuarioAtual } from "@/lib/usuarios";

export const dynamic = "force-dynamic";

/** Situação de uma tarefa em segundo plano, para a tela acompanhar (exige sessão). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (process.env.DASHBOARD_USER && process.env.DASHBOARD_PASSWORD && !(await usuarioAtual())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const t = await getTarefa(id).catch(() => null);
  if (!t) return NextResponse.json({ error: "não encontrada" }, { status: 404 });
  const s = situacao(t);
  return NextResponse.json(
    { id: t.id, tipo: t.tipo, status: s.status, mensagem: s.mensagem, resultado: t.resultado ?? null, criado_em: t.criado_em, iniciado_em: t.iniciado_em ?? null },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
