"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/actions";
import { SubmitButton } from "./ui";

function Situacao({ state }: { state: ActionState }) {
  const { pending } = useFormStatus();
  if (pending) return <span className="hint">Consultando os tribunais — pode levar até 1 minuto…</span>;
  if (state?.ok) return <span className="msg-ok">✓ {state.ok}</span>;
  if (state?.erro) return <span className="msg-err">⚠ {state.erro}</span>;
  return null;
}

/** Botão "Sincronizar agora" que mostra o resultado da rodada quando termina. */
export function SyncButton({ action }: { action: (state: ActionState, fd: FormData) => Promise<ActionState> }) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="sync-btn">
      <SubmitButton tone="secondary">Sincronizar agora</SubmitButton>
      <Situacao state={state} />
    </form>
  );
}
