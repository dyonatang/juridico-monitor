"use client";

/**
 * Órbita 3D dos processos — cada empresa/pessoa é um "núcleo"; seus processos giram em volta.
 * Canvas 2D com projeção em perspectiva feita à mão (sem biblioteca 3D).
 *  - tamanho do ponto = quantidade de andamentos (escala logarítmica)
 *  - anel pulsante = andamento nos últimos 7 dias; anel branco fixo = alerta não lido
 *  - cor = vínculo (ordem fixa de cores, com legenda)
 * Arraste para girar; passe o mouse para ver; clique para abrir o processo.
 * Com "reduzir movimento" ligado no sistema, a cena fica parada.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/** `cor` = nome da variável CSS da série (ex.: "--s1"), resolvida no navegador para o tema atual. */
export type NucleoOrbita = { id: string; nome: string; cor: string };
export type NoOrbita = { id: string; numero: string; descricao: string; nucleo: string; andamentos: number; recente: boolean; alerta: boolean; ultimo: string | null };

type V3 = { x: number; y: number; z: number };
type NoCena = NoOrbita & { raio: number; fase: number; incl: number; vel: number; tam: number };

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}
const rotY = (p: V3, a: number): V3 => ({ x: p.x * Math.cos(a) + p.z * Math.sin(a), y: p.y, z: -p.x * Math.sin(a) + p.z * Math.cos(a) });
const rotX = (p: V3, a: number): V3 => ({ x: p.x, y: p.y * Math.cos(a) - p.z * Math.sin(a), z: p.y * Math.sin(a) + p.z * Math.cos(a) });

