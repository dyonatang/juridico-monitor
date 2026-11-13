/**
 * Sessão do dashboard: cookie assinado (HMAC-SHA256) com validade de 14 dias.
 * Usa Web Crypto para funcionar tanto no proxy quanto nas server actions.
 *
 * O cookie leva a "versão da sessão" do usuário (campo `sessao_versao`). Trocar a senha
 * aumenta a versão, e todo login aberto antes (em qualquer aparelho) deixa de valer —
 * a conferência da versão é feita em `usuarioAtual()`, que lê o usuário no banco.
 */
/**
 * Nome do cookie: `__session` é o único que o Firebase Hosting repassa ao sistema (endereço
 * dfv-juridico.web.app). Sessões antigas (`jm_sessao`) continuam valendo até expirar.
 */
export const COOKIE_SESSAO = "__session";
export const COOKIE_SESSAO_ANTIGO = "jm_sessao";
export function lerSessao(jar: { get(nome: string): { value: string } | undefined }): string | undefined {
  return jar.get(COOKIE_SESSAO)?.value ?? jar.get(COOKIE_SESSAO_ANTIGO)?.value;
}
const DIAS = 14;

const segredo = () =>
  process.env.SESSION_SECRET || process.env.MCP_TOKEN || process.env.DASHBOARD_PASSWORD || "dev-sem-segredo";

async function assinar(msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Compara duas strings em tempo constante (evita timing attack), sem depender de
 * node:crypto — funciona também no Edge runtime (usado pelo proxy). Tamanhos
 * diferentes já vazam pouco (nenhum segredo real usado aqui tem tamanho secreto).
 */
export function compararSeguro(a: string, b: string): boolean {
  const max = Math.max(a.length, b.length, 1);
  let diff = a.length ^ b.length;
  for (let i = 0; i < max; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export function credenciaisValidas(usuario: string, senha: string) {
  const u = process.env.DASHBOARD_USER;
  const s = process.env.DASHBOARD_PASSWORD;
  if (!u || !s) return false;
  return compararSeguro(usuario, u) && compararSeguro(senha, s);
}

export type Sessao = { login: string; versao: number };

/** Gera o valor do cookie: usuario.versao.expira.assinatura */
export async function criarSessao(usuario: string, versao = 0): Promise<{ valor: string; expira: Date }> {
  const expira = new Date(Date.now() + DIAS * 86400000);
  const exp = String(expira.getTime());
  const v = String(Math.max(0, Math.trunc(versao)));
  const sig = await assinar(`${usuario}|${v}|${exp}`);
  return { valor: `${encodeURIComponent(usuario)}.${v}.${exp}.${sig}`, expira };
}

/**
 * Retorna login e versão se o cookie for válido e não expirado; senão null.
 * Lido da direita para a esquerda: o login pode ter ponto (ex.: "maria.silva").
 * Cookies do formato antigo (sem versão) não valem mais — a pessoa entra de novo uma vez.
 */
export async function validarSessao(valor: string | undefined): Promise<Sessao | null> {
  if (!valor) return null;
  const partes = valor.split(".");
  if (partes.length < 4) return null;
  const sig = partes.pop()!;
  const exp = partes.pop()!;
  const v = partes.pop()!;
  const u = partes.join(".");
  if (!u || !/^\d{1,9}$/.test(v) || !/^\d{1,15}$/.test(exp) || !sig) return null;
  if (Number(exp) < Date.now()) return null;
  let usuario: string;
  try {
    usuario = decodeURIComponent(u);
  } catch {
    return null;
  }
  const esperado = await assinar(`${usuario}|${v}|${exp}`);
  return compararSeguro(esperado, sig) ? { login: usuario, versao: Number(v) } : null;
}
