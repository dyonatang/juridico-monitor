"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { loginAction, pedirRecuperacaoAction, redefinirSenhaComLinkAction } from "@/app/auth-actions";
import { SubmitButton } from "./ui";
import { Icone } from "./icones";

/** Campo de senha com o "olhinho" para mostrar/esconder o que foi digitado. */
function CampoSenha({ rotulo, name, autoComplete, autoFocus }: { rotulo: string; name: string; autoComplete: string; autoFocus?: boolean }) {
  const [ver, setVer] = useState(false);
  return (
    <label className="field">
      {rotulo}
      <span className="senha-campo">
        <input name={name} type={ver ? "text" : "password"} autoComplete={autoComplete} required autoFocus={autoFocus} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        <button type="button" className="senha-olho" onClick={() => setVer((v) => !v)} aria-label={ver ? "Esconder a senha" : "Mostrar a senha"} aria-pressed={ver} title={ver ? "Esconder a senha" : "Mostrar a senha"}>
          <Icone nome={ver ? "olho-fechado" : "olho"} tamanho={18} />
        </button>
      </span>
    </label>
  );
}

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="login-form">
      <input type="hidden" name="next" value={next} />
      <label className="field">
        Usuário ou e-mail
        <input name="usuario" autoComplete="username" required autoFocus autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      </label>
      <CampoSenha rotulo="Senha" name="senha" autoComplete="current-password" />
      {state?.erro && <div className="msg-err" role="alert">{state.erro}</div>}
      <SubmitButton>Entrar</SubmitButton>
      <Link href="/login/esqueci" className="login-link">Esqueci minha senha</Link>
    </form>
  );
}

export function EsqueciForm() {
  const [state, action] = useActionState(pedirRecuperacaoAction, undefined);
  return (
    <form action={action} className="login-form">
      <label className="field">
        Usuário ou e-mail
        <input name="usuario" autoComplete="username" required autoFocus autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      </label>
      {state?.erro && <div className="msg-err" role="alert">{state.erro}</div>}
      {state?.ok && <div className="msg-ok" role="status">{state.ok}</div>}
      <SubmitButton>Enviar link por e-mail</SubmitButton>
      <Link href="/login" className="login-link">Voltar para o login</Link>
    </form>
  );
}

export function RedefinirForm({ u, oobCode }: { u: string; oobCode: string }) {
  const [state, action] = useActionState(redefinirSenhaComLinkAction, undefined);
  if (state?.ok) {
    return (
      <div className="login-form">
        <div className="msg-ok" role="status">{state.ok}</div>
        <Link href="/login" className="btn primary" style={{ textAlign: "center" }}>Ir para o login</Link>
      </div>
    );
  }
  return (
    <form action={action} className="login-form">
      <input type="hidden" name="u" value={u} />
      <input type="hidden" name="oobCode" value={oobCode} />
      <CampoSenha rotulo="Nova senha (mínimo 10 caracteres)" name="senha" autoComplete="new-password" autoFocus />
      <CampoSenha rotulo="Repita a nova senha" name="confirmar" autoComplete="new-password" />
      {state?.erro && <div className="msg-err" role="alert">{state.erro}</div>}
      <SubmitButton>Salvar nova senha</SubmitButton>
      <Link href="/login/esqueci" className="login-link">Pedir um novo link</Link>
    </form>
  );
}
