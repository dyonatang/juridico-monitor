import Link from "next/link";
import * as store from "@/lib/store";
import { fmtDataHora } from "@/lib/format";
import { ActionForm, Card, Input, Select, Pill } from "@/components/ui";
import { criarProcessoAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function Processos() {
  const [processos, empresas, docs] = await Promise.all([store.listarProcessos(), store.listarEmpresas(true), store.listarDocumentos(true)]);
  const nomeEmpresa = new Map(empresas.map((e) => [e.id, e.apelido || e.nome]));
  const nomeDoc = new Map(docs.map((d) => [d.id, d.nome]));
  const ativos = processos.filter((p) => p.ativo).length;

  return (
    <>
      <div className="topbar">
        <div><h1>Processos</h1><p>{ativos} ativos · {processos.length - ativos} pausados</p></div>
      </div>

      <Card title="Novo processo" hint="o tribunal é deduzido do número">
        <ActionForm action={criarProcessoAction} submitLabel="Cadastrar e consultar" hint="Consulta a fonte na hora e importa as movimentações.">
          <Input label="Número CNJ *" name="numero" mono required placeholder="0001234-56.2024.8.08.0024" />
          <Input label="Descrição / apelido" name="descricao" placeholder="ex.: Ação trabalhista João" />
          <Select label="Empresa" name="empresa_id" defaultValue="">
            <option value="">—</option>
            {empresas.map((e) => <option key={e.id} value={e.id}>{e.apelido || e.nome}</option>)}
          </Select>
          <Select label="Parte monitorada" name="documento_id" defaultValue="">
            <option value="">—</option>
            {docs.map((d) => <option key={d.id} value={d.id}>{d.nome} ({d.tipo})</option>)}
          </Select>
        </ActionForm>
      </Card>

      <Card title="Cadastrados" hint={String(processos.length)}>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Processo</th><th>Tribunal</th><th>Classe / assunto</th><th>Empresa</th><th className="right">Movs</th><th>Último check</th><th>Status</th></tr></thead>
            <tbody>
              {processos.map((p) => (
                <tr key={p.id} className={p.ativo ? "" : "off"}>
                  <td>
                    <Link href={`/processos/${p.id}`} className="link mono">{p.numero_formatado}</Link>
                    <div className="sub">{p.origem === "descoberto" && <><Pill tone="warn">descoberto</Pill> </>}{p.descricao ?? (p.origem === "descoberto" ? "sem apelido" : "")}</div>
                  </td>
                  <td style={{ textTransform: "uppercase" }}>{p.tribunal ?? "—"}</td>
                  <td style={{ maxWidth: 280 }}><div>{p.classe ?? "—"}</div><div className="sub">{p.assunto}</div></td>
                  <td>{(p.empresa_id && nomeEmpresa.get(p.empresa_id)) || (p.documento_id && nomeDoc.get(p.documento_id)) || "—"}</td>
                  <td className="right">{p.total_movimentacoes ?? 0}</td>
                  <td className="sub">{fmtDataHora(p.ultimo_check)}</td>
                  <td>{!p.ativo ? <Pill>pausado</Pill> : p.ultimo_erro ? <span title={p.ultimo_erro}><Pill tone="bad">erro</Pill></span> : <Pill tone="ok">ok</Pill>}</td>
                </tr>
              ))}
              {processos.length === 0 && <tr><td colSpan={7} className="empty">Nenhum processo cadastrado.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
