"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_SESSAO, criarSessao } from "@/lib/auth";
import { autenticar } from "@/lib/usuarios";

export type LoginState = { erro?: string } | undefined;

export async function loginAction(_: LoginState, fd: FormData): Promise<LoginState> {
  const usuario = String(fd.get("usuario") ?? "").trim();
  const senha = String(fd.get("senha") ?? "");
  const next = String(fd.get("next") ?? "/");
  let u;
  try {
    u = await autenticar(usuario, senha);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { erro: msg.startsWith("Muitas tentativas") ? msg : `Falha ao consultar usuários: ${msg}` };
  }
  if (!u) {
    await new Promise((r) => setTimeout(r, 600)); // desacelera tentativas
    return { erro: "Usuário ou senha incorretos." };
  }
  const { valor, expira } = await criarSessao(u.login);
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
