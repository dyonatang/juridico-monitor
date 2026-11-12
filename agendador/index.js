/**
 * Agendador dos robôs automáticos (Cloud Functions do Firebase).
 *
 * v2.1 (12/11/2026, a pedido do usuário): em vez de consultar de hora em hora — o CNJ recusava
 * (429) em quase toda rodada —, os robôs rodam em duas janelas por dia, 6h e 18h de Brasília:
 *  - roboAndamentos  → GET /api/cron/sync        (DataJud/CNJ)  às :00, :20 e :40
 *  - roboPublicacoes → GET /api/cron/publicacoes (DJEN, texto das publicações) às :10, :30 e :50
 * A 1ª passada de cada janela consulta tudo; as seguintes só o que a fonte recusou ou não
 * coube (o sistema responde na hora quando não há nada pendente).
 *
 * Autenticação com o segredo CRON_SECRET lido do Secret Manager do próprio projeto — o mesmo
 * que o App Hosting usa. O valor nunca fica em arquivo nem passa por quem faz o deploy.
 *
 * Deploy:  firebase deploy --only functions:agendador
 * O endereço do sistema vem de APP_URL (arquivo .env.<id-do-projeto> nesta pasta).
 */
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret, defineString } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");

const CRON_SECRET = defineSecret("CRON_SECRET");
const APP_URL = defineString("APP_URL");

const OPCOES = {
  timeZone: "America/Sao_Paulo",
  region: "us-central1",
  secrets: [CRON_SECRET],
  timeoutSeconds: 360,
  memory: "256MiB",
  // Até 2 novas tentativas se a CHAMADA falhar (ex.: 22/10 às 19h a invocação caiu na
  // infraestrutura do Google antes de começar). O sistema responde 200 mesmo quando a fonte
  // falha, então a repetição só acontece em falha de infraestrutura, não de fonte.
  retryCount: 2,
  minBackoffSeconds: 60,
};

async function chamarRota(caminho) {
  const url = `${APP_URL.value().replace(/\/$/, "")}${caminho}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${CRON_SECRET.value()}` },
    signal: AbortSignal.timeout(330_000),
  });
  const texto = await res.text();
  const corpo = texto.slice(0, 1000);
  if (!res.ok) {
    logger.error(`Robô falhou em ${caminho}`, { status: res.status, corpo });
    throw new Error(`${caminho} respondeu ${res.status}`);
  }
  let json = {};
  try { json = JSON.parse(texto); } catch { /* resposta fora do formato: segue como concluída */ }
  return { json, corpo };
}

exports.roboAndamentos = onSchedule({ ...OPCOES, schedule: "0,20,40 6,18 * * *" }, async () => {
  const { json, corpo } = await chamarRota("/api/cron/sync");
  if (json.nada) { logger.info("Robô de andamentos: nada pendente nesta janela"); return; }
  // Registro ERROR fica nos logs para diagnóstico (o e-mail é só o resumo semanal).
  // Atraso não relança a função (não adianta repetir já: a fonte está fora), só avisa.
  const atrasados = json.atrasados ?? [];
  if (atrasados.length) {
    logger.error(`Processos sem verificação há mais de 14 horas: ${atrasados.length}`, { atrasados, corpo });
    return;
  }
  logger.info("Robô de andamentos concluído", { corpo });
});

exports.roboPublicacoes = onSchedule({ ...OPCOES, schedule: "10,30,50 6,18 * * *" }, async () => {
  const { json, corpo } = await chamarRota("/api/cron/publicacoes");
  if (!json.pendentes) { logger.info("Robô de publicações: nada pendente nesta janela"); return; }
  logger.info("Robô de publicações concluído", { corpo });
});

// Endereço dfv-juridico.web.app → sistema (ver portal.js).
exports.portal = require("./portal").portal;

/**
 * Tarefas em segundo plano (src/lib/tarefas.ts): quando a tela cria um documento em
 * `tarefas`, esta função chama o sistema para executá-lo (até 5 min). Fica na mesma região
 * do Firestore (São Paulo), exigência do gatilho. Sem nova tentativa automática: se falhar,
 * a tela mostra o erro e a pessoa decide se tenta de novo (evita gastar IA duas vezes).
 */
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
exports.executarTarefa = onDocumentCreated(
  { document: "tarefas/{id}", region: "southamerica-east1", secrets: [CRON_SECRET], timeoutSeconds: 360, memory: "256MiB", retry: false },
  async (event) => {
    const id = event.params.id;
    const { json } = await chamarRota(`/api/cron/tarefa?id=${encodeURIComponent(id)}`);
    logger.info("Tarefa executada", { id, tipo: json.tipo, status: json.status, mensagem: json.mensagem });
  },
);

/**
 * Resumo semanal (segunda-feira, 8h de Brasília).
 *
 * O e-mail de alerta (Cloud Monitoring) olha só os registros ERROR DESTA função — os da
 * atualização de hora em hora ficam nos logs para diagnóstico, mas não geram e-mail.
 * Assim chega no máximo 1 e-mail por semana, e só quando houve problema que pede atenção
 * (critérios em resumo.js: oscilação do CNJ que se resolve em poucas horas não conta).
 */
const { avaliarSemana, HORAS_SEMANA, HORA } = require("./resumo");

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
    const inicio = fim - HORAS_SEMANA * HORA;
    const snap = await getFirestore()
      .collection("sync_log")
      .where("iniciado_em", ">=", new Date(inicio).toISOString())
      .get();

    const { problemas, resumo } = avaliarSemana(snap.docs.map((d) => d.data()), fim);
    const dados = { periodo: `${new Date(inicio).toISOString()} a ${new Date(fim).toISOString()}`, ...resumo };
    if (problemas.length) {
      // write() em vez de error(): grava a mensagem limpa, sem o "Error:" e a pilha de chamadas.
      // O alerta extrai o texto depois do primeiro ": " (marcador `resumo` da política).
      logger.write({ severity: "ERROR", message: `Jurídico Monitor — semana com problema na atualização: ${problemas.join("; ")}.`, ...dados });
    } else {
      logger.info("Jurídico Monitor — semana sem problemas na atualização.", dados);
    }
  },
);
