import { notFound } from "next/navigation";
import * as store from "@/lib/store";
import { fmtData, fmtDataHora } from "@/lib/format";
import { BackLink, Card, Input, Pill, Select, SubmitButton } from "@/components/ui";
import { alternarAtivoAction, atualizarRiscoAction, excluirAction, sincronizarProcessoAction } from "@/app/actions";
import { registrarAuditoria } from "@/lib/auditoria";

export const dynamic = "force-dynamic";

const RISCO_LABEL: Record<string, string> = { provavel: "Provável", possivel: "Possível", remoto: "Remoto" };
const RISCO_TONE: Record<string, "bad" | "warn" | "ok"> = { provavel: "bad", possivel: "warn", remoto: "ok" };

export default async function ProcessoDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await store.getProcesso(id);
  if (!p) notFound();
  await registrarAuditoria("visualizou_processo", { tipo: "processo", id: p.id, rotulo: p.numero_formatado });
  const [movs, docs, arquivos] = await Promise.all([store.listarMovimentacoes(p.id), store.listarDocumentos(), store.listarArquivosDoProcesso(p.id)]);
  const doc = docs.find((d) => d.id === p.documento_id);

  const campos: [string, React.ReactNode][] = [
    ["Tribunal", p.tribunal?.toUpperCase()],
    ["Classe", p.classe],
    ["Órgão julgador", p.orgao_julgador],
    ["Assunto", p.assunto],
    ["Ajuizamento", p.data_ajuizamento ? fmtData(p.data_ajuizamento) : null],
    ["Valor da causa", p.valor_causa ? p.valor_causa.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : null],
    ["Polo ativo", p.polo_ativo],
    ["Polo passivo", p.polo_passivo],
    ["Situação", p.situacao],
    ["Vínculo", doc ? doc.apelido || doc.nome : null],
    ["Origem", p.origem === "descoberto" ? "descoberto automaticamente" : "cadastro manual"],
    ["Fonte", `${p.provider ?? "datajud"} · último check ${fmtDataHora(p.ultimo_check)}`],
  ];

  return (
    <>
      <BackLink href="/processos">Processos</BackLink>
      <div className="topbar">
        <div>
          <h1 className="mono" style={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 500, fontSize: 24 }}>{p.numero_formatado}</h1>
          <p>{[p.descricao, doc ? doc.apelido || doc.nome : null].filter(Boolean).join(" · ") || "sem descrição"}</p>
        </div>
        <div className="actions-row">
          <form action={sincronizarProcessoAction.bind(null, id)}><SubmitButton>Consultar agora</SubmitButton></form>
          <form action={alternarAtivoAction.bind(null, "processos", id, !p.ativo)}><SubmitButton tone="secondary">{p.ativo ? "Pausar" : "Retomar"}</SubmitButton></form>
          <form action={excluirAction.bind(null, "processos", id)}><SubmitButton tone="danger">Excluir</SubmitButton></form>
        </div>
      </div>

      {p.ultimo_erro && <div className="notice bad"><b>Erro na última consulta:</b> {p.ultimo_erro}</div>}

      {p.resumo_status && (
        <div className="notice" style={{ borderColor: "var(--accent)" }}>
          <b>Como está:</b> {p.resumo_status}
        </div>
      )}

      <Card title="Capa" actions={<Pill tone={p.ativo ? "ok" : "neutral"}>{p.ativo ? "ativo" : "pausado"}{p.grau ? ` · ${p.grau}` : ""}</Pill>}>
        <dl className="capa">
          {campos.filter(([, v]) => v).map(([k, v]) => (
            <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
          ))}
        </dl>
      </Card>

      <Card
        title="Risco e provisão"
        actions={p.classificacao_risco ? <Pill tone={RISCO_TONE[p.classificacao_risco]}>{RISCO_LABEL[p.classificacao_risco]}</Pill> : <Pill>não avaliado</Pill>}
      >
        <dl className="capa">
          <div><dt>Valor provisionado</dt><dd>{p.valor_provisionado != null ? p.valor_provisionado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}</dd></div>
        </dl>
        <form action={atualizarRiscoAction.bind(null, id)} className="form">
          <Select label="Classificação (CPC 25)" name="classificacao_risco" defaultValue={p.classificacao_risco ?? ""}>
            <option value="">— não avaliado —</option>
            <option value="provavel">Provável</option>
            <option value="possivel">Possível</option>
            <option value="remoto">Remoto</option>
          </Select>
          <Input label="Valor provisionado (R$)" name="valor_provisionado" type="number" step="0.01" defaultValue={p.valor_provisionado ?? ""} />
          <div className="actions"><SubmitButton tone="secondary">Salvar avaliação</SubmitButton></div>
        </form>
      </Card>

      {arquivos.length > 0 && (
        <Card title="Documentos importados" hint={String(arquivos.length)}>
          <div className="card-b">
            <ul className="feed">
              {arquivos.map((a) => (
                <li key={a.id} className="doc">
                  <span className="stripe" />
                  <div>
                    <span className="t">{a.analise?.tipo_documento ?? a.nome}</span>
                    <span className="sub"> · {a.nome}</span>
                    {a.analise?.resumo && <div className="m">{a.analise.resumo}</div>}
                    {a.analise?.acao_recomendada && <div className="m" style={{ color: "var(--accent)" }}>⚠️ {a.analise.acao_recomendada}</div>}
                    <div className="when">{fmtDataHora(a.created_at)}</div>
                  </div>
                  <a
                    href={`/api/arquivos/${a.id}`}
                    target="_blank"
                    rel="noopener"
                    className="btn sm"
                    style={{ textDecoration: "none", flexShrink: 0 }}
                  >
                    Abrir PDF ↗
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      <Card title="Movimentações" hint={`${movs.length} · mais recente primeiro`}>
        <div className="card-b">
          {movs.length === 0 && <p className="empty">Nenhuma movimentação importada ainda.</p>}
          <ol className="timeline">
            {movs.map((m) => (
              <li key={m.id}>
                <div className="d">{fmtDataHora(m.data_hora)}{m.codigo ? ` · cód. ${m.codigo}` : ""} · {m.fonte}</div>
                <b>{m.descricao}</b>
                {m.complemento && <div className="sub">{m.complemento}</div>}
              </li>
            ))}
          </ol>
        </div>
      </Card>
    </>
  );
}
