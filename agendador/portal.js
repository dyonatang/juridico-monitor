/**
 * Ponte do endereço dfv-juridico.web.app (Firebase Hosting) para o sistema no App Hosting.
 *
 * Por que uma ponte: o serviço do App Hosting só aceita chamadas da própria infraestrutura
 * (o rewrite direto do Hosting para o Cloud Run dá 403), e não queremos abrir permissões.
 * Esta função repassa cada pedido para o endereço do App Hosting (APP_URL) e devolve a
 * resposta, trocando o endereço antigo pelo novo nos redirecionamentos.
 *
 * Limites do Hosting que o sistema respeita:
 *  - 60 s por pedido: tudo que demora (relatório, ficha, leitura de PDF, atualização) roda em
 *    segundo plano (coleção `tarefas`), e a tela só acompanha o andamento.
 *  - só o cookie `__session` chega aqui: a sessão de login usa esse nome; o tema é aplicado
 *    no navegador.
 */
const { onRequest } = require("firebase-functions/v2/https");
const { defineString } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");

const APP_URL = defineString("APP_URL");

// Cabeçalhos que não devem ser repassados (de conexão, ou que o fetch recalcula/decodifica).
const NAO_REPASSAR_PEDIDO = new Set(["host", "connection", "content-length", "accept-encoding", "transfer-encoding", "forwarded"]);
const NAO_REPASSAR_RESPOSTA = new Set(["connection", "content-length", "content-encoding", "transfer-encoding", "keep-alive", "set-cookie"]);

exports.portal = onRequest(
  { region: "us-central1", timeoutSeconds: 60, memory: "256MiB", concurrency: 80, maxInstances: 5, invoker: "public" },
  async (req, res) => {
    const base = APP_URL.value().replace(/\/$/, "");
    const destino = base + req.originalUrl;
    const publico = `https://${req.get("x-forwarded-host") || "dfv-juridico.web.app"}`;

    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (NAO_REPASSAR_PEDIDO.has(k) || v === undefined) continue;
      headers[k] = Array.isArray(v) ? v.join(", ") : v;
    }

    let resp;
    try {
      resp = await fetch(destino, {
        method: req.method,
        headers,
        body: ["GET", "HEAD"].includes(req.method) ? undefined : req.rawBody,
        redirect: "manual",
        signal: AbortSignal.timeout(58_000),
      });
    } catch (e) {
      logger.error("Ponte: o sistema não respondeu", { url: req.originalUrl, erro: String(e) });
      res.status(502).send("O sistema demorou para responder. Tente de novo em alguns segundos.");
      return;
    }

    res.status(resp.status);
    resp.headers.forEach((v, k) => {
      if (NAO_REPASSAR_RESPOSTA.has(k)) return;
      if (k === "location") v = v.split(base).join(publico);
      res.setHeader(k, v);
    });
    const cookies = resp.headers.getSetCookie?.() ?? [];
    if (cookies.length) res.setHeader("set-cookie", cookies);

    if (!resp.body || req.method === "HEAD") { res.end(); return; }
    for await (const parte of resp.body) res.write(parte);
    res.end();
  },
);
