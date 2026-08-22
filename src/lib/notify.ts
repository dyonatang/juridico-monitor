import * as store from "./store";
import type { Alerta } from "./types";

/**
 * Envia os alertas ainda não notificados por:
 *   - e-mail (Resend)  → RESEND_API_KEY + NOTIFY_EMAIL_FROM + NOTIFY_EMAIL_TO
 *   - webhook genérico → NOTIFY_WEBHOOK_URL (ex.: Evolution API / Z-API / n8n para WhatsApp)
 * Sem canal configurado, os alertas ficam só no dashboard e no MCP.
 */
export async function notificarPendentes(): Promise<number> {
  const alertas = await store.alertasNaoNotificados();
  if (alertas.length === 0) return 0;

  const canais: Promise<void>[] = [];
  if (process.env.RESEND_API_KEY && process.env.NOTIFY_EMAIL_TO) canais.push(enviarEmail(alertas));
  if (process.env.NOTIFY_WEBHOOK_URL) canais.push(enviarWebhook(alertas));
  if (canais.length === 0) return 0;

  const resultados = await Promise.allSettled(canais);
  const algumOk = resultados.some((r) => r.status === "fulfilled");
  if (algumOk) await store.marcarNotificados(alertas.map((a) => a.id));
  resultados.forEach((r) => r.status === "rejected" && console.error("notify:", r.reason));
  return algumOk ? alertas.length : 0;
}

const textoDigest = (alertas: Alerta[]) => alertas.map((a) => `• ${a.titulo}\n  ${a.mensagem.replace(/\n/g, "\n  ")}`).join("\n\n");

async function enviarEmail(alertas: Alerta[]) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify({
      from: process.env.NOTIFY_EMAIL_FROM || "Juridico Monitor <onboarding@resend.dev>",
      to: process.env.NOTIFY_EMAIL_TO!.split(",").map((x) => x.trim()),
      subject: `[Jurídico] ${alertas.length} alerta(s) processual(is)`,
      text: textoDigest(alertas),
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

async function enviarWebhook(alertas: Alerta[]) {
  const res = await fetch(process.env.NOTIFY_WEBHOOK_URL!, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.NOTIFY_WEBHOOK_TOKEN ? { Authorization: `Bearer ${process.env.NOTIFY_WEBHOOK_TOKEN}` } : {}),
    },
    body: JSON.stringify({ resumo: textoDigest(alertas), alertas }),
  });
  if (!res.ok) throw new Error(`Webhook ${res.status}: ${await res.text()}`);
}
