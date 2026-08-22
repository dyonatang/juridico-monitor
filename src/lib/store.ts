/**
 * Camada de dados — Firebase Firestore (firebase-admin, somente servidor).
 *
 * Coleções:
 *   empresas/{id}
 *   documentos/{numero}          id = CPF/CNPJ só dígitos  (garante unicidade)
 *   processos/{numero_cnj}       id = 20 dígitos           (garante unicidade)
 *   movimentacoes/{processo_hash} id = `${numero_cnj}_${hash}` (evita duplicata)
 *   alertas/{id}
 *   sync_log/{id}
 *
 * Datas são gravadas como ISO-8601 (string) — ordenam corretamente e viajam bem pro React.
 * As listas são pequenas (dezenas de processos), então filtramos no Firestore por igualdade
 * e ordenamos em memória — isso dispensa índices compostos.
 */
import { readFileSync } from "node:fs";
import { getApps, initializeApp, cert, applicationDefault, type App } from "firebase-admin/app";
import { getFirestore, type Firestore, type Query, type DocumentSnapshot } from "firebase-admin/firestore";
import type { Alerta, Arquivo, DocumentoMonitorado, Empresa, Movimentacao, Processo } from "./types";

let app: App | null = null;
let resolvedProjectId: string | undefined;

/** ID do projeto Firebase (para nome do bucket etc.). */
export function projectId(): string {
  fs();
  const id = resolvedProjectId || process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
  if (!id) throw new Error("Defina FIREBASE_PROJECT_ID");
  return id;
}
export function fs(): Firestore {
  if (!app) {
    if (getApps().length) app = getApps()[0];
    else {
      let json = process.env.FIREBASE_SERVICE_ACCOUNT;
      const arquivo = process.env.FIREBASE_SERVICE_ACCOUNT_FILE;
      if (!json && arquivo) json = readFileSync(arquivo, "utf8"); // caminho do JSON baixado do console
      const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
      if (json) {
        const sa = JSON.parse(json);
        resolvedProjectId = sa.project_id;
        app = initializeApp({ credential: cert(sa), projectId: sa.project_id });
      } else if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
        app = initializeApp({
          credential: cert({
            projectId,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
          }),
          projectId,
        });
      } else {
        // Firebase App Hosting / Cloud Run: credenciais automáticas.
        app = initializeApp({ credential: applicationDefault(), projectId });
      }
      resolvedProjectId = resolvedProjectId || projectId;
    }
  }
  return getFirestore(app);
}

export const agora = () => new Date().toISOString();
export const novoId = (col: string) => fs().collection(col).doc().id;
const toObj = <T>(d: DocumentSnapshot): T => ({ id: d.id, ...(d.data() as object) }) as T;
const all = async <T>(q: Query): Promise<T[]> => (await q.get()).docs.map((d) => toObj<T>(d));
const desc = <T extends { created_at?: string }>(a: T, b: T) => (b.created_at ?? "").localeCompare(a.created_at ?? "");

/** Remove chaves undefined (Firestore rejeita undefined). */
const limpar = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

// ---------------------------------------------------------------- Empresas
export async function listarEmpresas(apenasAtivas = false): Promise<Empresa[]> {
  let q: Query = fs().collection("empresas");
  if (apenasAtivas) q = q.where("ativo", "==", true);
  return (await all<Empresa>(q)).sort((a, b) => a.nome.localeCompare(b.nome));
}
export async function criarEmpresa(data: Omit<Empresa, "id" | "created_at" | "ativo">): Promise<Empresa> {
  const ref = fs().collection("empresas").doc();
  const emp: Empresa = { id: ref.id, ...data, ativo: true, created_at: agora() };
  await ref.set(limpar({ ...emp, id: undefined }));
  return emp;
}

// ------------------------------------------------------------- Documentos
export async function listarDocumentos(apenasAtivos = false): Promise<DocumentoMonitorado[]> {
  let q: Query = fs().collection("documentos");
  if (apenasAtivos) q = q.where("ativo", "==", true);
  return (await all<DocumentoMonitorado>(q)).sort((a, b) => a.nome.localeCompare(b.nome));
}
export async function getDocumento(id: string) {
  const d = await fs().collection("documentos").doc(id).get();
  return d.exists ? toObj<DocumentoMonitorado>(d) : null;
}
export async function getDocumentoPorTracking(trackingId: string) {
  const r = await fs().collection("documentos").where("provider_tracking_id", "==", trackingId).limit(1).get();
  return r.empty ? null : toObj<DocumentoMonitorado>(r.docs[0]);
}
export async function criarDocumento(
  data: Omit<DocumentoMonitorado, "id" | "created_at" | "ativo" | "provider" | "provider_tracking_id" | "ultimo_check" | "ultimo_erro">,
): Promise<DocumentoMonitorado> {
  const ref = fs().collection("documentos").doc(data.numero);
  if ((await ref.get()).exists) throw new Error("Este documento já está cadastrado");
  const doc: DocumentoMonitorado = {
    id: ref.id,
    ...data,
    ativo: true,
    provider: null,
    provider_tracking_id: null,
    ultimo_check: null,
    ultimo_erro: null,
    created_at: agora(),
  };
  await ref.set(limpar({ ...doc, id: undefined }));
  return doc;
}

