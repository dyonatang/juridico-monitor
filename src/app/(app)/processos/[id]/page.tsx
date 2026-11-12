import { notFound } from "next/navigation";
import { after } from "next/server";
import * as store from "@/lib/store";
import { fmtData, fmtDataHora } from "@/lib/format";
import { ActionForm, BackLink, Card, Input, Pill, Select, SubmitButton } from "@/components/ui";
import {
  adicionarPontoControvertidoAction,
  adicionarPrazoAction,
  alternarAtivoAction,
  atualizarRiscoAction,
  atualizarStatusPontoAction,
  excluirAction,
  excluirPontoControvertidoAction,
  excluirPrazoAction,
  sincronizarProcessoAction,
  gerarFichaAction,
  explicarRecentesAction,
} from "@/app/actions";
import { iaDisponivel } from "@/lib/explicador";
import { CopiarTexto } from "@/components/copiar-texto";
import { registrarAuditoria } from "@/lib/auditoria";
import { usuarioAtual } from "@/lib/usuarios";
import type { Movimentacao, PontoControvertido } from "@/lib/types";
import { fasesDoRelatorio, ultimoRelatorio } from "@/lib/relatorio";
import { FASES, FASE_ROTULO, type Fase } from "@/lib/fases";
import { Colunas } from "@/components/graficos";
import { semHtml } from "@/lib/djen";

export const dynamic = "force-dynamic";

const RISCO_LABEL: Record<string, string> = { provavel: "Provável", possivel: "Possível", remoto: "Remoto" };
const RISCO_TONE: Record<string, "bad" | "warn" | "ok"> = { provavel: "bad", possivel: "warn", remoto: "ok" };
const STATUS_LABEL: Record<PontoControvertido["status"], string> = { pendente: "Pendente", favoravel: "Favorável", desfavoravel: "Desfavorável" };
const STATUS_TONE: Record<PontoControvertido["status"], "neutral" | "ok" | "bad"> = { pendente: "neutral", favoravel: "ok", desfavoravel: "bad" };
const STATUS_ORDEM: PontoControvertido["status"][] = ["pendente", "favoravel", "desfavoravel"];
const IMPORTANCIA: Record<string, { rotulo: string; tom: "bad" | "warn" | "neutral" }> = {
  alta: { rotulo: "importante", tom: "bad" },
  media: { rotulo: "atenção", tom: "warn" },
  baixa: { rotulo: "rotina", tom: "neutral" },
};

