/**
 * Cloud Storage for Firebase — guarda os PDFs importados.
 * Bucket: FIREBASE_STORAGE_BUCKET ou o padrão `<projeto>.firebasestorage.app`.
 * Nenhum acesso público: o download passa por /api/arquivos/[id] (protegido por sessão).
 */
import { getStorage } from "firebase-admin/storage";
import { fs, projectId } from "./store";

function bucket() {
  fs(); // garante o app inicializado
  const nome = process.env.FIREBASE_STORAGE_BUCKET || `${projectId()}.firebasestorage.app`;
  return getStorage().bucket(nome);
}

export async function salvarArquivo(caminho: string, bytes: Buffer, contentType: string) {
  await bucket().file(caminho).save(bytes, { contentType, resumable: false, metadata: { cacheControl: "private, max-age=0" } });
  return caminho;
}

export async function lerArquivo(caminho: string): Promise<Buffer> {
  const [data] = await bucket().file(caminho).download();
  return data;
}

export async function apagarArquivo(caminho: string) {
  await bucket().file(caminho).delete({ ignoreNotFound: true });
}