// -------------------------------------------------------------- Processos
export async function listarProcessos(f: { empresa_id?: string; documento_id?: string; apenasAtivos?: boolean } = {}): Promise<Processo[]> {
  let q: Query = fs().collection("processos");
  if (f.empresa_id) q = q.where("empresa_id", "==", f.empresa_id);
  if (f.documento_id) q = q.where("documento_id", "==", f.documento_id);
  if (f.apenasAtivos) q = q.where("ativo", "==", true);
  return (await all<Processo>(q)).sort((a, b) => Number(b.ativo) - Number(a.ativo) || desc(a, b));
}
export async function getProcesso(id: string) {
  const d = await fs().collection("processos").doc(id).get();
  return d.exists ? toObj<Processo>(d) : null;
}
export const getProcessoPorNumero = (numeroDigits: string) => getProcesso(numeroDigits);
export async function getProcessoPorTracking(trackingId: string) {
  const r = await fs().collection("processos").where("provider_tracking_id", "==", trackingId).limit(1).get();
  return r.empty ? null : toObj<Processo>(r.docs[0]);
}
export async function criarProcesso(data: Omit<Processo, "id" | "created_at" | "ativo" | "ultimo_check" | "ultimo_erro" | "total_movimentacoes">): Promise<Processo> {
  const ref = fs().collection("processos").doc(data.numero_cnj);
  if ((await ref.get()).exists) throw new Error("Este processo já está cadastrado");
  const p: Processo = { id: ref.id, ...data, ativo: true, ultimo_check: null, ultimo_erro: null, total_movimentacoes: 0, created_at: agora() };
  await ref.set(limpar({ ...p, id: undefined }));
  return p;
}
export async function contarProcessosAtivos() {
  return (await fs().collection("processos").where("ativo", "==", true).count().get()).data().count;
}
export async function contarDocumentosAtivos() {
  return (await fs().collection("documentos").where("ativo", "==", true).count().get()).data().count;
}

// ---------------------------------------------------------- Atualização / exclusão genéricas
export type Colecao = "empresas" | "documentos" | "processos";
export async function atualizar(col: Colecao | "alertas", id: string, patch: Record<string, unknown>) {
  await fs().collection(col).doc(id).update(limpar(patch));
}
export async function excluir(col: Colecao, id: string) {
  const db = fs();
  const batch = db.batch();
  if (col === "processos") {
    for (const c of ["movimentacoes", "alertas"]) {
      const r = await db.collection(c).where("processo_id", "==", id).get();
      r.docs.forEach((d) => batch.delete(d.ref));
    }
  } else {
    const campo = col === "empresas" ? "empresa_id" : "documento_id";
    for (const c of col === "empresas" ? ["processos", "documentos"] : ["processos"]) {
      const r = await db.collection(c).where(campo, "==", id).get();
      r.docs.forEach((d) => batch.update(d.ref, { [campo]: null }));
    }
    if (col === "documentos") {
      const r = await db.collection("alertas").where("documento_id", "==", id).get();
      r.docs.forEach((d) => batch.delete(d.ref));
    }
  }
  batch.delete(db.collection(col).doc(id));
  await batch.commit();
}

// ---------------------------------------------------------- Movimentações
export async function listarMovimentacoes(processoId: string, limite?: number): Promise<Movimentacao[]> {
  const r = await all<Movimentacao>(fs().collection("movimentacoes").where("processo_id", "==", processoId));
  r.sort((a, b) => b.data_hora.localeCompare(a.data_hora));
  return limite ? r.slice(0, limite) : r;
}
export async function hashesDoProcesso(processoId: string): Promise<Set<string>> {
  const r = await fs().collection("movimentacoes").where("processo_id", "==", processoId).select("hash").get();
  return new Set(r.docs.map((d) => d.get("hash") as string));
}
export async function inserirMovimentacoes(
  processoId: string,
  movs: Omit<Movimentacao, "id" | "processo_id" | "created_at">[],
): Promise<Movimentacao[]> {
  if (movs.length === 0) return [];
  const db = fs();
  const out: Movimentacao[] = [];
  const ts = agora();
  // lotes de 400 (limite do batch é 500)
  for (let i = 0; i < movs.length; i += 400) {
    const batch = db.batch();
    for (const m of movs.slice(i, i + 400)) {
      const id = `${processoId}_${m.hash}`;
      const mov: Movimentacao = { id, processo_id: processoId, ...m, created_at: ts };
      batch.set(db.collection("movimentacoes").doc(id), limpar({ ...mov, id: undefined }));
      out.push(mov);
    }
    await batch.commit();
  }
  return out;
}
export async function movimentacoesRecentes(desdeISO: string, limite = 300): Promise<Movimentacao[]> {
  return all<Movimentacao>(fs().collection("movimentacoes").where("created_at", ">=", desdeISO).orderBy("created_at", "desc").limit(limite));
}

