/**
 * "Esqueci minha senha" com o envio de e-mail gratuito do Firebase Authentication.
 *
 * Fluxo:
 *  1. /login/esqueci — a pessoa informa usuário ou e-mail. Se houver usuário ativo com e-mail
 *     cadastrado, o Firebase envia um link de acesso (accounts:sendOobCode, EMAIL_SIGNIN) que
 *     volta para /login/redefinir?u=<login>&oobCode=…
 *  2. /login/redefinir — a pessoa escolhe a nova senha; o servidor confirma o código com o
 *     Firebase (accounts:signInWithEmailLink — uso único, expira) e só então grava a senha.
 *
 * As senhas continuam no sistema (coleção `usuarios`); o Firebase serve só para provar que a
 * pessoa recebeu o e-mail. A conta que o Firebase cria nesse passo é apagada em seguida.
 * Precisa de FIREBASE_WEB_API_KEY (chave web do projeto, segredo do App Hosting).
 */
import { getAuth } from "firebase-admin/auth";
import * as store from "./store";
import { atualizarUsuario, getUsuario, limparFalhas, resolverUsuario, validarSenhaNova } from "./usuarios";
import { registrarAuditoria } from "./auditoria";

const chave = () => process.env.FIREBASE_WEB_API_KEY || "";
export const recuperacaoDisponivel = () => !!chave();
const urlPublica = () => (process.env.URL_PUBLICA || "https://dfv-juridico.web.app").replace(/\/$/, "");
/** Um pedido a cada 2 minutos por usuário (o Firebase também limita). */
const INTERVALO_PEDIDOS_MS = 2 * 60_000;

async function identityToolkit(metodo: string, corpo: Record<string, unknown>) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/${metodo}?key=${encodeURIComponent(chave())}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Firebase-Locale": "pt-BR" },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(20_000),
  });
  const j = (await r.json().catch(() => ({}))) as { error?: { message?: string }; email?: string; localId?: string };
  if (!r.ok) throw new Error(j.error?.message || `HTTP ${r.status}`);
  return j;
}

/**
 * Envia o link, se o usuário existir e tiver e-mail. Não diz à tela se encontrou ou não
 * (para não revelar quais usuários existem) — a resposta é sempre a mesma.
 */
export async function pedirLinkRecuperacao(identificador: string): Promise<void> {
  if (!recuperacaoDisponivel()) throw new Error("Recuperação por e-mail ainda não configurada.");
  const u = await resolverUsuario(identificador);
  if (!u || !u.ativo || !u.email) return;
  const ref = store.fs().collection("recuperacao_senha").doc(u.login);
  const ultimo = await ref.get();
  const pedidoEm = ultimo.exists ? new Date((ultimo.data() as { pedido_em: string }).pedido_em).getTime() : 0;
  if (Date.now() - pedidoEm < INTERVALO_PEDIDOS_MS) return;
  await ref.set({ pedido_em: store.agora() });
  await identityToolkit("accounts:sendOobCode", {
    requestType: "EMAIL_SIGNIN",
    email: u.email,
    continueUrl: `${urlPublica()}/login/redefinir?u=${encodeURIComponent(u.login)}`,
    canHandleCodeInApp: true,
  });
  await registrarAuditoria("redefiniu_senha", { tipo: "usuario", id: u.login, rotulo: "pediu link de recuperação por e-mail" }, u.login).catch(() => null);
}

/** Confere o código do link e grava a nova senha. */
export async function redefinirComLink(login: string, oobCode: string, novaSenha: string): Promise<void> {
  const invalido = "Link inválido ou expirado. Peça um novo em \"Esqueci minha senha\".";
  validarSenhaNova(novaSenha);
  const u = await getUsuario(login).catch(() => null);
  if (!u || !u.ativo || !u.email || !oobCode) throw new Error(invalido);

  let r;
  try {
    r = await identityToolkit("accounts:signInWithEmailLink", { email: u.email, oobCode });
  } catch {
    throw new Error(invalido);
  }
  if ((r.email ?? "").toLowerCase() !== u.email.toLowerCase()) throw new Error(invalido);

  await atualizarUsuario(u.login, { senha: novaSenha });
  await limparFalhas(u.login);
  await store.fs().collection("recuperacao_senha").doc(u.login).delete().catch(() => null);
  await registrarAuditoria("redefiniu_senha", { tipo: "usuario", id: u.login, rotulo: "trocou a senha pelo link de e-mail" }, u.login).catch(() => null);
  // A conta criada no Firebase Authentication só serviu para validar o link.
  if (r.localId) {
    store.fs(); // garante o app do firebase-admin inicializado
    await getAuth().deleteUser(r.localId).catch(() => null);
  }
}
