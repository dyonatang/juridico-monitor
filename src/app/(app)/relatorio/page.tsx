import Link from "next/link";
import * as store from "@/lib/store";
import { fmtData, fmtDataHora } from "@/lib/format";
import { Card, Pill } from "@/components/ui";
import { Contador, Ranking, Revela } from "@/components/graficos";
import { BotaoImprimir, GerarRelatorio, Termometro } from "@/components/relatorio-ui";
import { gerarRelatorioAction } from "@/app/actions";
import { ultimoRelatorio } from "@/lib/relatorio";
import { iaDisponivel, nomeModelo } from "@/lib/explicador";
import { FASES, FASE_COR, FASE_ROTULO, type Fase } from "@/lib/fases";

export const dynamic = "force-dynamic";

const URGENCIA = {
  agora: { rotulo: "agora", tom: "bad" as const },
  esta_semana: { rotulo: "esta semana", tom: "warn" as const },
  acompanhar: { rotulo: "acompanhar", tom: "neutral" as const },
};
const TOM_TAG = { atencao: "◆ atenção", positivo: "● boa notícia", neutro: "○ para saber" };

/** Manchete que entra palavra por palavra (CSS puro — já vem pronta do servidor, sem piscar). */
function Manchete({ texto }: { texto: string }) {
  return (
    <h1 aria-label={texto}>
      {texto.split(" ").map((p, i) => (
        <span key={i} aria-hidden="true" className="entra" style={{ display: "inline-block", animationDelay: `${120 + i * 55}ms`, marginRight: "0.26em" }}>{p}</span>
      ))}
    </h1>
  );
}

