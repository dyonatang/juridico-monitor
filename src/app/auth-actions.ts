"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_SESSAO, COOKIE_SESSAO_ANTIGO, criarSessao } from "@/lib/auth";
import { autenticar } from "@/lib/usuarios";
import { pedirLinkRecuperacao, redefinirComLink } from "@/lib/recuperacao";
import { registrarAuditoria } from "@/lib/auditoria";

export type LoginState = { erro?: string } | undefined;

/**
 * De onde veio o pedido, para o log de auditoria. O 1º endereço do X-Forwarded-For é o que o
 * Google recebeu do navegador; quem quiser pode forjar esse cabeçalho, então serve como pista,
 * não como prova.
 */
async function origemDoPedido(): Promise<string> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim().slice(0, 64) || "?";
  const ua = (h.get("user-agent") ?? "").replace(/\s+/g, " ").slice(0, 120);
  return `IP ${ip}${ua ? ` · ${ua}` : ""}`;
}
const loginDigitado = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9._@-]/g, "").slice(0, 60) || "(vazio)";

export async function loginAction(_: LoginState, fd: FormData): Promise<LoginState> {
  const usuario = String(fd.get("usuario") ?? "").trim();
  const senha = String(fd.get("senha") ?? "");
  const next = String(fd.get("next") ?? "/");
  const origem = await origemDoPedido();
  let u;
  try {
    u = await autenticar(usuario, senha);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith("Muitas tentativas")) {
      await registrarAuditoria("login_bloqueado", { tipo: "login", id: loginDigitado(usuario), rotulo: origem }, "visitante");
      return { erro: msg };
    }
    return { erro: `Falha ao consultar usuários: ${msg}` };
  }
  if (!u) {
    await registrarAuditoria("errou_senha", { tipo: "login", id: loginDigitado(usuario), rotulo: origem }, "visitante");
    await new Promise((r) => setTimeout(r, 600)); // desacelera tentativas
    return { erro: "Usuário ou senha incorretos." };
  }
  await registrarAuditoria("entrou", { tipo: "login", id: u.login, rotulo: origem }, u.login);
  const { valor, expira } = await criarSessao(u.login, u.sessao_versao ?? 0);
  (await cookies()).set(COOKIE_SESSAO, valor, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expira,
    path: "/",
  });
  (await cookies()).delete(COOKIE_SESSAO_ANTIGO);
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logoutAction() {
  const jar = await cookies();
  jar.delete(COOKIE_SESSAO);
  jar.delete(COOKIE_SESSAO_ANTIGO);
  redirect("/login");
}

// ------------------------------------------------------------------ Esqueci minha senha
export type RecuperacaoState = { erro?: string; ok?: string } | undefined;

export async function pedirRecuperacaoAction(_: RecuperacaoState, fd: FormData): Promise<RecuperacaoState> {
  const identificador = String(fd.get("usuario") ?? "").trim();
  if (!identificador) return { erro: "Informe seu usuário ou e-mail." };
  try {
    await pedirLinkRecuperacao(identificador);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { erro: msg.includes("configurada") ? msg : "Não foi possível enviar agora. Tente de novo em alguns minutos." };
  }
  return { ok: "Se esse usuário tiver e-mail cadastrado, o link chega em instantes. Confira também a caixa de spam. O link vale por pouco tempo e só funciona uma vez." };
}

export async function redefinirSenhaComLinkAction(_: RecuperacaoState, fd: FormData): Promise<RecuperacaoState> {
  const login = String(fd.get("u") ?? "");
  const oobCode = String(fd.get("oobCode") ?? "");
  const senha = String(fd.get("senha") ?? "");
  const confirmar = String(fd.get("confirmar") ?? "");
  if (senha !== confirmar) return { erro: "As duas senhas não são iguais." };
  try {
    await redefinirComLink(login, oobCode, senha);
  } catch (e) {
    return { erro: e instanceof Error ? e.message : String(e) };
  }
  return { ok: "Senha trocada. Já pode entrar com a nova senha." };
}
