import { NextRequest, NextResponse } from "next/server";
import * as store from "@/lib/store";
import { lerArquivo } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Entrega o PDF importado (protegido pela sessão do dashboard via proxy). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
