"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ResultadoImportacao, StatusTarefa } from "@/lib/tarefas";

export type EstadoTarefa = {
  status: StatusTarefa;
  mensagem: string | null;
  resultado: ResultadoImportacao | null;
  /** Segundos desde que a tela começou a acompanhar. */
  segundos: number;
};

const INTERVALO_MS = 3000;

/**
 * Acompanha uma tarefa em segundo plano (lib/tarefas.ts) consultando /api/tarefas/[id] a cada
 * 3 s. Quando termina, atualiza a página para mostrar o que mudou. Sem id, devolve null.
 */
export function useTarefa(id: string | undefined): EstadoTarefa | null {
  const router = useRouter();
  const [estado, setEstado] = useState<EstadoTarefa | null>(null);
  const t0 = useRef(0);

  useEffect(() => {
    if (!id) { setEstado(null); return; }
    let vivo = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    t0.current = Date.now();
    setEstado({ status: "pendente", mensagem: null, resultado: null, segundos: 0 });
    let falhas = 0;

    const consultar = async () => {
      let fim = false;
      try {
        const r = await fetch(`/api/tarefas/${id}`, { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const j = await r.json();
        falhas = 0;
        if (!vivo) return;
        fim = j.status === "ok" || j.status === "erro";
        setEstado({ status: j.status, mensagem: j.mensagem, resultado: j.resultado, segundos: Math.round((Date.now() - t0.current) / 1000) });
        if (fim) router.refresh();
      } catch {
        // Oscilação de rede: tenta de novo; depois de várias falhas seguidas, desiste.
        if (++falhas >= 10 && vivo) {
          setEstado((e) => ({ status: "erro", mensagem: "Perdi o contato com o servidor. Recarregue a página para ver se terminou.", resultado: e?.resultado ?? null, segundos: e?.segundos ?? 0 }));
          fim = true;
        }
      }
      if (vivo && !fim) timer = setTimeout(consultar, INTERVALO_MS);
    };
    timer = setTimeout(consultar, 1500);
    return () => { vivo = false; if (timer) clearTimeout(timer); };
  }, [id, router]);

  // Relógio da tela enquanto roda (entre uma consulta e outra).
  useEffect(() => {
    if (!estado || estado.status === "ok" || estado.status === "erro") return;
    const i = setInterval(() => setEstado((e) => (e && (e.status === "pendente" || e.status === "rodando") ? { ...e, segundos: Math.round((Date.now() - t0.current) / 1000) } : e)), 1000);
    return () => clearInterval(i);
  }, [estado?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  return estado;
}

export const emAndamento = (e: EstadoTarefa | null) => !!e && (e.status === "pendente" || e.status === "rodando");

/** Linha de situação padrão: "rodando (12 s)…", ✓ ok, ⚠ erro. */
export function SituacaoTarefa({ estado, rodando }: { estado: EstadoTarefa | null; rodando: string }) {
  if (!estado) return null;
  if (emAndamento(estado)) return <span className="hint" aria-live="polite">{rodando} ({estado.segundos} s)</span>;
  if (estado.status === "ok") return <span className="msg-ok">✓ {estado.mensagem ?? "Pronto."}</span>;
  return <span className="msg-err">⚠ {estado.mensagem ?? "Não deu certo."}</span>;
}
