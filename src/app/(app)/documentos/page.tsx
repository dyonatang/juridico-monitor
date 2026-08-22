import Link from "next/link";
import * as store from "@/lib/store";
import { formatarDocumento, fmtDataHora } from "@/lib/format";
import { provedorPremium } from "@/lib/providers";
import { ActionForm, Card, Input, Select, Pill, SubmitButton } from "@/components/ui";
import { alternarAtivoAction, criarDocumentoAction, excluirAction, reativarMonitoramentoAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function Documentos() {
  const [docs, empresas, processos] = await Promise.all([store.listarDocumentos(), store.listarEmpresas(true), store.listarProcessos()]);
  const nomeEmpresa = new Map(empresas.map((e) => [e.id, e.apelido || e.nome]));
  const nProc = (id: string) => processos.filter((p) => p.documento_id === id).length;
  const premium = provedorPremium();

  return (
    <>
      <div className="topbar">
        <div><h1>CPFs e CNPJs monitorados</h1><p>Qualquer processo novo em que um destes documentos apareça vira alerta</p></div>
      </div>

      {!premium && (
        <div className="notice">
          <b>Busca automática por CPF/CNPJ desativada.</b> A fonte gratuita (DataJud/CNJ) só consulta por número de processo. Para o sistema descobrir processos novos sozinho, configure{" "}
          <code>JUDIT_API_KEY</code> ou <code>ESCAVADOR_TOKEN</code>. Enquanto isso, cadastre os processos em <Link href="/processos">Processos</Link>.
        </div>
      )}

      <Card title="Novo documento">
        <ActionForm action={criarDocumentoAction} submitLabel="Cadastrar e monitorar" hint="Cria o monitoramento no provedor e importa os processos já existentes.">
          <Select label="Tipo *" name="tipo" defaultValue="CNPJ">
            <option value="CNPJ">CNPJ</option>
            <option value="CPF">CPF</option>
          </Select>
          <Input label="Número *" name="numero" mono required placeholder="00.000.000/0000-00 ou 000.000.000-00" />
          <Input label="Nome / titular *" name="nome" required placeholder="Empresa ou pessoa" />
          <Select label="Empresa vinculada" name="empresa_id" defaultValue="">
            <option value="">— família / nenhuma —</option>
            {empresas.map((e) => <option key={e.id} value={e.id}>{e.apelido || e.nome}</option>)}
          </Select>
          <Input label="Observação" name="observacao" wide placeholder="ex.: sócio, cônjuge, holding…" />
        </ActionForm>
      </Card>

      <Card title="Monitorados" hint={String(docs.length)}>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Nome</th><th>Documento</th><th>Empresa</th><th className="right">Processos</th><th>Monitoramento</th><th>Último check</th><th></th></tr></thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id} className={d.ativo ? "" : "off"}>
                  <td><b>{d.nome}</b>{d.observacao && <div className="sub">{d.observacao}</div>}</td>
                  <td><Pill>{d.tipo}</Pill> <span className="mono">{formatarDocumento(d.tipo, d.numero)}</span></td>
                  <td>{d.empresa_id ? nomeEmpresa.get(d.empresa_id) ?? "—" : "—"}</td>
                  <td className="right">{nProc(d.id)}</td>
                  <td>
                    {d.provider_tracking_id ? <Pill tone="ok">{d.provider} ✓</Pill> : d.ultimo_erro ? <Pill tone="warn">manual</Pill> : <Pill>pendente</Pill>}
                    {d.ultimo_erro && <div className="sub" style={{ maxWidth: 280, color: "var(--warn)" }}>{d.ultimo_erro}</div>}
                  </td>
                  <td className="sub">{fmtDataHora(d.ultimo_check)}</td>
                  <td>
                    <div className="actions-row">
                      {premium && !d.provider_tracking_id && (
                        <form action={reativarMonitoramentoAction.bind(null, d.id)}><SubmitButton tone="sm">Ativar</SubmitButton></form>
                      )}
                      <form action={alternarAtivoAction.bind(null, "documentos", d.id, !d.ativo)}><SubmitButton tone="sm">{d.ativo ? "Pausar" : "Retomar"}</SubmitButton></form>
                      <form action={excluirAction.bind(null, "documentos", d.id)}><SubmitButton tone="sm-danger">Excluir</SubmitButton></form>
                    </div>
                  </td>
                </tr>
              ))}
              {docs.length === 0 && <tr><td colSpan={7} className="empty">Nenhum documento cadastrado.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
