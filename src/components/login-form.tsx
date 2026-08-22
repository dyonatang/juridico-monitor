"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/auth-actions";
import { SubmitButton } from "./ui";

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="login-form">
      <input type="hidden" name="next" value={next} />
      <label className="field">
        Usuário
        <input name="usuario" autoComplete="username" required autoFocus />
      </label>
      <label className="field">
        Senha
        <input name="senha" type="password" autoComplete="current-password" required />
      </label>
      {state?.erro && <div className="msg-err" role="alert">{state.erro}</div>}
      <SubmitButton>Entrar</SubmitButton>
    </form>
  );
}