export function Orbita({ nucleos, nos }: { nucleos: NucleoOrbita[]; nos: NoOrbita[] }) {
  const router = useRouter();
  const caixa = useRef<HTMLDivElement>(null);
  const tela = useRef<HTMLCanvasElement>(null);
  const [dica, setDica] = useState<{ no: NoOrbita; x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = tela.current!;
    const box = caixa.current!;
    const ctx = canvas.getContext("2d")!;
    const reduz = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let W = 0, H = 0, dpr = 1;
    const ajustar = () => {
      dpr = Math.min(2, devicePixelRatio || 1);
      W = box.clientWidth; H = box.clientHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
    };
    ajustar();
    const ro = new ResizeObserver(ajustar);
    ro.observe(box);

    // Núcleos num anel; com um só, fica no centro.
    const centro = new Map<string, V3>();
    nucleos.forEach((n, i) => {
      const a = (i / nucleos.length) * Math.PI * 2;
      const R = nucleos.length === 1 ? 0 : 1.05;
      centro.set(n.id, { x: Math.cos(a) * R, y: (i % 2 ? 0.12 : -0.12) * (nucleos.length > 2 ? 1 : 0), z: Math.sin(a) * R });
    });
    let corDe = new Map<string, string>();
    // Raio das órbitas cresce com o tamanho do grupo (30 processos não cabem no espaço de 3).
    const totalNucleo = new Map<string, number>();
    for (const no of nos) totalNucleo.set(no.nucleo, (totalNucleo.get(no.nucleo) ?? 0) + 1);
    const faixa = (id: string) => { const n = totalNucleo.get(id) ?? 1; return { base: 0.2, extra: Math.min(0.42, 0.07 * Math.sqrt(n)) }; };
    const porNucleo = new Map<string, number>();
    const cena: NoCena[] = nos.map((no) => {
      const k = porNucleo.get(no.nucleo) ?? 0;
      porNucleo.set(no.nucleo, k + 1);
      const h = hash(no.id);
      const { base, extra } = faixa(no.nucleo);
      const n = totalNucleo.get(no.nucleo) ?? 1;
      return { ...no, raio: base + extra * ((k + 0.5) / n) + (h - 0.5) * 0.03, fase: h * Math.PI * 2 + k * 2.4, incl: (hash(no.id + "i") - 0.5) * 1.3, vel: 0.12 + hash(no.id + "v") * 0.18, tam: 2.6 + Math.log2(1 + no.andamentos) * 0.95 };
    });
    // Poeira estelar fixa
    const estrelas: V3[] = Array.from({ length: 140 }, (_, i) => {
      const u = hash(`e${i}`) * 2 - 1, t = hash(`t${i}`) * Math.PI * 2, r = 2.2 + hash(`r${i}`) * 1.6;
      const s = Math.sqrt(1 - u * u);
      return { x: r * s * Math.cos(t), y: r * u, z: r * s * Math.sin(t) };
    });

    let yaw = 0.6, pitch = 0.42, arrastando = false, ultX = 0, ultY = 0, movido = 0;
    let tempo = 0, raf = 0, visivel = true, cores = { ink: "#e9effc", ink3: "#7387ab", linha: "#1b2a45" };
    let alvos: { no: NoCena; x: number; y: number; r: number }[] = [];
    let sobre: NoCena | null = null;
    const lerCores = () => {
      const cs = getComputedStyle(document.documentElement);
      cores = { ink: cs.getPropertyValue("--ink").trim(), ink3: cs.getPropertyValue("--ink-3").trim(), linha: cs.getPropertyValue("--line-strong").trim() };
      corDe = new Map(nucleos.map((n) => [n.id, cs.getPropertyValue(n.cor).trim() || "#3987e5"]));
    };
    lerCores();
    const mo = new MutationObserver(lerCores);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    const projetar = (p: V3) => {
      let q = rotY(p, yaw);
      q = rotX(q, pitch);
      const cam = 3.4;
      const esc = (Math.min(W, H * 1.5) * 0.72) / (cam - q.z);
      return { x: W / 2 + q.x * esc, y: H / 2 + 6 + q.y * esc, z: q.z, esc };
    };
    const posNo = (n: NoCena, t: number): V3 => {
      const c = centro.get(n.nucleo) ?? { x: 0, y: 0, z: 0 };
      const a = n.fase + t * n.vel;
      const local: V3 = { x: Math.cos(a) * n.raio, y: Math.sin(a) * n.raio * Math.sin(n.incl), z: Math.sin(a) * n.raio * Math.cos(n.incl) };
      return { x: c.x + local.x, y: c.y + local.y, z: c.z + local.z };
    };

    const desenhar = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      // estrelas
      for (const e of estrelas) {
        const p = projetar(e);
        const a = Math.max(0.08, Math.min(0.55, (p.z + 3) / 6));
        ctx.fillStyle = cores.ink3;
        ctx.globalAlpha = a;
        ctx.fillRect(p.x, p.y, 1.2, 1.2);
      }
      ctx.globalAlpha = 1;
      // anéis das órbitas
      for (const nu of nucleos) {
        const c = centro.get(nu.id)!;
        ctx.strokeStyle = corDe.get(nu.id)!;
        ctx.globalAlpha = 0.18;
        ctx.lineWidth = 1;
        const { base, extra } = faixa(nu.id);
        for (const r of [base + extra * 0.35, base + extra]) {
          ctx.beginPath();
          for (let i = 0; i <= 48; i++) {
            const a = (i / 48) * Math.PI * 2;
            const p = projetar({ x: c.x + Math.cos(a) * r, y: c.y, z: c.z + Math.sin(a) * r });
            if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
          }
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      // objetos ordenados por profundidade
      type Obj = { z: number; f: () => void };
      const objs: Obj[] = [];
      const novosAlvos: typeof alvos = [];
      for (const nu of nucleos) {
        const p = projetar(centro.get(nu.id)!);
        const corN = corDe.get(nu.id)!;
        objs.push({ z: p.z, f: () => {
          const r = 7 * (p.esc / 140);
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 5);
          g.addColorStop(0, corN); g.addColorStop(1, "transparent");
          ctx.globalAlpha = 0.35; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r * 5, 0, 7); ctx.fill();
          ctx.globalAlpha = 1; ctx.fillStyle = corN; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill();
          ctx.font = "600 11.5px Inter, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = cores.ink;
          ctx.globalAlpha = Math.max(0.55, Math.min(1, (p.z + 2) / 3));
          ctx.fillText(nu.nome.length > 26 ? `${nu.nome.slice(0, 25)}…` : nu.nome, p.x, p.y - r - 9);
          ctx.globalAlpha = 1;
        } });
      }
      for (const n of cena) {
        const c = projetar(centro.get(n.nucleo) ?? { x: 0, y: 0, z: 0 });
        const p = projetar(posNo(n, tempo));
        const cor = corDe.get(n.nucleo) ?? "#888";
        objs.push({ z: p.z, f: () => {
          const r = n.tam * (p.esc / 150);
          const prof = Math.max(0.35, Math.min(1, (p.z + 2.2) / 3));
          ctx.globalAlpha = 0.12 * prof; ctx.strokeStyle = cor; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(p.x, p.y); ctx.stroke();
          if (n.recente) {
            const k = reduz ? 0.5 : (tempo * 0.9 + n.fase) % 1;
            ctx.globalAlpha = (1 - k) * 0.7 * prof; ctx.strokeStyle = cor; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(p.x, p.y, r + 3 + k * 10, 0, 7); ctx.stroke();
          }
          ctx.globalAlpha = prof; ctx.fillStyle = cor;
          ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill();
          if (n.alerta) { ctx.strokeStyle = cores.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, r + 2.5, 0, 7); ctx.stroke(); }
          if (sobre?.id === n.id) { ctx.globalAlpha = 1; ctx.strokeStyle = cores.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, r + 6, 0, 7); ctx.stroke(); }
          ctx.globalAlpha = 1;
          novosAlvos.push({ no: n, x: p.x, y: p.y, r: Math.max(9, r + 5) });
        } });
      }
      objs.sort((a, b) => a.z - b.z).forEach((o) => o.f());
      alvos = novosAlvos.reverse(); // o da frente primeiro
    };

    let anterior = performance.now();
    const quadro = (agora: number) => {
      const dt = Math.min(0.05, (agora - anterior) / 1000);
      anterior = agora;
      if (!reduz && !arrastando) { tempo += dt; if (!sobre) yaw += dt * 0.08; }
      desenhar();
      if (visivel && !reduz) raf = requestAnimationFrame(quadro);
    };
    const io = new IntersectionObserver(([e]) => {
      visivel = e.isIntersecting;
      if (visivel && !reduz) { anterior = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(quadro); }
    });
    io.observe(box);
    if (reduz) desenhar();

    const acertar = (cx: number, cy: number) => alvos.find((a) => (a.x - cx) ** 2 + (a.y - cy) ** 2 <= a.r * a.r) ?? null;
    const local = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const down = (e: PointerEvent) => { arrastando = true; movido = 0; ultX = e.clientX; ultY = e.clientY; };
    const move = (e: PointerEvent) => {
      const { x, y } = local(e);
      if (arrastando && e.buttons) {
        const dx = e.clientX - ultX, dy = e.clientY - ultY;
        movido += Math.abs(dx) + Math.abs(dy);
        yaw += dx * 0.008; pitch = Math.max(-0.2, Math.min(1.1, pitch + dy * 0.006));
        ultX = e.clientX; ultY = e.clientY;
        if (reduz) desenhar();
        setDica(null);
        return;
      }
      const a = acertar(x, y);
      sobre = a?.no ?? null;
      canvas.style.cursor = a ? "pointer" : "grab";
      setDica(a ? { no: a.no, x: a.x, y: a.y } : null);
      if (reduz) desenhar();
    };
    const up = (e: PointerEvent) => {
      const foiClique = movido < 6;
      arrastando = false;
      if (!foiClique) return;
      const { x, y } = local(e);
      const a = acertar(x, y);
      if (a) router.push(`/processos/${a.no.id}`);
    };
    const sair = () => { sobre = null; setDica(null); arrastando = false; };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointerleave", sair);
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); mo.disconnect();
      canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up); canvas.removeEventListener("pointerleave", sair);
    };
  }, [nucleos, nos, router]);

  return (
    <div className="orbita" ref={caixa}>
      <div className="cabeca"><b>Órbita dos processos · 3D</b><span>arraste para girar · clique para abrir</span></div>
      <canvas ref={tela} role="img" aria-label={`Visualização 3D de ${nos.length} processos agrupados por vínculo. A lista completa está na tela Processos.`} />
      <div className="legenda">
        {nucleos.map((n) => <span key={n.id}><i style={{ background: `var(${n.cor})` }} />{n.nome}</span>)}
        <span><i className="anel" />alerta não lido</span>
      </div>
      {dica && (
        <div className="dica" style={{ left: Math.min(Math.max(8, dica.x + 14), (caixa.current?.clientWidth ?? 400) - 290), top: Math.max(8, dica.y - 30) }}>
          <b>{dica.no.numero}</b>
          <div className="s">{dica.no.descricao || "sem descrição"}</div>
          <div className="k">{dica.no.andamentos} andamento(s){dica.no.ultimo ? ` · último ${dica.no.ultimo}` : ""}{dica.no.alerta ? " · alerta não lido" : ""}</div>
        </div>
      )}
    </div>
  );
}
