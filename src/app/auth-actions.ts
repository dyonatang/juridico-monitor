"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_SESSAO, credenciaisValidas, criarSessao } from "@/lib/auth";

export type LoginState = { erro?: string } | undefined;

export async function loginAction(_: LoginState, fd: FormData): Promise<LoginState> {
  const usuario = String(fd.get("usuario") ?? "").trim();
  const senha = String(fd.get("senha") ?? "");
  const next = String(fd.get("next") ?? "/");
  if (!credenciaisValidas(usuario, senha)) {
    await new Promise((r) => setTimeout(r, 600)); // desacelera tentativas
    return { erro: "Usuário ou senha incorretos." };
  }
  const { valor, expira } = await criarSessao(usuario);
  (await cookies()).set(COOKIE_SESSAO, valor, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expira,
    path: "/",
  });
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logoutAction() {
  (await cookies()).delete(COOKIE_SESSAO);
  redirect("/login");
}
