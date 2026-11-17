/**
 * Consultas ao CNJ (DataJud e DJEN) pela "ponte" em São Paulo (agendador/ponte-cnj.js).
 *
 * Desde 12/11/2026 o CNJ barra o endereço do App Hosting (us-central1, EUA): DJEN 403 em tudo,
 * DataJud 429 em quase tudo. Com CNJ_PONTE_URL configurado, o pedido vai para a função em
 * southamerica-east1, que faz a consulta e devolve status e corpo como vieram. Sem a variável
 * (ex.: rodando no computador local, que o CNJ aceita), consulta direto.
 */
export async function fetchCnj(url: string, init: { method?: "GET" | "POST"; headers?: Record<string, string>; body?: string; signal?: AbortSignal; timeoutMs?: number } = {}): Promise<Response> {
  const ponte = process.env.CNJ_PONTE_URL;
  const segredo = process.env.CRON_SECRET;
  if (!ponte || !segredo) {
    return fetch(url, { method: init.method ?? "GET", headers: init.headers, body: init.body, cache: "no-store", signal: init.signal });
  }
  return fetch(ponte, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${segredo}` },
    body: JSON.stringify({ url, method: init.method ?? "GET", headers: init.headers ?? {}, body: init.body, timeoutMs: init.timeoutMs }),
    cache: "no-store",
    signal: init.signal,
  });
}
