/**
 * Usuários do dashboard — coleção `usuarios/{login}`.
 * Senhas com scrypt (node:crypto). O usuário do .env (DASHBOARD_USER/PASSWORD)
 * continua valendo como acesso de emergência e é promovido a administrador.
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import * as store from "./store";
import { COOKIE_SESSAO, credenciaisValidas, validarSessao } from "./auth";
import type { Usuario, Papel } from "./types";

const normalizarLogin = (l: string) => l.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");

export function hashSenha(senha: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(senha, salt, 64).toString("hex")}`;
}
export function conferirSenha(senha: string, hash: string | null | undefined) {
  if (!hash) return false;
  const [salt, h] = hash.split(":");
  if (!salt || !h) return false;
  const a = Buffer.from(h, "hex");
  const b = scryptSync(senha, salt, 64);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function listarUsuarios(): Promise<Usuario[]> {
  const r = await store.fs().collection("usuarios").get();
  return r.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as Usuario).sort((a, b) => a.nome.localeCompare(b.nome));
}
export async function getUsuario(login: string): Promise<Usuario | null> {
  const d = await store.fs().collection("usuarios").doc(normalizarLogin(login)).get();
  return d.exists ? ({ id: d.id, ...(d.data() as object) } as Usuario) : null;
}

export async function criarUsuario(input: { nome: string; login: string; senha: string; papel: Papel }): Promise<Usuario> {
  const login = normalizarLogin(input.login);
  const nome = input.nome.trim();
  if (!nome) throw new Error("Nome é obrigatório");
  if (login.length < 3) throw new Error("Login deve ter ao menos 3 letras/números (sem espaços)");
  if (input.senha.length < 6) throw new Error("Senha deve ter ao menos 6 caracteres");
  const ref = store.fs().collection("usuarios").doc(login);
  if ((await ref.get()).exists) throw new Error("Já existe um usuário com esse login");
  const u: Usuario = { id: login, login, nome, papel: input.papel, senha_hash: hashSenha(input.senha), ativo: true, ultimo_acesso: null, created_at: store.agora() };
  const { id: _id, ...dados } = u;
  await ref.set(dados);
  return u;
}

export async function atualizarUsuario(login: string, patch: Partial<Pick<Usuario, "nome" | "papel" | "ativo" | "ultimo_acesso">> & { senha?: string }) {
  const { senha, ...resto } = patch;
  const dados: Record<string, unknown> = { ...resto };
  if (senha !== undefined) {
    if (senha.length < 6) throw new Error("Senha deve ter ao menos 6 caracteres");
    dados.senha_hash = hashSenha(senha);
  }
  await store.fs().collection("usuarios").doc(normalizarLogin(login)).update(dados);
}

export async function excluirUsuario(login: string) {
  await store.fs().collection("usuarios").doc(normalizarLogin(login)).delete();
}

export async function contarAdmins() {
  return (await store.fs().collection("usuarios").where("papel", "==", "admin").where("ativo", "==", true).count().get()).data().count;
}

/**
 * Autentica por login/senha. Ordem: banco → .env (emergência).
 * No login pelo .env, garante que esse usuário exista no banco como admin.
 */
export async function autenticar(login: string, senha: string): Promise<Usuario | null> {
  const l = normalizarLogin(login);
  const u = await getUsuario(l).catch(() => null);
  if (u) {
    if (!u.ativo) return null;
    if (!conferirSenha(senha, u.senha_hash)) return null;
    await atualizarUsuario(l, { ultimo_acesso: store.agora() }).catch(() => null);
    return u;
  }
  if (credenciaisValidas(login.trim(), senha)) {
    // acesso de emergência: cria/garante o admin a partir do .env
    try {
      const criado = await criarUsuario({ nome: login.trim(), login: l, senha, papel: "admin" });
      return criado;
    } catch {
      return { id: l, login: l, nome: login.trim(), papel: "admin", senha_hash: null, ativo: true, ultimo_acesso: null, created_at: store.agora() };
    }
  }
  return null;
}

/** Usuário da sessão atual (server-side). null se não logado. */
export async function usuarioAtual(): Promise<Usuario | null> {
  const login = await validarSessao((await cookies()).get(COOKIE_SESSAO)?.value);
  if (!login) return null;
  const u = await getUsuario(login).catch(() => null);
  if (u) return u.ativo ? u : null;
  // sessão antiga do usuário do .env (antes de existir no banco)
  if (process.env.DASHBOARD_USER && login.toLowerCase() === process.env.DASHBOARD_USER.toLowerCase()) {
    return { id: login, login, nome: login, papel: "admin", senha_hash: null, ativo: true, ultimo_acesso: null, created_at: "" };
  }
  return null;
}

export async function exigirAdmin(): Promise<Usuario> {
  const u = await usuarioAtual();
  if (!u) throw new Error("Sessão expirada. Entre novamente.");
  if (u.papel !== "admin") throw new Error("Apenas administradores podem fazer alterações.");
  return u;
}
