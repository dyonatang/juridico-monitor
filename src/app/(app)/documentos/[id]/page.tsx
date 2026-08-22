import { notFound } from "next/navigation";
import * as store from "@/lib/store";
import { formatarDocumento, fmtDataHora } from "@/lib/format";
import { Card, Pill } from "@/components/ui";
import { ProcessosTable } from "@/components/processos-table";

export const dynamic = "force-dynamic";

export default async function DocumentoDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await store.getDocumento(id);
  if (!d) notFound();
  const [processos, empresas] = await Promise.all([store.listarProcessos({ documento_id: id }), store.listarEmpresas()]);
  const empresa = empresas.find((e) => e.id === d.empresa_id);

  return (
    <>
      <div className="topbar">
        <div>
          <h1>{d.nome}</h1>
          <p>
            <Pill>{d.tipo}</Pill> <span className="mono">{formatarDocumento(d.tipo, d.numero)}</span>
            {empresa && <> · {empresa.apelido || empresa.nome}</>}
          </p>
        </div>
        <Pill tone={d.ativo ? "ok" : "neutral"}>{d.ativo ? "monitoramento ativo" : "pausado"}</Pill>
      </div>

      <Card title="Informações">
        <dl className="capa">
          <div>
            <dt>Observação</dt>
            <dd>{d.observacao || "—"}</dd>
          </div>
          <div>
            <dt>Cadastrado em</dt>
            <dd>{fmtDataHora(d.created_at)}</dd>
          </div>
          <div>
            <dt>Último check</dt>
            <dd>{fmtDataHora(d.ultimo_check)}</dd>
          </div>
          {d.ultimo_erro && (
            <div>
              <dt>Aviso</dt>
              <dd style={{ color: "var(--warn)" }}>{d.ultimo_erro}</dd>
            </div>
          )}
        </dl>
      </Card>

      <Card title="Processos" hint={`${processos.length} · mais recente primeiro`}>
        <ProcessosTable processos={processos} mostrarVinculo={false} />
      </Card>
    </>
  );
}