// ---------------------------------------------------------------- Alertas
export async function listarAlertas(f: { apenasNaoLidos?: boolean; limite?: number } = {}): Promise<Alerta[]> {
  let q: Query = fs().collection("alertas");
  if (f.apenasNaoLidos) q = q.where("lido", "==", false);
  const r = (await all<Alerta>(q)).sort(desc);
  return f.limite ? r.slice(0, f.limite) : r;
}
export async function contarAlertasNaoLidos() {
  return (await fs().collection("alertas").where("lido", "==", false).count().get()).data().count;
}
export async function inserirAlertas(alertas: Omit<Alerta, "id" | "created_at" | "lido" | "notificado_em">[]) {
  if (alertas.length === 0) return;
  const db = fs();
  const batch = db.batch();
  const ts = agora();
  for (const a of alertas) {
    batch.set(db.collection("alertas").doc(), limpar({ ...a, lido: false, notificado_em: null, created_at: ts }));
  }
  await batch.commit();
}
export async function marcarAlertasLidos(ids?: string[]): Promise<number> {
  const db = fs();
  const refs = ids?.length
    ? ids.map((id) => db.collection("alertas").doc(id))
    : (await db.collection("alertas").where("lido", "==", false).get()).docs.map((d) => d.ref);
  const batch = db.batch();
  refs.forEach((r) => batch.update(r, { lido: true }));
  await batch.commit();
  return refs.length;
}
export async function alertasNaoNotificados(limite = 200): Promise<Alerta[]> {
  const r = await all<Alerta>(fs().collection("alertas").where("notificado_em", "==", null));
  return r.sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(0, limite);
}
export async function marcarNotificados(ids: string[]) {
  const db = fs();
  const batch = db.batch();
  const ts = agora();
  ids.forEach((id) => batch.update(db.collection("alertas").doc(id), { notificado_em: ts }));
  await batch.commit();
}

// --------------------------------------------------------------- Sync log
export type SyncLog = {
  id: string;
  iniciado_em: string;
  finalizado_em: string | null;
  processos_verificados: number;
  novas_movimentacoes: number;
  erros: number;
  detalhes: unknown;
};
export async function iniciarSyncLog(): Promise<string> {
  const ref = fs().collection("sync_log").doc();
  await ref.set({ iniciado_em: agora(), finalizado_em: null, processos_verificados: 0, novas_movimentacoes: 0, erros: 0, detalhes: null });
  return ref.id;
}
export async function finalizarSyncLog(id: string, patch: Partial<SyncLog>) {
  await fs().collection("sync_log").doc(id).update(limpar({ ...patch, finalizado_em: agora() }));
}
export async function ultimoSyncLog(): Promise<SyncLog | null> {
  const r = await fs().collection("sync_log").orderBy("iniciado_em", "desc").limit(1).get();
  return r.empty ? null : toObj<SyncLog>(r.docs[0]);
}

// --------------------------------------------------------------- Arquivos (PDFs importados)
export async function salvarArquivo(a: Arquivo) {
  await fs().collection("arquivos").doc(a.id).set(limpar({ ...a, id: undefined }));
}
export async function getArquivo(id: string) {
  const d = await fs().collection("arquivos").doc(id).get();
  return d.exists ? toObj<Arquivo>(d) : null;
}
export async function listarArquivos(limite = 50): Promise<Arquivo[]> {
  return all<Arquivo>(fs().collection("arquivos").orderBy("created_at", "desc").limit(limite));
}
export async function listarArquivosDoProcesso(numeroCnj: string): Promise<Arquivo[]> {
  return (await all<Arquivo>(fs().collection("arquivos").where("processos", "array-contains", numeroCnj))).sort(desc);
}
export async function excluirArquivo(id: string) {
  await fs().collection("arquivos").doc(id).delete();
}
