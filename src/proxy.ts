import { NextRequest, NextResponse } from "next/server";
import { lerSessao, validarSessao } from "@/lib/auth";

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

  const usuario = await validarSessao(lerSessao(req.cookies));
  if (usuario) {
    if (pathname === "/login") return NextResponse.redirect(new URL("/", req.url));
    return NextResponse.next();
  }
  // Login e "Esqueci minha senha" (/login/esqueci, /login/redefinir) abrem sem sessão.
  if (pathname === "/login" || pathname.startsWith("/login/")) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const login = new URL("/login", req.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Ignora APIs com token próprio, internos do Next e os arquivos públicos da pasta public/
  // (listados um a um). Antes era "qualquer endereço com ponto", o que deixava passar sem
  // login endereços como /processos/x.y — as telas tinham segunda trava, mas os botões não.
  matcher: [
    "/((?!api/mcp|api/cron|api/webhooks|api/ingestao|_next/|favicon\\.png$|favicon\\.ico$|icon\\.svg$|icon-192\\.png$|icon-512\\.png$|icon-512-maskable\\.png$|apple-touch-icon\\.png$|manifest\\.webmanifest$|robots\\.txt$).*)",
  ],
};
