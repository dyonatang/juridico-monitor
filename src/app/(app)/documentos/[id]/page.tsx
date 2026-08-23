import Link from "next/link";
import { notFound } from "next/navigation";
import * as store from "@/lib/store";
import { formatarDocumento, mascararDocumento, fmtDataHora } from "@/lib/format";
import { BackLink, Card, Pill } from "@/components/ui";
import { ProcessosTable } from "@/components/processos-table";
import { DocumentoToggle } from "@/components/documento-toggle";
import { registrarAuditoria } from "@/lib/auditoria";

export const dynamic = "force-dynamic";

export default async function DocumentoDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await store.getDocumento(id);
  if (!d) notFound();
  await registrarAuditoria("visualizou_documento", { tipo: "documento", id: d.id, rotulo: d.apelido || d.nome });
  const [processos, todos] = await Promise.all([store.listarProcessos({ documento_id: id }), store.listarDocumentos()]);
  const vinculo = d.vinculo_id ? todos.find((x) => x.id === d.vinculo_id) : null;
  const vinculados = todos.filter((x) => x.vinculo_id === id);

  return (
    <>
      <BackLink href="/documentos">CPFs e CNPJs</BackLink>
      <div className="topbar">
        <div>
          <h1>{d.apelido || d.nome}</h1>
          <p>
            {d.apelido && <>{d.nome} · </>}
            <Pill>{d.tipo}</Pill> <DocumentoToggle mascarado={mascararDocumento(d.tipo, d.numero)} completo={formatarDocumento(d.tipo, d.numero)} />
            {vinculo && (
              <>
                {" "}
                · <Link href={`/documentos/${vinculo.id}`} className="link">{vinculo.apelido || vinculo.nome}</Link>
              </>
            )}
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

      {vinculados.length > 0 && (
        <Card title="Vinculados a este" hint={String(vinculados.length)}>
          <ul className="plain-list" style={{ padding: "8px 16px" }}>
            {vinculados.map((v) => (
              <li key={v.id} style={{ padding: "4px 0" }}>
                <Link href={`/documentos/${v.id}`} className="link">
                  {v.apelido || v.nome}
                </Link>{" "}
                <Pill>{v.tipo}</Pill> <DocumentoToggle mascarado={mascararDocumento(v.tipo, v.numero)} completo={formatarDocumento(v.tipo, v.numero)} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Processos" hint={`${processos.length} · mais recente primeiro`}>
        <ProcessosTable processos={processos} mostrarVinculo={false} />
      </Card>
    </>
  );
}
