"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/actions";

const TERMO = {
  tranquilo: { rotulo: "Tranquilo", fracao: 0.33, cor: "var(--st-good)", icone: "●" },
  atencao: { rotulo: "Atenção", fracao: 0.66, cor: "var(--st-warn)", icone: "◆" },
  critico: { rotulo: "Crítico", fracao: 1, cor: "var(--st-crit)", icone: "▲" },
} as const;

/** Medidor em semicírculo: o preenchimento carrega a gravidade; ícone + rótulo, nunca só a cor. */
export function Termometro({ estado, motivo }: { estado: keyof typeof TERMO; motivo: string }) {
  const t = TERMO[estado];
  const comp = Math.PI * 62; // comprimento do arco (raio 62)
  const [off, setOff] = useState(comp);
  useEffect(() => { const id = requestAnimationFrame(() => setOff(comp * (1 - t.fracao))); return () => cancelAnimationFrame(id); }, [comp, t.fracao]);
  return (
    <div className="termometro">
      <svg viewBox="0 0 150 86" role="img" aria-label={`Termômetro: ${t.rotulo}`}>
        <path className="arco-fundo" d="M13,78 A62,62 0 0 1 137,78" />
        <path className="arco" d="M13,78 A62,62 0 0 1 137,78" stroke={t.cor} strokeDasharray={comp} strokeDashoffset={off} />
        <text x="75" y="74" textAnchor="middle" style={{ font: "600 12px var(--font-mono)", fill: "var(--ink-3)" }}>{Math.round(t.fracao * 100)}%</text>
      </svg>
      <div>
        <div className="hint" style={{ fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", fontSize: 10.5 }}>Termômetro da carteira</div>
        <div className="estado"><span aria-hidden="true" style={{ color: t.cor, marginRight: 6 }}>{t.icone}</span>{t.rotulo}</div>
        <p className="sub" style={{ marginTop: 4, lineHeight: 1.5 }}>{motivo}</p>
      </div>
    </div>
  );
}

function BotaoInterno({ rotulo, total, modelo }: { rotulo: string; total: number; modelo: string }) {
  const { pending } = useFormStatus();
  const [seg, setSeg] = useState(0);
  const t0 = useRef(0);
  useEffect(() => {
    if (!pending) { setSeg(0); return; }
    t0.current = Date.now();
    const id = setInterval(() => setSeg(Math.round((Date.now() - t0.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, [pending]);
  if (pending) {
    return (
      <div className="gerando" aria-live="polite">
        <span className="anel" />
        <span><b>{modelo} está lendo {total} processos…</b> <span className="hint">{seg}s · costuma levar de 1 a 3 minutos — pode deixar esta aba aberta.</span></span>
      </div>
    );
  }
  return <button type="submit" className="btn primary">{rotulo}</button>;
}

export function GerarRelatorio({ action, rotulo, total, modelo }: { action: (s: ActionState) => Promise<ActionState>; rotulo: string; total: number; modelo: string }) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="so-admin" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <BotaoInterno rotulo={rotulo} total={total} modelo={modelo} />
      {state?.erro && <span className="msg-err">{state.erro}</span>}
      {state?.ok && <span className="msg-ok">{state.ok}</span>}
    </form>
  );
}

export function BotaoImprimir() {
  return <button type="button" className="btn nao-imprime" onClick={() => window.print()}>Imprimir / salvar PDF</button>;
}
