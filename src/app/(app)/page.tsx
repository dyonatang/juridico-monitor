import Link from "next/link";
import * as store from "@/lib/store";
import { fmtData, fmtDataHora } from "@/lib/format";
import { Card, Stat, Pill, SubmitButton } from "@/components/ui";
import { ItemLink, RowLink } from "@/components/row-link";
import { SyncButton } from "@/components/sync-button";
import { marcarLidoAction, sincronizarTudoAction } from "@/app/actions";

export const dynamic = "force-dynamic";

const hoje = () => new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });

const haQuanto = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "agora mesmo";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `há ${h}h` : `há ${Math.round(h / 24)} dias`;
};

// Uma rodada nunca passa de ~4 min (orçamento do cron); aberta há mais que isso = foi interrompida.
const LIMITE_RODADA_MS = 6 * 60_000;
// Sem nenhuma rodada nesse intervalo, o agendamento automático provavelmente está parado.
const LIMITE_SEM_RODADA_H = 26;

function StatusAtualizacao({ log }: { log: store.SyncLog | null }) {
  if (!log) {
    return (
      <div className="sync-status warn">
        <span className="icone">⚠️</span>
        <div>
          <div className="titulo">Nenhuma atualização registrada ainda</div>
          <div className="linha">Clique em &quot;Sincronizar agora&quot; para fazer a primeira consulta aos tribunais.</div>
        </div>
      </div>
    );
  }
  const det = (log.detalhes ?? {}) as { erros?: string[]; pendentes?: number };
  const erros = det.erros ?? [];
  const pendentes = det.pendentes ?? 0;
  const aberta = !log.finalizado_em;
  const emAndamento = aberta && Date.now() - new Date(log.iniciado_em).getTime() < LIMITE_RODADA_MS;
  const interrompida = aberta && !emAndamento;
  const quando = log.finalizado_em ?? log.iniciado_em;
  const semRodadaH = (Date.now() - new Date(log.iniciado_em).getTime()) / 3_600_000;

  let tom = "";
  let icone = "✅";
  let titulo = "Última atualização concluída sem erros";
  if (emAndamento) { tom = "warn"; icone = "🔄"; titulo = "Atualização em andamento"; }
  else if (interrompida) { tom = "bad"; icone = "⛔"; titulo = "A última atualização foi interrompida antes de terminar"; }
  else if (erros.length) { tom = "bad"; icone = "⚠️"; titulo = `Última atualização terminou com ${erros.length} erro(s)`; }
  else if (pendentes) { tom = "warn"; icone = "🟡"; titulo = "Última atualização concluída em parte"; }

  return (
    <div className={`sync-status ${tom}`}>
      <span className="icone">{icone}</span>
      <div style={{ flex: 1 }}>
        <div className="titulo">{titulo}</div>
        <div className="linha">
          {emAndamento ? "Começou" : interrompida ? "Iniciada" : "Terminou"} {haQuanto(quando)} — {fmtDataHora(quando)}
        </div>
        {!emAndamento && !interrompida && (
          <div className="linha">
            {log.processos_verificados} processo(s) verificado(s) · {log.novas_movimentacoes} andamento(s) novo(s) · {erros.length} erro(s)
            {pendentes > 0 && ` · ${pendentes} ficaram pra próxima rodada (a fonte estava lenta)`}
          </div>
        )}
        {interrompida && (
          <div className="linha">Nada foi perdido — a próxima rodada continua pelos processos que ficaram sem checar.</div>
        )}
        {semRodadaH > LIMITE_SEM_RODADA_H && (
          <div className="alerta">
            Nenhuma atualização nas últimas {Math.round(semRodadaH)} horas — o agendamento automático pode estar parado.
          </div>
        )}
        {erros.length > 0 && (
          <details>
            <summary>Ver quais processos deram erro</summary>
            <ul>
              {erros.map((e, i) => <li key={i}>{e.length > 180 ? `${e.slice(0, 180)}…` : e}</li>)}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}

export default async function Painel() {
  let dados;
  try {
    dados = await Promise.all([
      store.listarProcessos({ apenasAtivos: true }),
      store.listarDocumentos(true),
      store.listarAlertas({ apenasNaoLidos: true }),
      store.movimentacoesRecentes(new Date(Date.now() - 7 * 86400000).toISOString(), 10),
      store.listarProximosPrazos(8),
      store.ultimoSyncLog(),
    ]);
  } catch (e) {
    return (
      <div className="notice bad">
        <b>Não foi possível conectar ao Firebase.</b> Configure <code>FIREBASE_SERVICE_ACCOUNT</code> (ou as credenciais automáticas do App Hosting). Detalhe: {e instanceof Error ? e.message : String(e)}
      </div>
    );
  }
  const [processos, docs, alertas, movs, prazos, ultimoLog] = dados;
  const docsPorId = new Map(docs.map((d) => [d.id, d]));
  const porId = new Map(processos.map((p) => [p.id, p]));
  const comErro = processos.filter((p) => p.ultimo_erro);
  const novosProc = alertas.filter((a) => a.tipo === "novo_processo").length;

  // agrupamento por CNPJ (+ "Família" pra CPFs sem vínculo a um CNPJ)
  const grupoDoDocumento = (docId: string | null | undefined): string => {
    if (!docId) return "_fam";
    const d = docsPorId.get(docId);
    if (!d) return "_fam";
    if (d.tipo === "CNPJ") return d.id;
    return d.vinculo_id && docsPorId.get(d.vinculo_id)?.tipo === "CNPJ" ? d.vinculo_id : "_fam";
  };
  const grupos = new Map<string, { id: string | null; nome: string; sub: string; ativos: number; alertas: number; ultimo: string | null }>();
  for (const d of docs.filter((d) => d.tipo === "CNPJ")) grupos.set(d.id, { id: d.id, nome: d.apelido || d.nome, sub: d.apelido ? d.nome : "", ativos: 0, alertas: 0, ultimo: null });
  grupos.set("_fam", { id: null, nome: "Família / sem vínculo", sub: `${docs.filter((d) => d.tipo === "CPF" && grupoDoDocumento(d.id) === "_fam").length} CPF(s) monitorado(s)`, ativos: 0, alertas: 0, ultimo: null });
  for (const p of processos) {
    const g = grupos.get(grupoDoDocumento(p.documento_id)) ?? grupos.get("_fam")!;
    g.ativos++;
  }
  for (const a of alertas) {
    const p = a.processo_id ? porId.get(a.processo_id) : null;
    const g = grupos.get(grupoDoDocumento(p?.documento_id)) ?? grupos.get("_fam")!;
    g.alertas++;
  }
  for (const m of movs) {
    const p = porId.get(m.processo_id);
    const g = grupos.get(grupoDoDocumento(p?.documento_id)) ?? grupos.get("_fam")!;
    if (!g.ultimo) g.ultimo = `${fmtDataHora(m.data_hora).slice(0, 5)} — ${m.descricao}`;
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Painel</h1>
          <p style={{ textTransform: "capitalize" }}>{hoje()}</p>
        </div>
        <div className="actions-row" style={{ alignItems: "flex-start" }}>
          <a
            href="https://portaldeservicos.pdpj.jus.br/consulta"
            target="_blank"
            rel="noopener"
            className="btn primary"
            title="Abre o jus.br numa aba nova. Depois de logar, peça ao Claude: /sincronizar-jusbr"
          >
            Sincronizar com jus.br
          </a>
          <SyncButton action={sincronizarTudoAction} />
        </div>
      </div>
      <p className="hint" style={{ marginTop: -14, marginBottom: 18 }}>
        &quot;Sincronizar com jus.br&quot; abre o portal numa aba nova — depois de logar, peça ao Claude: <code>/sincronizar-jusbr</code>.
      </p>

      <StatusAtualizacao log={ultimoLog} />

      <div className="stats">
        <Stat href="/processos" label="Processos ativos" value={processos.length} sub={`${processos.filter((p) => p.origem === "descoberto").length} descobertos automaticamente`} />
        <Stat href="/documentos" label="CPFs / CNPJs monitorados" value={docs.length} sub={`${docs.filter((d) => d.tipo === "CNPJ").length} empresas · ${docs.filter((d) => d.tipo === "CPF").length} pessoas`} />
        <Stat href="/alertas" label="Alertas pendentes" value={alertas.length} tone={alertas.length ? "alert" : "ok"} sub={`${novosProc} processo(s) novo(s) · ${alertas.length - novosProc} andamento(s)`} />
        <Stat href="/processos?erro=1" label="Com erro na consulta" value={comErro.length} tone={comErro.length ? "alert" : "ok"} sub={comErro.length ? "veja abaixo" : "todas as fontes responderam"} />
      </div>

      <div className="grid2">
        <Card
          title="Alertas pendentes"
          actions={
            alertas.length ? (
              <form action={marcarLidoAction.bind(null, undefined)}>
                <SubmitButton tone="sm">Marcar todos como lidos</SubmitButton>
              </form>
            ) : null
          }
        >
          <div className="card-b">
            {alertas.length === 0 && <p className="empty">Nenhum alerta pendente.</p>}
            <ul className="feed">
              {alertas.slice(0, 10).map((a) => {
                const linha = (
                  <>
                    <span className="stripe" />
                    <div>
                      <Pill tone={a.tipo === "erro" ? "bad" : a.tipo === "novo_processo" ? "warn" : a.tipo === "documento_importado" ? "accent" : "ok"}>{a.tipo === "nova_movimentacao" ? "andamento" : a.tipo === "novo_processo" ? "processo novo" : a.tipo === "documento_importado" ? "documento" : "erro"}</Pill>{" "}
                      {a.processo_id ? (
                        <Link href={`/processos/${a.processo_id}`} className="t link">{a.titulo}</Link>
                      ) : (
                        <span className="t">{a.titulo}</span>
                      )}
                      <div className="m">{a.mensagem}</div>
                      <div className="when">{fmtDataHora(a.created_at)}</div>
                    </div>
                    <form action={marcarLidoAction.bind(null, a.id)}>
                      <SubmitButton tone="sm">✓</SubmitButton>
                    </form>
                  </>
                );
                const cls = a.tipo === "novo_processo" ? "novo" : a.tipo === "erro" ? "erro" : a.tipo === "documento_importado" ? "doc" : "";
                return a.processo_id ? (
                  <ItemLink key={a.id} href={`/processos/${a.processo_id}`} className={cls}>
                    {linha}
                  </ItemLink>
                ) : (
                  <li key={a.id} className={cls}>
                    {linha}
                  </li>
                );
              })}
            </ul>
            {alertas.length > 10 && (
              <Link href="/alertas" className="hint" style={{ textDecoration: "underline" }}>
                Ver todos os {alertas.length}
              </Link>
            )}
          </div>
        </Card>

        <Card title="Últimas movimentações" hint="7 dias">
          <div className="card-b">
            {movs.length === 0 && <p className="empty">Nenhuma movimentação nos últimos 7 dias.</p>}
            <ul className="feed">
              {movs.map((m) => {
                const p = porId.get(m.processo_id);
                return (
                  <ItemLink key={m.id} href={`/processos/${m.processo_id}`}>
                    <span className="stripe" style={{ background: "var(--line-strong)" }} />
                    <div>
                      <Link href={`/processos/${m.processo_id}`} className="t link mono">{p?.numero_formatado ?? m.processo_id}</Link>
                      {p?.descricao && <span className="sub"> · {p.descricao}</span>}
                      <div className="m">{m.descricao}{m.complemento && <span className="hint"> — {m.complemento}</span>}</div>
                      <div className="when">{fmtDataHora(m.data_hora)}</div>
                    </div>
                    <span />
                  </ItemLink>
                );
              })}
            </ul>
          </div>
        </Card>
      </div>

      {prazos.length > 0 && (
        <Card title="Próximos prazos e audiências">
          <div className="card-b">
            <ul className="feed">
              {prazos.map(({ prazo, processo }) => (
                <ItemLink key={prazo.id} href={`/processos/${processo.id}`}>
                  <span className="stripe" style={{ background: "var(--accent)" }} />
                  <div>
                    <b>{fmtData(prazo.data)}</b>{" "}
                    <Link href={`/processos/${processo.id}`} className="t link mono">{processo.numero_formatado}</Link>
                    {processo.descricao && <span className="sub"> · {processo.descricao}</span>}
                    <div className="m">{prazo.descricao}</div>
                  </div>
                  <span />
                </ItemLink>
              ))}
            </ul>
          </div>
        </Card>
      )}

      <Card title="Processos por vínculo" actions={<Link href="/processos" className="btn sm">Ver todos</Link>}>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Vínculo</th><th className="right">Ativos</th><th>Último andamento (7 dias)</th><th>Pendente</th></tr></thead>
            <tbody>
              {[...grupos.values()].filter((g) => g.ativos || g.alertas || g.sub).map((g) =>
                g.id ? (
                  <RowLink key={g.nome} href={`/documentos/${g.id}`}>
                    <td><b>{g.nome}</b>{g.sub && <div className="sub">{g.sub}</div>}</td>
                    <td className="right">{g.ativos}</td>
                    <td>{g.ultimo ?? <span className="hint">—</span>}</td>
                    <td>{g.alertas ? <Pill tone="accent">{g.alertas} alerta(s)</Pill> : <Pill>em dia</Pill>}</td>
                  </RowLink>
                ) : (
                  <tr key={g.nome}>
                    <td><b>{g.nome}</b>{g.sub && <div className="sub">{g.sub}</div>}</td>
                    <td className="right">{g.ativos}</td>
                    <td>{g.ultimo ?? <span className="hint">—</span>}</td>
                    <td>{g.alertas ? <Pill tone="accent">{g.alertas} alerta(s)</Pill> : <Pill>em dia</Pill>}</td>
                  </tr>
                ),
              )}
              {grupos.size === 0 && <tr><td colSpan={4} className="empty">Cadastre um CPF/CNPJ para começar.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {comErro.length > 0 && (
        <Card title="Processos com erro na última consulta">
          <div className="card-b">
            <ul className="feed">
              {comErro.map((p) => (
                <ItemLink key={p.id} href={`/processos/${p.id}`} className="erro">
                  <span className="stripe" />
                  <div>
                    <Link href={`/processos/${p.id}`} className="t link mono">{p.numero_formatado}</Link>
                    <div className="m">{p.ultimo_erro}</div>
                  </div>
                  <span />
                </ItemLink>
              ))}
            </ul>
          </div>
        </Card>
      )}
      {docs.length === 0 && processos.length === 0 && (
        <div className="notice">
          <b>Começando do zero?</b> Cadastre os <Link href="/documentos">CPFs/CNPJs</Link> (empresas e pessoas do grupo) e depois os <Link href="/processos">processos</Link>.
        </div>
      )}
    </>
  );
}
