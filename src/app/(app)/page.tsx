import Link from "next/link";
import * as store from "@/lib/store";
import { fmtData, fmtDataHora } from "@/lib/format";
import { Card, Stat, Pill, SubmitButton } from "@/components/ui";
import { ItemLink, RowLink } from "@/components/row-link";
import { SyncButton } from "@/components/sync-button";
import { marcarLidoAction, sincronizarTudoAction } from "@/app/actions";
import { Orbita, type NoOrbita, type NucleoOrbita } from "@/components/orbita";
import { Colunas, MapaCalor, Ranking, Segmentos, Sparkline } from "@/components/graficos";
import { ddmmDe, inicioGraficos, porDia, porRisco, porSemana, porTribunal, ultimosDias, vinculos } from "@/lib/painel-dados";
import { fasesDoRelatorio, ultimoRelatorio } from "@/lib/relatorio";
import { FASES, FASE_COR, FASE_ROTULO, type Fase } from "@/lib/fases";
import { nomeModelo } from "@/lib/explicador";
import { usuarioAtual } from "@/lib/usuarios";

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
// O agendamento roda de hora em hora: 2h sem nenhuma rodada = provavelmente parado.
const LIMITE_SEM_RODADA_H = 2;

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
  const det = (log.detalhes ?? {}) as { erros?: string[]; pendentes?: number; nao_verificados?: string[]; atrasados?: string[] };
  const erros = det.erros ?? [];
  const pendentes = det.pendentes ?? 0;
  const naoVerificados = det.nao_verificados ?? [];
  const atrasados = det.atrasados ?? [];
  const aberta = !log.finalizado_em;
  const emAndamento = aberta && Date.now() - new Date(log.iniciado_em).getTime() < LIMITE_RODADA_MS;
  const interrompida = aberta && !emAndamento;
  const quando = log.finalizado_em ?? log.iniciado_em;
  const semRodadaH = (Date.now() - new Date(log.iniciado_em).getTime()) / 3_600_000;

  // Sobrecarga do DataJud (429/504/resposta parcial/sem tempo) é passageira: em 14 dias até
  // 09/11/2026 o TJES recusou a consulta em 19% das rodadas, e 25 de 40 vezes voltou na hora
  // seguinte. Isso não é defeito do sistema — fica amarelo; vermelho só para o que pede ação.
  const passageiro = (e: string) => /tentar de novo mais tarde|sem tempo para consultar nesta rodada/.test(e);
  const soOscilacao = erros.length > 0 && erros.every(passageiro);

  let tom = "";
  let icone = "✅";
  let titulo = "Última atualização concluída sem erros";
  if (emAndamento) { tom = "warn"; icone = "🔄"; titulo = "Atualização em andamento"; }
  else if (interrompida) { tom = "bad"; icone = "⛔"; titulo = "A última atualização foi interrompida antes de terminar"; }
  else if (soOscilacao) { tom = "warn"; icone = "🟡"; titulo = "Fonte do CNJ sobrecarregada nesta rodada — o restante fica para a próxima hora"; }
  else if (erros.length) { tom = "bad"; icone = "⚠️"; titulo = `Última atualização terminou com ${erros.length} erro(s)`; }
  else if (pendentes) { tom = "warn"; icone = "🟡"; titulo = "Última atualização concluída em parte"; }
  if (!emAndamento && atrasados.length) { tom = "bad"; icone = "⚠️"; titulo = `${atrasados.length} processo(s) sem verificação há mais de 6 horas`; }

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
        {soOscilacao && !atrasados.length && !emAndamento && (
          <div className="linha">
            Normal: o CNJ recusa consultas em cerca de 1 a cada 5 rodadas e volta sozinho. Nada é perdido — os
            andamentos desse intervalo entram na próxima verificação. Só preocupa se aparecer o aviso de 6 horas.
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
        {atrasados.length > 0 && (
          <div className="alerta">
            Sem verificação há mais de 6 horas: {atrasados.join(", ")}. Se persistir, a fonte do CNJ pode estar fora do ar para esse tribunal.
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
        {naoVerificados.length > 0 && (
          <details>
            <summary>Ver quais processos ficaram pra próxima rodada ({naoVerificados.length})</summary>
            <ul>{naoVerificados.map((n) => <li key={n}>{n}</li>)}</ul>
          </details>
        )}
      </div>
    </div>
  );
}

const saudacao = () => {
  const h = Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }));
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
};
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const brlCurto = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 2 });

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
      store.movimentacoesPorDataDoAto(inicioGraficos()),
      ultimoRelatorio().catch(() => null),
      usuarioAtual().catch(() => null),
    ]);
  } catch (e) {
    return (
      <div className="notice bad">
        <b>Não foi possível conectar ao Firebase.</b> Configure <code>FIREBASE_SERVICE_ACCOUNT</code> (ou as credenciais automáticas do App Hosting). Detalhe: {e instanceof Error ? e.message : String(e)}
      </div>
    );
  }
  const [processos, docs, alertas, movs, prazos, ultimoLog, movsGraf, relatorio, eu] = dados;
  const porId = new Map(processos.map((p) => [p.id, p]));
  const comErro = processos.filter((p) => p.ultimo_erro);
  const novosProc = alertas.filter((a) => a.tipo === "novo_processo").length;

  // ---------------------------------------------------------------- vínculos (ordem e cor fixas)
  const { lista: listaVinc, grupoDe, cor: corVinc } = vinculos(docs);
  const grupos = new Map(listaVinc.map((g) => [g.id, { ...g, ativos: 0, alertas: 0, ultimo: null as string | null }]));
  const subFam = `${docs.filter((d) => d.tipo === "CPF" && grupoDe(d.id) === "_fam").length} CPF(s) monitorado(s)`;
  for (const p of processos) grupos.get(grupoDe(p.documento_id))!.ativos++;
  const comAlerta = new Set<string>();
  for (const a of alertas) {
    const p = a.processo_id ? porId.get(a.processo_id) : null;
    if (p) comAlerta.add(p.id);
    grupos.get(grupoDe(p?.documento_id))!.alertas++;
  }
  for (const m of movs) {
    const g = grupos.get(grupoDe(porId.get(m.processo_id)?.documento_id))!;
    if (!g.ultimo) g.ultimo = `${fmtDataHora(m.data_hora).slice(0, 5)} — ${m.descricao}`;
  }

  // ---------------------------------------------------------------- séries dos gráficos
  const movsAtivos = movsGraf.filter((m) => porId.has(m.processo_id));
  const semanas = porSemana(movsAtivos, 26);
  const dias = porDia(movsAtivos, 18);
  const ult30 = ultimosDias(movsAtivos, 30);
  const recentes7 = new Set(movsAtivos.filter((m) => Date.now() - new Date(m.data_hora).getTime() < 7 * 86400000).map((m) => m.processo_id));
  const valorCausas = processos.reduce((s, p) => s + (p.valor_causa ?? 0), 0);
  const comValor = processos.filter((p) => p.valor_causa).length;
  const fases = fasesDoRelatorio(relatorio);
  const contFase = new Map<Fase, number>();
  for (const p of processos) { const f = fases.get(p.id)?.fase; if (f) contFase.set(f, (contFase.get(f) ?? 0) + 1); }
  const semFase = processos.filter((p) => !fases.has(p.id)).length;

  const nucleos: NucleoOrbita[] = listaVinc.filter((g) => grupos.get(g.id)!.ativos > 0).map((g) => ({ id: g.id, nome: g.nome, cor: corVinc.get(g.id)! }));
  const nos: NoOrbita[] = processos.map((p) => ({
    id: p.id,
    numero: p.numero_formatado,
    descricao: p.descricao ?? p.classe ?? "",
    nucleo: grupoDe(p.documento_id),
    andamentos: p.total_movimentacoes ?? 0,
    recente: recentes7.has(p.id),
    alerta: comAlerta.has(p.id),
    ultimo: ddmmDe(p.ultima_movimentacao_em),
  }));
  const primeiroNome = eu?.nome.split(/\s+/)[0];

  return (
    <>
      <section className="hero">
        <div className="hero-txt entra">
          <span className="eyebrow">Centro de comando jurídico</span>
          <h1>{saudacao()}{primeiroNome ? <>, <span className="grad">{primeiroNome}</span></> : null}.</h1>
          <p className="data">{hoje()}</p>
          {relatorio ? (
            <div className="briefing">
              <div className="rot"><span className="ia-dot" />Briefing da IA · {fmtDataHora(relatorio.gerado_em).slice(0, 10)}</div>
              <p>{relatorio.manchete}</p>
              <Link href="/relatorio">Abrir relatório completo →</Link>
            </div>
          ) : (
            <div className="briefing">
              <div className="rot"><span className="ia-dot" />Novo no 2.0</div>
              <p>O {nomeModelo()} pode ler a carteira inteira e montar um relatório executivo com fases, riscos e próximos passos.</p>
              <Link href="/relatorio">Gerar o primeiro relatório →</Link>
            </div>
          )}
          <div className="hero-acoes">
            <a href="https://portaldeservicos.pdpj.jus.br/consulta" target="_blank" rel="noopener" className="btn primary" title="Abre o jus.br numa aba nova. Depois de logar, peça ao Claude: /sincronizar-jusbr">
              Sincronizar com jus.br ↗
            </a>
            <SyncButton action={sincronizarTudoAction} />
          </div>
          <p className="hint" style={{ marginTop: 8 }}>&quot;Sincronizar com jus.br&quot; abre o portal; depois de logar, peça ao Claude: <code>/sincronizar-jusbr</code>.</p>
        </div>
        <Orbita nucleos={nucleos} nos={nos} />
      </section>

      <StatusAtualizacao log={ultimoLog} />

      <div className="stats">
        <Stat href="/processos" label="Processos ativos" value={processos.length} sub={`em ${docs.length} CPFs/CNPJs · ${recentes7.size} com andamento na semana`} />
        <Link href="/processos" className="stat-link stat">
          <div className="lbl">Andamentos · 30 dias</div>
          <div className="val">{ult30}</div>
          <div className="sub">{semanas[semanas.length - 1].valor} nesta semana</div>
          <Sparkline valores={semanas.slice(-12).map((s) => s.valor)} />
        </Link>
        <Stat href="/alertas" label="Alertas pendentes" value={alertas.length} tone={alertas.length ? "alert" : "ok"} sub={`${novosProc} processo(s) novo(s) · ${alertas.length - novosProc} andamento(s)`} />
        <Stat href="/processos" label="Valor das causas" value={brlCurto(valorCausas)} sub={`${brl(valorCausas)} · soma de ${comValor} processo(s) com valor informado`} />
      </div>

      <div className="grid2">
        <Card title="Pulso da carteira" hint="andamentos por semana · 26 semanas">
          <div className="card-pad">
            <Colunas dados={semanas} altura={200} />
            <details className="tabela-dados">
              <summary>Ver os números</summary>
              <div className="tablewrap">
                <table><thead><tr><th>Semana</th><th className="right">Andamentos</th></tr></thead>
                  <tbody>{semanas.map((s) => <tr key={s.rotulo}><td>{s.dica}</td><td className="right">{s.valor}</td></tr>)}</tbody>
                </table>
              </div>
            </details>
          </div>
        </Card>
        <Card title="Fase de cada processo" hint={relatorio ? `pela IA · ${fmtDataHora(relatorio.gerado_em).slice(0, 10)}` : undefined} actions={<Link href="/relatorio" className="btn sm">Relatório</Link>}>
          <div className="card-pad">
            {relatorio ? (
              <>
                <Ranking itens={[...FASES, "indefinida" as const].filter((f) => contFase.get(f)).map((f) => ({ rotulo: FASE_ROTULO[f], valor: contFase.get(f)!, cor: FASE_COR[f] }))} />
                {semFase > 0 && <p className="hint" style={{ marginTop: 10 }}>{semFase} processo(s) entraram depois do relatório — gere um novo para classificá-los.</p>}
              </>
            ) : (
              <p className="empty">Gere o relatório da IA para ver em que fase está cada processo (início, provas, sentença, recurso, execução, encerrado).</p>
            )}
          </div>
        </Card>
      </div>

      <div className="grid3">
        <Card title="Mapa de calor" hint="andamentos por dia · 18 semanas">
          <div className="card-pad"><MapaCalor dias={dias} /></div>
        </Card>
        <Card title="Processos por vínculo">
          <div className="card-pad">
            <Ranking itens={[...grupos.values()].filter((g) => g.ativos).sort((a, b) => b.ativos - a.ativos).map((g) => ({ rotulo: g.nome, valor: g.ativos, cor: `var(${corVinc.get(g.id)})`, href: g.id === "_fam" ? undefined : `/documentos/${g.id}` }))} />
          </div>
        </Card>
        <Card title="Perfil da carteira">
          <div className="card-pad">
            <div className="hint" style={{ fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", fontSize: 10.5 }}>Por tribunal</div>
            <Segmentos partes={porTribunal(processos)} />
            <div className="hint" style={{ fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", fontSize: 10.5, marginTop: 14 }}>Risco avaliado (CPC 25)</div>
            <Segmentos partes={porRisco(processos)} />
          </div>
        </Card>
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
                      <div className="m">{a.explicacao ?? a.mensagem}</div>
                      {a.o_que_fazer && <div className="explica fazer">➜ {a.o_que_fazer}</div>}
                      <div className="when">{fmtDataHora(a.created_at)}</div>
                    </div>
                    <form action={marcarLidoAction.bind(null, a.id)}>
                      <SubmitButton tone="sm">✓</SubmitButton>
                    </form>
                  </>
                );
                const cls = a.tipo === "novo_processo" ? "novo" : a.tipo === "erro" ? "erro" : a.tipo === "documento_importado" ? "doc" : "";
                return a.processo_id ? (
                  <ItemLink key={a.id} href={`/processos/${a.processo_id}`} className={cls}>{linha}</ItemLink>
                ) : (
                  <li key={a.id} className={cls}>{linha}</li>
                );
              })}
            </ul>
            {alertas.length > 10 && (
              <Link href="/alertas" className="hint" style={{ textDecoration: "underline" }}>Ver todos os {alertas.length}</Link>
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
                    <span className="stripe" style={{ background: p ? `var(${corVinc.get(grupoDe(p.documento_id))})` : "var(--line-strong)" }} />
                    <div>
                      <Link href={`/processos/${m.processo_id}`} className="t link mono">{p?.numero_formatado ?? m.processo_id}</Link>
                      {p?.descricao && <span className="sub"> · {p.descricao}</span>}
                      <div className="m">{m.descricao}{m.complemento && <span className="hint"> — {m.complemento}</span>}</div>
                      {m.explicacao && <div className="explica">{m.explicacao}</div>}
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
              {[...grupos.values()].filter((g) => g.ativos || g.alertas || g.id === "_fam").map((g) => {
                const celulas = (
                  <>
                    <td><b style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><i style={{ width: 9, height: 9, borderRadius: 3, background: `var(${corVinc.get(g.id)})` }} />{g.nome}</b>{g.id === "_fam" && <div className="sub">{subFam}</div>}</td>
                    <td className="right">{g.ativos}</td>
                    <td>{g.ultimo ?? <span className="hint">—</span>}</td>
                    <td>{g.alertas ? <Pill tone="accent">{g.alertas} alerta(s)</Pill> : <Pill>em dia</Pill>}</td>
                  </>
                );
                return g.id !== "_fam" ? <RowLink key={g.id} href={`/documentos/${g.id}`}>{celulas}</RowLink> : <tr key={g.id}>{celulas}</tr>;
              })}
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
