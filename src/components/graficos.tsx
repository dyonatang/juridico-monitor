"use client";

/**
 * Gráficos 2.0 — SVG/HTML puros, sem biblioteca. Seguem o método do dataviz:
 * marcas finas (coluna ≤ 24 px, ponta arredondada de 4 px, base reta), grade em linha fina,
 * rótulos seletivos (só o último e o maior), texto sempre em tinta de texto (nunca na cor da série),
 * dica ao passar o mouse e tabela de dados para quem não enxerga cor.
 */
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

const useIsoLayout = typeof window === "undefined" ? useEffect : useLayoutEffect;

function useLargura<T extends HTMLElement>(inicial: number) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(inicial);
  useIsoLayout(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setW(Math.max(160, Math.round(el.getBoundingClientRect().width)));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const fmtN = (n: number) => n.toLocaleString("pt-BR");
function tetoBonito(max: number) {
  if (max <= 4) return 4;
  const pot = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pot >= max) return m * pot;
  return 10 * pot;
}
/** Coluna com ponta de 4 px arredondada e base reta. */
function colunaPath(x: number, y: number, w: number, h: number) {
  if (h <= 0) return "";
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export type Ponto = { rotulo: string; valor: number; dica: string };

/** Colunas de uma série (ex.: andamentos por semana). */
export function Colunas({ dados, altura = 180, cor = "var(--s1)", rotuloCada = 4, unidade = "andamentos" }: { dados: Ponto[]; altura?: number; cor?: string; rotuloCada?: number; unidade?: string }) {
  const [ref, W] = useLargura<HTMLDivElement>(640);
  const [ativo, setAtivo] = useState<number | null>(null);
  const ml = 30, mr = 8, mt = 20, mb = 24;
  const n = Math.max(1, dados.length);
  const max = tetoBonito(Math.max(1, ...dados.map((d) => d.valor)));
  const ih = altura - mt - mb;
  const slot = (W - ml - mr) / n;
  const bw = Math.max(3, Math.min(24, slot * 0.62));
  const y = (v: number) => mt + ih - (v / max) * ih;
  const iMax = dados.reduce((im, d, i) => (d.valor > dados[im].valor ? i : im), 0);
  const ticks = [0, max / 2, max];
  return (
    <div className="grafico" ref={ref} onMouseLeave={() => setAtivo(null)}>
      <svg width={W} height={altura} role="img" aria-label={`Gráfico de colunas: ${unidade}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line className={t === 0 ? "base" : "grade"} x1={ml} x2={W - mr} y1={y(t)} y2={y(t)} />
            <text className="eixo" x={ml - 6} y={y(t) + 3.5} textAnchor="end">{fmtN(t)}</text>
          </g>
        ))}
        {dados.map((d, i) => {
          const cx = ml + slot * i + slot / 2;
          const h = (d.valor / max) * ih;
          const rotular = i === n - 1 || (i === iMax && d.valor > 0);
          return (
            <g key={i}>
              <rect className="alvo" x={ml + slot * i} y={mt} width={slot} height={ih} onMouseEnter={() => setAtivo(i)} onFocus={() => setAtivo(i)} />
              <path className={`coluna ${ativo === i ? "ativa" : ""}`} d={colunaPath(cx - bw / 2, y(d.valor), bw, h)} fill={i === n - 1 ? "var(--accent)" : cor} style={{ animationDelay: `${i * 22}ms`, pointerEvents: "none" }} />
              {rotular && d.valor > 0 && <text className="rotulo" x={cx} y={y(d.valor) - 6} textAnchor="middle">{fmtN(d.valor)}</text>}
              {(i % rotuloCada === 0 || i === n - 1) && <text className="eixo" x={cx} y={altura - 6} textAnchor="middle">{d.rotulo}</text>}
            </g>
          );
        })}
      </svg>
      {ativo != null && dados[ativo] && (
        <div className="dica" style={{ left: Math.min(Math.max(0, ml + slot * ativo + slot / 2 - 90), W - 190), top: Math.max(0, y(dados[ativo].valor) - 64) }}>
          <b>{fmtN(dados[ativo].valor)} {unidade}</b>
          <div className="s">{dados[ativo].dica}</div>
        </div>
      )}
    </div>
  );
}

/** Mapa de calor por dia (semanas em colunas, domingo no topo). Escala sequencial de um tom só. */
export function MapaCalor({ dias }: { dias: { data: string; valor: number }[] }) {
  const [ativo, setAtivo] = useState<{ i: number; x: number; y: number } | null>(null);
  const caixa = useRef<HTMLDivElement>(null);
  if (!dias.length) return null;
  const max = Math.max(1, ...dias.map((d) => d.valor));
  const nivel = (v: number) => (v <= 0 ? 0 : Math.min(5, Math.ceil((v / max) * 5)));
  const pad = new Date(`${dias[0].data}T12:00:00`).getDay();
  const fmt = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
  return (
    <div className="grafico" ref={caixa} onMouseLeave={() => setAtivo(null)}>
      <div className="calor" role="img" aria-label="Mapa de calor de andamentos por dia">
        {Array.from({ length: pad }, (_, i) => <span key={`p${i}`} style={{ visibility: "hidden" }} />)}
        {dias.map((d, i) => (
          <span
            key={d.data}
            style={{ background: `var(--q${nivel(d.valor)})`, animationDelay: `${Math.floor((i + pad) / 7) * 18}ms` }}
            onMouseEnter={(e) => {
              const r = (e.target as HTMLElement).getBoundingClientRect();
              const c = caixa.current!.getBoundingClientRect();
              setAtivo({ i, x: r.left - c.left, y: r.top - c.top });
            }}
          />
        ))}
      </div>
      <div className="calor-escala">
        <span style={{ marginRight: 2, width: "auto", background: "none" }}>menos</span>
        {[0, 1, 2, 3, 4, 5].map((q) => <span key={q} style={{ background: `var(--q${q})` }} />)}
        <span style={{ marginLeft: 2, width: "auto", background: "none" }}>mais</span>
      </div>
      {ativo && (
        <div className="dica" style={{ left: Math.max(0, Math.min(ativo.x - 80, (caixa.current?.clientWidth ?? 300) - 190)), top: ativo.y - 58 }}>
          <b>{dias[ativo.i].valor} andamento(s)</b>
          <div className="s" style={{ textTransform: "capitalize" }}>{fmt(dias[ativo.i].data)}</div>
        </div>
      )}
    </div>
  );
}

export type ItemRanking = { rotulo: string; valor: number; href?: string; cor?: string; detalhe?: string };

/** Barras horizontais ordenadas, valor na ponta. */
export function Ranking({ itens, cor = "var(--s1)", sufixo = "" }: { itens: ItemRanking[]; cor?: string; sufixo?: string }) {
  const max = Math.max(1, ...itens.map((i) => i.valor));
  return (
    <ul className="ranking">
      {itens.map((it, k) => {
        const corpo = (
          <>
            <span className="nome" title={it.detalhe ?? it.rotulo}>{it.cor && <i style={{ background: it.cor }} />}{it.rotulo}</span>
            <span className="valor">{fmtN(it.valor)}{sufixo}</span>
            <span className="trilho"><span className="barra" style={{ width: `${(it.valor / max) * 100}%`, background: it.cor ?? cor, animationDelay: `${k * 70}ms` }} /></span>
          </>
        );
        return <li key={it.rotulo}>{it.href ? <Link href={it.href} style={{ display: "contents" }}>{corpo}</Link> : corpo}</li>;
      })}
    </ul>
  );
}

export type Parte = { rotulo: string; valor: number; cor: string; icone?: string };

/** Uma barra dividida em partes (≤ 6), com legenda que traz valor e porcentagem. */
export function Segmentos({ partes, total: totalForcado }: { partes: Parte[]; total?: number }) {
  const total = totalForcado ?? partes.reduce((s, p) => s + p.valor, 0);
  const vis = partes.filter((p) => p.valor > 0);
  return (
    <div>
      <div className="segmentos" role="img" aria-label={partes.map((p) => `${p.rotulo}: ${p.valor}`).join("; ")}>
        {vis.map((p, i) => <span key={p.rotulo} title={`${p.rotulo}: ${fmtN(p.valor)}`} style={{ flex: p.valor, background: p.cor, animationDelay: `${i * 90}ms` }} />)}
        {vis.length === 0 && <span style={{ flex: 1, background: "var(--line)" }} />}
      </div>
      <ul className="legenda-lista">
        {partes.map((p) => (
          <li key={p.rotulo}>
            <i style={{ background: p.cor }} />
            {p.icone && <span aria-hidden="true">{p.icone}</span>}
            <span>{p.rotulo}</span>
            <span className="v">{fmtN(p.valor)}</span>
            <span className="p">{total ? `${Math.round((p.valor / total) * 100)}%` : "—"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Linha pequena de tendência: série em tom discreto, ponto atual no destaque. */
export function Sparkline({ valores, className = "spark" }: { valores: number[]; className?: string }) {
  if (valores.length < 2) return null;
  const w = 92, h = 30, p = 4;
  const max = Math.max(1, ...valores);
  const xs = (i: number) => p + (i / (valores.length - 1)) * (w - 2 * p);
  const ys = (v: number) => h - p - (v / max) * (h - 2 * p);
  const d = valores.map((v, i) => `${i ? "L" : "M"}${xs(i).toFixed(1)},${ys(v).toFixed(1)}`).join("");
  const ult = valores.length - 1;
  return (
    <svg className={className} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={`${d}L${xs(ult)},${h - p}L${xs(0)},${h - p}Z`} fill="var(--accent)" opacity="0.1" />
      <path d={d} fill="none" stroke="var(--ink-3)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={xs(ult)} cy={ys(valores[ult])} r="4" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
    </svg>
  );
}

/** Número que conta até o valor quando entra na tela (se já estava visível ao abrir, só aparece). */
export function Contador({ valor, formato = "numero" }: { valor: number; formato?: "numero" | "moeda" }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [v, setV] = useState(valor);
  useEffect(() => {
    const el = ref.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    if (r.top < innerHeight && r.bottom > 0) return; // já visível: sem salto
    setV(0);
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const passo = (t: number) => {
        const k = Math.min(1, (t - t0) / 1100);
        setV(valor * (1 - (1 - k) ** 3));
        if (k < 1) raf = requestAnimationFrame(passo);
      };
      raf = requestAnimationFrame(passo);
    });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [valor]);
  const txt = formato === "moeda"
    ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
    : Math.round(v).toLocaleString("pt-BR");
  return <span ref={ref}>{txt}</span>;
}

/** Revela o bloco ao rolar a página até ele. */
export function Revela({ children, atraso = 0, className = "" }: { children: React.ReactNode; atraso?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVis(true); io.disconnect(); } }, { rootMargin: "0px 0px -8% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={`revela ${vis ? "visivel" : ""} ${className}`} style={{ transitionDelay: `${atraso}ms` }}>{children}</div>;
}
