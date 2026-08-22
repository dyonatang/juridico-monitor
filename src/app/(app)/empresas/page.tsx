import * as store from "@/lib/store";
import { formatarCnpj } from "@/lib/format";
import { ActionForm, Card, Input, Pill, SubmitButton } from "@/components/ui";
import { alternarAtivoAction, criarEmpresaAction, excluirAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function Empresas() {
  const [empresas, docs, processos] = await Promise.all([store.listarEmpresas(), store.listarDocumentos(), store.listarProcessos()]);
  const nDocs = (id: string) => docs.filter((d) => d.empresa_id === id).length;
  const nProc = (id: string) => processos.filter((p) => p.empresa_id === id).length;

  return (
    <>
      <div className="topbar">
        <div><h1>Empresas</h1><p>Agrupam documentos e processos no painel</p></div>
      </div>

      <Card title="Nova empresa">
        <ActionForm action={criarEmpresaAction} submitLabel="Cadastrar">
          <Input label="Razão social *" name="nome" required placeholder="Bar e Restaurante do Assis LTDA" />
          <Input label="CNPJ (opcional)" name="cnpj" mono placeholder="00.000.000/0000-00" />
          <Input label="Apelido" name="apelido" placeholder="Caranguejo do Assis" />
        </ActionForm>
      </Card>

      <Card title="Cadastradas" hint={String(empresas.length)}>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Empresa</th><th>CNPJ</th><th className="right">Docs</th><th className="right">Processos</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {empresas.map((e) => (
                <tr key={e.id} className={e.ativo ? "" : "off"}>
                  <td><b>{e.apelido || e.nome}</b>{e.apelido && <div className="sub">{e.nome}</div>}</td>
                  <td className="mono">{e.cnpj ? formatarCnpj(e.cnpj) : "—"}</td>
                  <td className="right">{nDocs(e.id)}</td>
                  <td className="right">{nProc(e.id)}</td>
                  <td>{e.ativo ? <Pill tone="ok">ativa</Pill> : <Pill>inativa</Pill>}</td>
                  <td>
                    <div className="actions-row">
                      <form action={alternarAtivoAction.bind(null, "empresas", e.id, !e.ativo)}><SubmitButton tone="sm">{e.ativo ? "Desativar" : "Ativar"}</SubmitButton></form>
                      <form action={excluirAction.bind(null, "empresas", e.id)}><SubmitButton tone="sm-danger">Excluir</SubmitButton></form>
                    </div>
                  </td>
                </tr>
              ))}
              {empresas.length === 0 && <tr><td colSpan={6} className="empty">Nenhuma empresa cadastrada.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
