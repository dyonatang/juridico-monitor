import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import * as store from "@/lib/store";
import { COOKIE_SESSAO, validarSessao } from "@/lib/auth";
import { lerArquivo } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Entrega o PDF importado. Normalmente já protegido pelo proxy (exige sessão em
 * tudo fora de /api/mcp|cron|webhooks|ingestao), mas essa rota serve documentos
 * potencialmente sensíveis — confere a sessão de novo aqui, em profundidade,
 * pra não depender só do regex do matcher do proxy nunca ficar desatualizado.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (process.env.DASHBOARD_USER && process.env.DASHBOARD_PASSWORD) {
    const usuario = await validarSessao((await cookies()).get(COOKIE_SESSAO)?.value);
    if (!usuario) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const a = await store.getArquivo(id);
  if (!a) return NextResponse.json({ error: "não encontrado" }, { status: 404 });
  const bytes = await lerArquivo(a.storage_path);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${encodeURIComponent(a.nome)}"`,
      "Cache-Control": "private, max-age=0",
    },
  });
}
