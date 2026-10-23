/**
 * Agendador da atualização automática (Cloud Functions do Firebase).
 *
 * De hora em hora chama GET /api/cron/sync do sistema, autenticando com o segredo
 * CRON_SECRET lido do Secret Manager do próprio projeto — o mesmo que o App Hosting usa.
 * O valor nunca fica em arquivo nem passa por quem faz o deploy.
 *
 * Deploy:  firebase deploy --only functions:agendador
 * O endereço do sistema vem de APP_URL (arquivo .env.<id-do-projeto> nesta pasta).
 */
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret, defineString } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");

const CRON_SECRET = defineSecret("CRON_SECRET");
const APP_URL = defineString("APP_URL");

exports.sincronizarDeHoraEmHora = onSchedule(
  {
    schedule: "0 * * * *",
    timeZone: "America/Sao_Paulo",
    region: "us-central1",
    secrets: [CRON_SECRET],
    timeoutSeconds: 360,
    memory: "256MiB",
    // Até 2 novas tentativas se a CHAMADA falhar (ex.: 22/10 às 19h a invocação caiu na
    // infraestrutura do Google antes de começar). O sistema responde 200 mesmo quando o CNJ
    // falha, então a repetição só acontece em falha de infraestrutura, não de fonte.
    retryCount: 2,
    minBackoffSeconds: 60,
  },
  async () => {
    const url = `${APP_URL.value().replace(/\/$/, "")}/api/cron/sync`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${CRON_SECRET.value()}` },
      signal: AbortSignal.timeout(330_000),
    });
    const corpo = (await res.text()).slice(0, 1000);
    if (!res.ok) {
      logger.error("Atualização automática falhou", { status: res.status, corpo });
      throw new Error(`/api/cron/sync respondeu ${res.status}`);
    }
    logger.info("Atualização automática concluída", { corpo });
  },
);
