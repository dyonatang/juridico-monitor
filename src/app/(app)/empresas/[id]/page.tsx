import { notFound } from "next/navigation";
import * as store from "@/lib/store";
import { formatarCnpj, formatarDocumento, fmtDataHora } from "@/lib/format";
import { Card, Pill } from "@/components/ui";
import { ProcessosTable } from "@/components/processos-table";

export const dynamic = "force-dynamic";

export default async function EmpresaDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const empresas = await store.listarEmpresas();
  const e = empresas.find((x) => x.id === id);
  if (!e) notFound();
  const [processos, docs] = await Promise.all([store.listarProcessos({ empresa_id: id }), store.listarDocumentos()]);
  const docsDaEmpresa = docs.filter((d) => d.empresa_id === id);

  return (
    <>
      <div className="topbar">
        <div>
          <h1>{e.apelido || e.nome}</h1>
          <p>
            {e.apelido && <>{e.nome} · </>}
            {e.cnpj ? formatarCnpj(e.cnpj) : "sem CNPJ cadastrado"}
          </p>
        </div>
        <Pill tone={e.ativo ? "ok" : "neutral"}>{e.ativo ? "ativa" : "inativa"}</Pill>
      </div>

      {docsDaEmpresa.length > 0 && (
        <Card title="Documentos vinculados" hint={String(docsDaEmpresa.length)}>
          <ul className="plain-list" style={{ padding: "8px 16px" }}>
            {docsDaEmpresa.map((d) => (
              <li key={d.id} style={{ padding: "4px 0" }}>
                <a href={`/documentos/${d.id}`} className="link">
                  {d.nome}
                </a>{" "}
                <Pill>{d.tipo}</Pill> <span className="mono sub">{formatarDocumento(d.tipo, d.numero)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Cadastrada em">
        <div className="card-b">
          <p className="sub">{fmtDataHora(e.created_at)}</p>
        </div>
      </Card>

      <Card title="Processos" hint={`${processos.length} · mais recente primeiro`}>
        <ProcessosTable processos={processos} mostrarVinculo={false} />
      </Card>
    </>
  );
}
