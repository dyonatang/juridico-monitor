/**
 * Log de auditoria: quem visualizou ou alterou cada informação sensível.
 * Coleção `logs_auditoria` — nunca deixa a ação principal falhar por causa do log.
 */
import * as store from "./store";
import { usuarioAtual } from "./usuarios";

export type AcaoAuditoria =
  | "visualizou_processo"
  | "visualizou_documento"
  | "abriu_pdf"
  | "criou_processo"
  | "editou_processo"
  | "excluiu_processo"
  | "criou_documento"
  | "excluiu_documento"
  | "importou_pdf"
  | "excluiu_arquivo"
  | "criou_usuario"
  | "excluiu_usuario"
  | "alterou_usuario"
  | "redefiniu_senha";

export type EntradaAuditoria = {
  id: string;
  usuario: string;
  acao: AcaoAuditoria | string;
  alvo_tipo: string;
  alvo_id: string;
  alvo_rotulo: string | null;
  created_at: string;
};

export async function registrarAuditoria(acao: AcaoAuditoria, alvo: { tipo: string; id: string; rotulo?: string | null }, loginConhecido?: string) {
  try {
    const login = loginConhecido ?? (await usuarioAtual().catch(() => null))?.login ?? "sistema";
    await store.fs().collection("logs_auditoria").add({
      usuario: login,
      acao,
      alvo_tipo: alvo.tipo,
      alvo_id: alvo.id,
      alvo_rotulo: alvo.rotulo ?? null,
      created_at: store.agora(),
    });
  } catch {
    // auditoria nunca deve derrubar a ação principal
  }
}

export async function listarAuditoria(limite = 300): Promise<EntradaAuditoria[]> {
  const r = await store.fs().collection("logs_auditoria").orderBy("created_at", "desc").limit(limite).get();
  return r.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as EntradaAuditoria);
}
