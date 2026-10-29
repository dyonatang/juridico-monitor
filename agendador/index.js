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
    const texto = await res.text();
    const corpo = texto.slice(0, 1000);
    if (!res.ok) {
      logger.error("Atualização automática falhou", { status: res.status, corpo });
      throw new Error(`/api/cron/sync respondeu ${res.status}`);
    }
    // Registro de severidade ERROR é o que dispara o e-mail do alerta no Cloud Monitoring.
    // Atraso não relança a função (não adianta repetir já: a fonte está fora), só avisa.
    let atrasados = [];
    try { atrasados = JSON.parse(texto).atrasados ?? []; } catch { /* resposta fora do formato: segue como concluída */ }
    if (atrasados.length) {
      logger.error(`Processos sem verificação há mais de 6 horas: ${atrasados.length}`, { atrasados, corpo });
      return;
    }
    logger.info("Atualização automática concluída", { corpo });
  },
);
