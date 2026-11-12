"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/actions";
import { SubmitButton } from "./ui";
import { emAndamento, SituacaoTarefa, useTarefa, type EstadoTarefa } from "./tarefa";

function Situacao({ state, tarefa }: { state: ActionState; tarefa: EstadoTarefa | null }) {
  const { pending } = useFormStatus();
  if (pending) return <span className="hint">Iniciando a consulta…</span>;
  if (tarefa) return <SituacaoTarefa estado={tarefa} rodando="Consultando os tribunais aos poucos, um lote de cada vez — pode levar alguns minutos; pode continuar usando o sistema" />;
  if (state?.ok) return <span className="msg-ok">✓ {state.ok}</span>;
  if (state?.erro) return <span className="msg-err">⚠ {state.erro}</span>;
  return null;
}

/** Botão "Sincronizar agora": a consulta roda em segundo plano e o resultado aparece aqui no fim. */
export function SyncButton({ action }: { action: (state: ActionState, fd: FormData) => Promise<ActionState> }) {
  const [state, formAction] = useActionState(action, undefined);
  const tarefa = useTarefa(state?.tarefa);
  return (
    <form action={formAction} className="sync-btn">
      {emAndamento(tarefa) ? <button type="button" className="btn" disabled>Consultando…</button> : <SubmitButton tone="secondary">Sincronizar agora</SubmitButton>}
      <Situacao state={state} tarefa={tarefa} />
    </form>
  );
}