export default async function ProcessoDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // O id da rota é o próprio número CNJ (id do documento) — dá pra buscar tudo de uma vez,
  // em vez de 4 idas e voltas seguidas ao banco (São Paulo) a partir do servidor (EUA).
  const [p, movs, docs, arquivos, eu, rel, pubs] = await Promise.all([
    store.getProcesso(id), store.listarMovimentacoes(id), store.listarDocumentos(), store.listarArquivosDoProcesso(id),
    usuarioAtual().catch(() => null), // já lido pelo layout (cache da requisição)
    ultimoRelatorio().catch(() => null),
    store.listarPublicacoesDoProcesso(id).catch(() => []),
  ]);
  if (!p) notFound();
  // Registro de auditoria depois que a página já foi enviada (não atrasa a abertura).
  // O login vai pronto: dentro de after() a página não pode mais ler cookies.
  after(() => registrarAuditoria("visualizou_processo", { tipo: "processo", id: p.id, rotulo: p.numero_formatado }, eu?.login ?? "sistema"));
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

  // Fase: a da ficha (mais detalhada) vale mais que a do relatório da carteira.
  const doRel = fasesDoRelatorio(rel).get(id);
  const fase: { fase: Fase; motivo: string; fonte: string } | null = p.ficha?.fase
    ? { fase: p.ficha.fase, motivo: p.ficha.fase_motivo ?? "", fonte: `a ficha do caso de ${fmtData(p.ficha.gerada_em)}` }
    : doRel ? { fase: doRel.fase, motivo: doRel.frase, fonte: `o relatório executivo de ${fmtData(rel!.gerado_em)}` } : null;

  return (
    <>
      <BackLink href="/processos">Processos</BackLink>
      <div className="processo-hero entra">
        <div>
          <span className="eyebrow">{[p.tribunal?.toUpperCase(), p.classe].filter(Boolean).join(" · ") || "Processo"}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
            <h1>{p.numero_formatado}</h1>
            <CopiarTexto texto={p.numero_formatado} rotulo="Copiar número" />
          </div>
          <p className="desc">{[p.descricao, doc ? doc.apelido || doc.nome : null].filter(Boolean).join(" · ") || "sem descrição"}</p>
          <div className="chips">
            <Pill tone={p.ativo ? "ok" : "neutral"}>{p.ativo ? "● monitorando" : "pausado"}</Pill>
            {fase && <Pill tone="accent">{FASE_ROTULO[fase.fase]}</Pill>}
            {p.classificacao_risco && <Pill tone={RISCO_TONE[p.classificacao_risco]}>risco {RISCO_LABEL[p.classificacao_risco].toLowerCase()}</Pill>}
            <Pill>{movs.length} andamentos</Pill>
            {p.valor_causa ? <Pill>{p.valor_causa.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</Pill> : null}
          </div>
        </div>
        <div className="actions-row">
          <form action={sincronizarProcessoAction.bind(null, id)}><SubmitButton>Consultar agora</SubmitButton></form>
          <form action={alternarAtivoAction.bind(null, "processos", id, !p.ativo)}><SubmitButton tone="secondary">{p.ativo ? "Pausar" : "Retomar"}</SubmitButton></form>
          <form action={excluirAction.bind(null, "processos", id)}><SubmitButton tone="danger">Excluir</SubmitButton></form>
        </div>
      </div>

      {p.ultimo_erro && <div className="notice bad"><b>Erro na última consulta:</b> {p.ultimo_erro}</div>}
      {!p.ultimo_erro && p.aviso_fonte && <div className="notice"><b>Sobre a atualização automática:</b> {p.aviso_fonte}</div>}

      {p.resumo_status && (
        <div className="notice" style={{ borderColor: "var(--accent)" }}>
          <b>Como está:</b> {p.resumo_status}
        </div>
      )}

      {fase && <Jornada fase={fase.fase} motivo={fase.motivo} fonte={fase.fonte} />}

      <FichaDoCaso id={id} p={p} />

      <Card title="Próximos prazos" hint={p.proximos_prazos?.length ? String(p.proximos_prazos.length) : undefined}>
        <div className="card-b">
          {(!p.proximos_prazos || p.proximos_prazos.length === 0) && <p className="empty">Nenhum prazo ou audiência registrado.</p>}
          {p.proximos_prazos && p.proximos_prazos.length > 0 && (
            <ul className="plain-list">
              {[...p.proximos_prazos]
                .sort((a, b) => a.data.localeCompare(b.data))
                .map((pr) => (
                  <li key={pr.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
                    <span className="mono sub" style={{ flexShrink: 0 }}>{fmtData(pr.data)}</span>
                    <span style={{ flex: 1 }}>{pr.descricao}</span>
                    <form action={excluirPrazoAction.bind(null, id, pr.id)}>
                      <SubmitButton tone="sm-danger">Excluir</SubmitButton>
                    </form>
                  </li>
                ))}
            </ul>
          )}
        </div>
        <form action={adicionarPrazoAction.bind(null, id)} className="form">
          <Input label="Data" name="data" type="date" />
          <Input label="Descrição" name="descricao" wide placeholder="ex.: Audiência una — comparecer com preposto" />
          <div className="actions"><SubmitButton tone="secondary">Adicionar</SubmitButton></div>
        </form>
      </Card>

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

      <Card title="Pontos controvertidos" hint={p.pontos_controvertidos?.length ? String(p.pontos_controvertidos.length) : undefined}>
        <div className="card-b">
          {(!p.pontos_controvertidos || p.pontos_controvertidos.length === 0) && (
            <p className="empty">Nada registrado ainda — o que falta provar ou decidir nesse processo.</p>
          )}
          {p.pontos_controvertidos && p.pontos_controvertidos.length > 0 && (
            <ul className="plain-list">
              {p.pontos_controvertidos.map((pt) => (
                <li key={pt.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                  <Pill tone={STATUS_TONE[pt.status]}>{STATUS_LABEL[pt.status]}</Pill>
                  <span style={{ flex: 1 }}>{pt.texto}</span>
                  <div className="actions-row">
                    {STATUS_ORDEM.filter((s) => s !== pt.status).map((s) => (
                      <form key={s} action={atualizarStatusPontoAction.bind(null, id, pt.id, s)}>
                        <SubmitButton tone="sm">{STATUS_LABEL[s]}</SubmitButton>
                      </form>
                    ))}
                    <form action={excluirPontoControvertidoAction.bind(null, id, pt.id)}>
                      <SubmitButton tone="sm-danger">Excluir</SubmitButton>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <form action={adicionarPontoControvertidoAction.bind(null, id)} className="form">
          <Input label="Novo ponto controvertido" name="texto" wide placeholder="ex.: se a requerida emitiu os cheques" />
          <div className="actions"><SubmitButton tone="secondary">Adicionar</SubmitButton></div>
        </form>
      </Card>

      <Card
        title="Publicações no Diário"
        hint={p.djen_check ? `${pubs.length} · consultado ${fmtDataHora(p.djen_check)} · robô às 6h e 18h` : "o robô consulta às 6h e às 18h"}
      >
        <div className="card-b">
          {pubs.length === 0 && (
            <p className="empty">
              {p.djen_check ? "Nenhuma publicação deste processo no Diário de Justiça Eletrônico Nacional." : "Ainda não consultado — entra na próxima passada do robô."}
              {p.djen_erro && <span className="hint"> Última tentativa: {p.djen_erro}</span>}
            </p>
          )}
          <ul className="feed">
            {pubs.slice(0, 8).map((x) => (
              <li key={x.id} className="doc">
                <span className="stripe" />
                <div>
                  <span className="t">{fmtData(x.data_disponibilizacao)} · {x.tipo_documento || x.tipo_comunicacao || "Comunicação"}</span>
                  {x.orgao && <span className="sub"> · {x.orgao}</span>}
                  {x.explicacao && <div className="explica">{x.explicacao}</div>}
                  {x.prazo && <div className="explica fazer">⏱ Prazo no texto: {x.prazo}</div>}
                  {x.o_que_fazer && <div className="explica fazer">→ {x.o_que_fazer}</div>}
                  <details style={{ marginTop: 6 }}>
                    <summary className="hint" style={{ cursor: "pointer" }}>Ler o texto publicado</summary>
                    <div className="m" style={{ marginTop: 6, whiteSpace: "pre-line" }}>{semHtml(x.texto)}</div>
                  </details>
                </div>
                <span />
              </li>
            ))}
          </ul>
          {pubs.length > 8 && <p className="hint" style={{ marginTop: 8 }}>e mais {pubs.length - 8} publicação(ões) mais antigas.</p>}
          <p className="hint" style={{ marginTop: 8 }}>Fonte: Diário de Justiça Eletrônico Nacional (CNJ), consulta pública. A explicação é da IA; confirme prazos com a advogada.</p>
        </div>
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

      <Card
        title="Movimentações"
        hint={`${movs.length} · mais recente primeiro`}
        actions={iaDisponivel() && movs.some((m) => !m.explicado_em) ? (
          <ActionForm action={explicarRecentesAction.bind(null, id)} submitLabel="Explicar recentes" tone="sm" />
        ) : undefined}
      >
        <div className="card-b">
          {movs.length === 0 && <p className="empty">Nenhuma movimentação importada ainda.</p>}
          {movs.length > 3 && (
            <div style={{ padding: "10px 0 6px", borderBottom: "1px solid var(--line)", marginBottom: 8 }}>
              <div className="hint" style={{ fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", fontSize: 10.5, marginBottom: 4 }}>Ritmo · andamentos por mês (24 meses)</div>
              <Colunas dados={porMes(movs)} altura={150} rotuloCada={3} />
            </div>
          )}
          <ol className="timeline">
            {movs.map((m) => (
              <li key={m.id} className={m.importancia ? `imp-${m.importancia}` : undefined}>
                <div className="d">{fmtDataHora(m.data_hora)}{m.codigo ? ` · cód. ${m.codigo}` : ""} · {m.fonte}</div>
                <b>{m.descricao}</b>{" "}
                {m.importancia && <Pill tone={IMPORTANCIA[m.importancia].tom}>{IMPORTANCIA[m.importancia].rotulo}</Pill>}
                {m.complemento && <div className="sub">{m.complemento}</div>}
                {m.explicacao && <div className="explica">{m.explicacao}</div>}
                {m.o_que_fazer && <div className="explica fazer">➜ {m.o_que_fazer}</div>}
              </li>
            ))}
          </ol>
        </div>
      </Card>
    </>
  );
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/** Andamentos por mês nos últimos 24 meses (data do ato, fuso de São Paulo). */
function porMes(movs: Movimentacao[]) {
  const hoje = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const meses = Array.from({ length: 24 }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - 23 + i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const cont = new Map(meses.map((m) => [m, 0]));
  for (const m of movs) {
    const k = new Date(m.data_hora).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
    if (cont.has(k)) cont.set(k, cont.get(k)! + 1);
  }
  return meses.map((m) => {
    const rot = `${MESES[Number(m.slice(5)) - 1]}/${m.slice(2, 4)}`;
    return { rotulo: rot, valor: cont.get(m)!, dica: rot };
  });
}

/** Trilha das fases em perspectiva: feitas em gradiente, a atual pulsando. */
function Jornada({ fase, motivo, fonte }: { fase: Fase; motivo: string; fonte: string }) {
  const atual = FASES.indexOf(fase as (typeof FASES)[number]);
  return (
    <Card title="Jornada do processo" hint={`segundo a ${fonte}`}>
      <div className="jornada">
        <div className="trilha">
          {FASES.map((f, i) => {
            const cls = fase === "encerrado" ? "feita" : i < atual ? "feita" : i === atual ? "atual" : "";
            return <div key={f} className={`etapa ${cls}`}><i />{FASE_ROTULO[f]}</div>;
          })}
        </div>
        <p className="nota">{fase === "indefinida" ? "Os dados ainda não mostram em que fase o processo está. " : ""}{motivo}</p>
      </div>
    </Card>
  );
}

function FichaDoCaso({ id, p }: { id: string; p: NonNullable<Awaited<ReturnType<typeof store.getProcesso>>> }) {
  const f = p.ficha;
  const botao = iaDisponivel() ? (
    <ActionForm action={gerarFichaAction.bind(null, id)} submitLabel={f ? "Atualizar ficha" : "Gerar ficha do caso"} tone={f ? "sm" : "secondary"} />
  ) : null;
  if (!f) {
    return (
      <Card title="Ficha do caso" actions={botao}>
        <div className="card-b">
          <p className="empty">
            Resumo do processo feito pela IA a partir dos andamentos e dos PDFs importados: em que pé está, quem é quem, o que falta e
            o próximo passo. Leva cerca de 1 minuto.
          </p>
        </div>
      </Card>
    );
  }
  return (
    <Card title="Ficha do caso" hint={`gerada ${fmtDataHora(f.gerada_em)}`} actions={botao}>
      <div className="card-b ficha">
        <p>{f.situacao_atual}</p>
        {f.ultima_decisao && (<><h3>Última decisão</h3><p>{f.ultima_decisao}</p></>)}
        {f.pendencias.length > 0 && (<><h3>O que está pendente</h3><ul>{f.pendencias.map((x, i) => <li key={i}>{x}</li>)}</ul></>)}
        {f.proximo_passo && (<><h3>Próximo passo sugerido</h3><p>{f.proximo_passo}</p></>)}
        {f.quem_e_quem.length > 0 && (
          <><h3>Quem é quem</h3><ul>{f.quem_e_quem.map((x, i) => <li key={i}><b>{x.nome}</b> — {x.papel}</li>)}</ul></>
        )}
        {f.limites.length > 0 && (
          <p className="sub" style={{ marginTop: 12 }}>
            <b>Limites desta ficha:</b> {f.limites.join(" ")} A ficha é um apoio, não substitui a análise da advogada.
          </p>
        )}
      </div>
    </Card>
  );
}
