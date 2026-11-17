/**
 * Ponte CNJ — consultas ao DataJud e ao DJEN saindo de São Paulo.
 *
 * Por que existe (17/11/2026): o sistema roda no App Hosting em us-central1 (EUA) e o CNJ
 * passou a barrar esse endereço — o DJEN respondia 403 a todas as consultas desde 12/11 e o
 * DataJud recusava (429) quase tudo. O mesmo pedido saindo do Google em São Paulo
 * (southamerica-east1) foi aceito: DJEN 200 em 0,05 s; DataJud 2 de 3 completas.
 *
 * Segurança: não é um proxy aberto. Só aceita pedidos com o CRON_SECRET (o mesmo dos robôs)
 * e só repassa para os dois endereços públicos do CNJ, com uma lista fechada de cabeçalhos.
 *
 * Contrato: POST { url, method?, headers?, body?, timeoutMs? } com Authorization: Bearer
 * <CRON_SECRET>. Devolve o status e o corpo da resposta do CNJ como vieram. Falha da própria
 * ponte = 502 com { erro_ponte }.
 */
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const { timingSafeEqual } = require("node:crypto");

const CRON_SECRET = defineSecret("CRON_SECRET");

const DESTINOS = ["https://api-publica.datajud.cnj.jus.br/", "https://comunicaapi.pje.jus.br/"];
const CABECALHOS = new Set(["accept", "authorization", "content-type", "user-agent"]);
const TIMEOUT_MAX_MS = 100_000;

function igual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

exports.ponteCnj = onRequest(
  { region: "southamerica-east1", secrets: [CRON_SECRET], timeoutSeconds: 120, memory: "256MiB", concurrency: 20, maxInstances: 3, invoker: "public" },
  async (req, res) => {
    if (req.method !== "POST") { res.status(405).json({ erro_ponte: "use POST" }); return; }
    if (!igual(req.get("authorization") ?? "", `Bearer ${CRON_SECRET.value()}`)) { res.status(401).json({ erro_ponte: "unauthorized" }); return; }

    const { url, method = "GET", headers = {}, body, timeoutMs } = req.body ?? {};
    if (typeof url !== "string" || !DESTINOS.some((d) => url.startsWith(d))) {
      res.status(400).json({ erro_ponte: "destino não permitido" });
      return;
    }
    if (!["GET", "POST"].includes(method)) { res.status(400).json({ erro_ponte: "método não permitido" }); return; }
    const h = {};
    for (const [k, v] of Object.entries(headers)) if (CABECALHOS.has(k.toLowerCase()) && typeof v === "string") h[k] = v;

    const limite = Math.min(Math.max(Number(timeoutMs) || 60_000, 5_000), TIMEOUT_MAX_MS);
    const t = Date.now();
    let r;
    try {
      r = await fetch(url, { method, headers: h, body: method === "POST" && typeof body === "string" ? body : undefined, signal: AbortSignal.timeout(limite) });
    } catch (e) {
      const nome = e instanceof Error ? e.name : "";
      const tempo = nome === "TimeoutError" || nome === "AbortError";
      logger.warn("Ponte CNJ: sem resposta", { destino: new URL(url).host, tempo, s: (Date.now() - t) / 1000 });
      res.status(tempo ? 504 : 502).json({ erro_ponte: tempo ? "CNJ não respondeu a tempo" : "falha de rede" });
      return;
    }
    const texto = await r.text();
    res.status(r.status);
    res.set("Content-Type", r.headers.get("content-type") ?? "application/json");
    res.send(texto);
  },
);
