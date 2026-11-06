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

/**
 * Resumo semanal (segunda-feira, 8h de Brasília).
 *
 * O e-mail de alerta (Cloud Monitoring) olha só os registros ERROR DESTA função — os da
 * atualização de hora em hora ficam nos logs para diagnóstico, mas não geram e-mail.
 * Assim chega no máximo 1 e-mail por semana, e só quando houve problema.
 *
 * "Problema" = algum processo ficou mais de 6h sem verificação (atrasados), rodada que
 * começou e nunca terminou, ou 3+ horas sem nenhuma rodada. Erros pontuais do CNJ
 * (429, resposta parcial) são normais e recuperados na hora seguinte: entram só como contagem.
 */
const HORAS_SEMANA = 7 * 24;
const TOLERANCIA_HORAS_SEM_RODADA = 2;

exports.resumoSemanal = onSchedule(
  {
    schedule: "0 8 * * 1",
    timeZone: "America/Sao_Paulo",
    region: "us-central1",
    timeoutSeconds: 120,
    memory: "256MiB",
  },
  async () => {
    const { initializeApp, getApps } = require("firebase-admin/app");
    const { getFirestore } = require("firebase-admin/firestore");
    if (!getApps().length) initializeApp();

    const fim = Date.now();
    const inicio = fim - HORAS_SEMANA * 3600_000;
    const snap = await getFirestore()
      .collection("sync_log")
      .where("iniciado_em", ">=", new Date(inicio).toISOString())
      .get();

    const horas = new Set();
    let inacabadas = 0;
    let comErro = 0;
    const atrasados = new Set();
    for (const doc of snap.docs) {
      const r = doc.data();
      const t = Date.parse(r.iniciado_em);
      if (Number.isNaN(t)) continue;
      horas.add(Math.floor(t / 3600_000));
      if (!r.finalizado_em && fim - t > 3600_000) inacabadas++;
      if (r.erros > 0) comErro++;
      for (const p of r.detalhes?.atrasados ?? []) atrasados.add(typeof p === "string" ? p : p?.numero ?? JSON.stringify(p));
    }
    const horasSemRodada = Math.max(0, HORAS_SEMANA - horas.size);

    const problemas = [];
    if (atrasados.size) problemas.push(`${atrasados.size} processo(s) ficaram mais de 6h sem verificação (${[...atrasados].join(", ")})`);
    if (inacabadas) problemas.push(`${inacabadas} rodada(s) começaram e não terminaram`);
    if (horasSemRodada > TOLERANCIA_HORAS_SEM_RODADA) problemas.push(`${horasSemRodada} hora(s) sem nenhuma atualização`);

    const resumo = {
      periodo: `${new Date(inicio).toISOString()} a ${new Date(fim).toISOString()}`,
      rodadas: snap.size,
      horas_com_rodada: horas.size,
      rodadas_com_erro_pontual: comErro,
    };
    if (problemas.length) {
      // write() em vez de error(): grava a mensagem limpa, sem o "Error:" e a pilha de chamadas.
      logger.write({ severity: "ERROR", message: `Jurídico Monitor — semana com problema na atualização: ${problemas.join("; ")}.`, ...resumo });
    } else {
      logger.info("Jurídico Monitor — semana sem problemas na atualização.", resumo);
    }
  },
);
