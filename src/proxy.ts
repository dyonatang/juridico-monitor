import { NextRequest, NextResponse } from "next/server";
import { COOKIE_SESSAO, validarSessao } from "@/lib/auth";

/**
 * Exige sessão (cookie assinado) em todas as telas e em /api/arquivos.
 * /api/mcp, /api/cron e /api/webhooks têm autenticação própria por token.
 */
export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (!process.env.DASHBOARD_USER || !process.env.DASHBOARD_PASSWORD) {
    // Sem credenciais configuradas só se libera em desenvolvimento local; em produção um
    // segredo faltando NÃO pode abrir o sistema — falha fechado.
    if (process.env.NODE_ENV !== "production") return NextResponse.next();
    return new NextResponse("Sistema sem credenciais configuradas (DASHBOARD_USER/DASHBOARD_PASSWORD).", { status: 503 });
  }

  const usuario = await validarSessao(req.cookies.get(COOKIE_SESSAO)?.value);
  if (usuario) {
    if (pathname === "/login") return NextResponse.redirect(new URL("/", req.url));
    return NextResponse.next();
  }
  if (pathname === "/login") return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const login = new URL("/login", req.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Ignora APIs com token próprio, internos do Next e arquivos estáticos (ícones, manifest etc.)
  matcher: ["/((?!api/mcp|api/cron|api/webhooks|api/ingestao|_next/|.*\\..*).*)"],
};
