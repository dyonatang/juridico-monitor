/**
 * Sessão do dashboard: cookie assinado (HMAC-SHA256) com validade de 30 dias.
 * Usa Web Crypto para funcionar tanto no proxy quanto nas server actions.
 */
export const COOKIE_SESSAO = "jm_sessao";
const DIAS = 30;

const segredo = () =>
  process.env.SESSION_SECRET || process.env.MCP_TOKEN || process.env.DASHBOARD_PASSWORD || "dev-sem-segredo";

async function assinar(msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function credenciaisValidas(usuario: string, senha: string) {
  const u = process.env.DASHBOARD_USER;
  const s = process.env.DASHBOARD_PASSWORD;
  if (!u || !s) return false;
  return usuario === u && senha === s;
}

/** Gera o valor do cookie: usuario.expira.assinatura */
export async function criarSessao(usuario: string): Promise<{ valor: string; expira: Date }> {
  const expira = new Date(Date.now() + DIAS * 86400000);
  const exp = String(expira.getTime());
  const sig = await assinar(`${usuario}|${exp}`);
  return { valor: `${encodeURIComponent(usuario)}.${exp}.${sig}`, expira };
}

/** Retorna o usuário se o cookie for válido e não expirado; senão null. */
export async function validarSessao(valor: string | undefined): Promise<string | null> {
  if (!valor) return null;
  const [u, exp, sig] = valor.split(".");
  if (!u || !exp || !sig) return null;
  if (Number(exp) < Date.now()) return null;
  const usuario = decodeURIComponent(u);
  const esperado = await assinar(`${usuario}|${exp}`);
  if (esperado.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= esperado.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0 ? usuario : null;
}
