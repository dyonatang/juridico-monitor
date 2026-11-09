// TEMPORÁRIO (09/11/2026): mede o tempo das consultas ao Firestore a partir do servidor.
// Protegido pelo proxy (exige sessão). Não devolve dados, só tempos. Remover após o diagnóstico.
import { NextResponse } from "next/server";
import * as store from "@/lib/store";

export const dynamic = "force-dynamic";

async function medir(f: () => Promise<unknown>) {
  const t = performance.now();
  await f();
  return Math.round(performance.now() - t);
}

export async function GET() {
  const db = store.fs();
  const out: Record<string, number[]> = { doc_get: [], count: [], ultimo_sync: [], tres_em_paralelo: [], listar_processos: [], listar_alertas: [] };
  for (let i = 0; i < 4; i++) {
    out.doc_get.push(await medir(() => db.collection("processos").doc("00000000000000000000").get()));
    out.count.push(await medir(() => store.contarAlertasNaoLidos()));
    out.ultimo_sync.push(await medir(() => store.ultimoSyncLog()));
    out.tres_em_paralelo.push(await medir(() => Promise.all([store.contarAlertasNaoLidos(), store.ultimoSyncLog(), db.collection("usuarios").doc("x").get()])));
    out.listar_processos.push(await medir(() => store.listarProcessos({ apenasAtivos: true })));
    out.listar_alertas.push(await medir(() => store.listarAlertas({ apenasNaoLidos: true, limite: 200 })));
  }
  return NextResponse.json({ regiao_servidor: process.env.GOOGLE_CLOUD_REGION ?? process.env.K_SERVICE ?? "?", ms: out });
}
