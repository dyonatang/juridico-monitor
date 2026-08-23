import { redirect } from "next/navigation";
import { usuarioAtual } from "@/lib/usuarios";
import { listarAuditoria } from "@/lib/auditoria";
import { fmtDataHora } from "@/lib/format";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

const ACAO_LABEL: Record<string, string> = {
  visualizou_processo: "Visualizou processo",
  visualizou_documento: "Visualizou CPF/CNPJ",
  abriu_pdf: "Abriu PDF",
  criou_processo: "Cadastrou processo",
  editou_processo: "Editou processo",
  excluiu_processo: "Excluiu processo",
  criou_documento: "Cadastrou CPF/CNPJ",
  excluiu_documento: "Excluiu CPF/CNPJ",
  importou_pdf: "Importou PDF",
  excluiu_arquivo: "Excluiu arquivo",
  criou_usuario: "Criou usuário",
  excluiu_usuario: "Excluiu usuário",
  alterou_usuario: "Alterou usuário",
  redefiniu_senha: "Redefiniu senha",
};

export default async function Auditoria() {
  const eu = await usuarioAtual();
  if (!eu || eu.papel !== "admin") redirect("/");
  const entradas = await listarAuditoria(300);

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Auditoria</h1>
          <p>Quem visualizou ou alterou cada informação — últimas {entradas.length} ações registradas.</p>
        </div>
      </div>

      <Card title="Atividade recente" hint={String(entradas.length)}>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Quando</th>
                <th>Usuário</th>
                <th>Ação</th>
                <th>Alvo</th>
              </tr>
            </thead>
            <tbody>
              {entradas.map((e) => (
                <tr key={e.id}>
                  <td className="sub">{fmtDataHora(e.created_at)}</td>
                  <td>{e.usuario}</td>
                  <td>{ACAO_LABEL[e.acao] ?? e.acao}</td>
                  <td className="sub">{e.alvo_rotulo || e.alvo_id}</td>
                </tr>
              ))}
              {entradas.length === 0 && (
                <tr>
                  <td colSpan={4} className="empty">
                    Nenhuma atividade registrada ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