export default async function RelatorioPage() {
  const [r, processos, prazos] = await Promise.all([
    ultimoRelatorio(),
    store.listarProcessos({ apenasAtivos: true }),
    store.listarProximosPrazos(50),
  ]);
  const porId = new Map(processos.map((p) => [p.id, p]));
  const ia = iaDisponivel();
  const botao = ia ? (
    <GerarRelatorio action={gerarRelatorioAction} rotulo={r ? "Gerar novo relatório" : "Gerar relatório agora"} total={processos.length} modelo={nomeModelo()} />
  ) : <span className="hint">IA não configurada (ANTHROPIC_API_KEY).</span>;

  if (!r) {
    return (
      <>
        <section className="rel-hero">
          <div className="scan" />
          <span className="eyebrow">Relatório executivo · {nomeModelo()}</span>
          <h1>A carteira inteira, lida pela IA, em um só lugar.</h1>
          <p className="resumo">
            O {nomeModelo()} lê os {processos.length} processos ativos — capa, andamentos explicados, fichas e prazos — e devolve a manchete
            da semana, um termômetro de risco, os destaques, a fase de cada processo e os próximos passos. Só usa os dados do sistema:
            o que não estiver aqui, ele diz que não sabe.
          </p>
          <div className="meta-linha" style={{ marginTop: 22 }}>{botao}</div>
        </section>
      </>
    );
  }

  const contFase = new Map<Fase, number>();
  for (const x of r.processos) contFase.set(x.fase, (contFase.get(x.fase) ?? 0) + 1);
  const emAtencao = r.processos.filter((x) => x.atencao).length;
  const em30 = prazos.filter(({ prazo }) => prazo.data <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)).length;
  const fasesUsadas = [...FASES, "indefinida" as const].filter((f) => contFase.get(f));
  const desatualizado = Date.now() - new Date(r.gerado_em).getTime() > 7 * 86400000;
  const novos = processos.filter((p) => !r.processos.some((x) => x.id === p.id)).length;
  const linkProc = (id: string | null) => {
    const p = id ? porId.get(id) : null;
    return p ? <Link href={`/processos/${p.id}`}>{p.numero_formatado} →</Link> : null;
  };

  return (
    <>
      <section className="rel-hero">
        <div className="scan" />
        <span className="eyebrow">Relatório executivo · {fmtDataHora(r.gerado_em)}</span>
        <Manchete texto={r.manchete} />
        <p className="resumo entra" style={{ animationDelay: "500ms" }}>{r.resumo}</p>
        <div className="meta-linha entra" style={{ animationDelay: "700ms" }}>
          <Pill tone="accent">✦ {nomeModelo(r.modelo)}</Pill>
          <Pill>{r.total_processos} processos lidos</Pill>
          <Pill>{Math.round(r.duracao_ms / 1000)} s de análise</Pill>
          {desatualizado && <Pill tone="warn">mais de 7 dias — vale gerar de novo</Pill>}
          {novos > 0 && <Pill tone="warn">{novos} processo(s) novo(s) fora deste relatório</Pill>}
        </div>
        <div className="meta-linha nao-imprime" style={{ marginTop: 16 }}>{botao}<BotaoImprimir /></div>
      </section>

      <div className="grid2">
        <Revela><Card><div className="card-pad"><Termometro estado={r.termometro} motivo={r.termometro_motivo} /></div></Card></Revela>
        <Revela atraso={120}>
          <div className="stats" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))", marginBottom: 0, height: "100%" }}>
            <div className="stat"><div className="lbl">Pedem atenção</div><div className="val" style={{ color: emAtencao ? "var(--warn)" : undefined }}><Contador valor={emAtencao} /></div><div className="sub">de {r.processos.length} processos</div></div>
            <div className="stat"><div className="lbl">Prazos em 30 dias</div><div className="val"><Contador valor={em30} /></div><div className="sub">registrados no sistema</div></div>
            <div className="stat"><div className="lbl">Próximos passos</div><div className="val"><Contador valor={r.proximos_passos.length} /></div><div className="sub">{r.proximos_passos.filter((p) => p.urgencia === "agora").length} para agora</div></div>
          </div>
        </Revela>
      </div>

      <Revela><h2 style={{ fontSize: 20, margin: "8px 0 12px" }}>Destaques</h2></Revela>
      <div className="destaques">
        {r.destaques.map((d, i) => (
          <Revela key={i} atraso={i * 90}>
            <article className={`destaque ${d.tom}`} style={{ height: "100%" }}>
              <div className="tag">{TOM_TAG[d.tom]}</div>
              <h3>{d.titulo}</h3>
              <p>{d.texto}</p>
              {linkProc(d.processo_id)}
            </article>
          </Revela>
        ))}
      </div>

      <div className="grid2">
        <Revela>
          <Card title="Próximos passos" hint="do mais urgente ao menos urgente">
            <div className="card-b">
              <ol className="passos">
                {r.proximos_passos.map((p, i) => (
                  <li key={i}>
                    <div>
                      <div className="acao">{p.acao}</div>
                      <div className="det">
                        <Pill tone={URGENCIA[p.urgencia].tom}>{URGENCIA[p.urgencia].rotulo}</Pill>
                        {linkProc(p.processo_id)}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </Card>
        </Revela>
        <Revela atraso={120}>
          <Card title="Fases da carteira" hint="classificação da IA">
            <div className="card-pad">
              <Ranking itens={fasesUsadas.map((f) => ({ rotulo: FASE_ROTULO[f], valor: contFase.get(f)!, cor: FASE_COR[f] }))} />
              <p className="hint" style={{ marginTop: 12 }}>Do início (azul claro) ao encerramento (azul escuro). Cinza = sem dados suficientes para saber.</p>
            </div>
          </Card>
        </Revela>
      </div>

      <Revela>
        <Card title="Processo a processo" hint="agrupado por fase">
          <div className="card-pad fases-lista">
            {fasesUsadas.map((f) => (
              <div key={f} className="fase-grupo">
                <h3><i style={{ background: FASE_COR[f] }} />{FASE_ROTULO[f]} · {contFase.get(f)}</h3>
                <ul>
                  {r.processos.filter((x) => x.fase === f).sort((a, b) => Number(b.atencao) - Number(a.atencao)).map((x) => {
                    const p = porId.get(x.id);
                    return (
                      <li key={x.id}>
                        <div>
                          {p ? <Link href={`/processos/${x.id}`}>{p.numero_formatado}</Link> : <span className="mono">{x.id}</span>}
                          {p?.descricao && <div className="sub" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.descricao}</div>}
                        </div>
                        <div>{x.atencao && <span className="alvo-atencao">◆ atenção · </span>}{x.frase}</div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      </Revela>

      {r.limites.length > 0 && (
        <Revela>
          <div className="notice info">
            <b>O que este relatório não consegue ver:</b> {r.limites.join(" ")} É um apoio para a conversa com a advogada, não substitui a análise dela.
            <div className="hint" style={{ marginTop: 6 }}>Gerado por {r.gerado_por} em {fmtData(r.gerado_em)} com {nomeModelo(r.modelo)}.</div>
          </div>
        </Revela>
      )}
    </>
  );
}
