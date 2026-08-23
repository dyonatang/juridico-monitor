import Link from "next/link";
import * as store from "@/lib/store";
import { formatarDocumento, mascararDocumento, fmtDataHora } from "@/lib/format";
import { provedorPremium } from "@/lib/providers";
import { ActionForm, Card, Input, Select, Pill, SubmitButton } from "@/components/ui";
import { RowLink } from "@/components/row-link";
import { DocumentoToggle } from "@/components/documento-toggle";
import { alternarAtivoAction, criarDocumentoAction, excluirAction, reativarMonitoramentoAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function Documentos() {
  const [docs, processos] = await Promise.all([store.listarDocumentos(), store.listarProcessos()]);
  const nomeDoc = new Map(docs.map((d) => [d.id, d.apelido || d.nome]));
  const cnpjs = docs.filter((d) => d.tipo === "CNPJ");
  const nProc = (id: string) => processos.filter((p) => p.documento_id === id).length;
  const premium = provedorPremium();

  return (
    <>
      <div className="topbar">
        <div>
          <h1>CPFs e CNPJs</h1>
          <p>Empresas e pessoas do grupo, num só cadastro. Qualquer processo novo em que um deles apareça vira alerta. Clique num item para ver os processos dele.</p>
        </div>
      </div>

      {!premium && (
        <div className="notice">
          <b>Busca automática por CPF/CNPJ desativada.</b> A fonte gratuita (DataJud/CNJ) só consulta por número de processo. Para o sistema descobrir processos novos sozinho, configure{" "}
          <code>JUDIT_API_KEY</code> ou <code>ESCAVADOR_TOKEN</code>. Enquanto isso, cadastre os processos em <Link href="/processos">Processos</Link>.
        </div>
      )}

      <Card title="Novo cadastro">
        <ActionForm action={criarDocumentoAction} submitLabel="Cadastrar e monitorar" hint="Cria o monitoramento no provedor e importa os processos já existentes.">
          <Select label="Tipo *" name="tipo" defaultValue="CNPJ">
            <option value="CNPJ">CNPJ</option>
            <option value="CPF">CPF</option>
          </Select>
          <Input label="Número *" name="numero" mono required placeholder="00.000.000/0000-00 ou 000.000.000-00" />
          <Input label="Nome *" name="nome" required placeholder="Razão social ou nome completo" />
          <Input label="Apelido" name="apelido" placeholder="ex.: Caranguejo do Assis" />
          <Select label="Vínculo" name="vinculo_id" defaultValue="">
            <option value="">—</option>
            {cnpjs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.apelido || d.nome}
              </option>
            ))}
          </Select>
          <Input label="Observação" name="observacao" wide />
        </ActionForm>
      </Card>

      <Card title="Cadastrados" hint={String(docs.length)}>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Documento</th>
                <th>Vínculo</th>
                <th className="right">Processos</th>
                <th>Monitoramento</th>
                <th>Cadastrado em</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <RowLink key={d.id} href={`/documentos/${d.id}`} className={d.ativo ? "" : "off"}>
                  <td>
                    <Link href={`/documentos/${d.id}`} className="link">
                      {d.apelido || d.nome}
                    </Link>
                    {d.apelido && <div className="sub">{d.nome}</div>}
                  </td>
                  <td>
                    <Pill>{d.tipo}</Pill> <DocumentoToggle mascarado={mascararDocumento(d.tipo, d.numero)} completo={formatarDocumento(d.tipo, d.numero)} />
                  </td>
                  <td>{d.vinculo_id ? nomeDoc.get(d.vinculo_id) ?? "—" : "—"}</td>
                  <td className="right">{nProc(d.id)}</td>
                  <td>
                    {d.provider_tracking_id ? <Pill tone="ok">{d.provider} ✓</Pill> : d.ultimo_erro ? <Pill tone="warn">manual</Pill> : <Pill>pendente</Pill>}
                  </td>
                  <td className="sub">{fmtDataHora(d.created_at)}</td>
                  <td>
                    <div className="actions-row">
                      {premium && !d.provider_tracking_id && (
                        <form action={reativarMonitoramentoAction.bind(null, d.id)}>
                          <SubmitButton tone="sm">Ativar</SubmitButton>
                        </form>
                      )}
                      <form action={alternarAtivoAction.bind(null, "documentos", d.id, !d.ativo)}>
                        <SubmitButton tone="sm">{d.ativo ? "Pausar" : "Retomar"}</SubmitButton>
                      </form>
                      <form action={excluirAction.bind(null, "documentos", d.id)}>
                        <SubmitButton tone="sm-danger">Excluir</SubmitButton>
                      </form>
                    </div>
                  </td>
                </RowLink>
              ))}
              {docs.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty">
                    Nenhum cadastro ainda.
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
