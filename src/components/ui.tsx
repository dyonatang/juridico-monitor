"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/actions";

export function Card({ title, children, actions, hint }: { title?: string; children: React.ReactNode; actions?: React.ReactNode; hint?: string }) {
  return (
    <section className="card">
      {(title || actions) && (
        <div className="card-h">
          {title && <h2>{title}</h2>}
          {hint && <span className="hint">{hint}</span>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, tone, href }: { label: string; value: string | number; sub?: string; tone?: "alert" | "ok"; href?: string }) {
  const body = (
    <>
      <div className="lbl">{label}</div>
      <div className="val">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={`stat-link stat ${tone ?? ""}`}>
        {body}
      </Link>
    );
  }
  return <div className={`stat ${tone ?? ""}`}>{body}</div>;
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string; wide?: boolean; mono?: boolean }) {
  const { label, wide, mono, ...rest } = props;
  return (
    <label className={`field ${wide ? "wide" : ""}`}>
      {label}
      <input {...rest} className={mono ? "mono" : undefined} />
    </label>
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: React.ReactNode }) {
  const { label, children, ...rest } = props;
  return (
    <label className="field">
      {label}
      <select {...rest}>{children}</select>
    </label>
  );
}

export function SubmitButton({ children, tone = "primary" }: { children: React.ReactNode; tone?: "primary" | "secondary" | "danger" | "sm" | "sm-danger" }) {
  const { pending } = useFormStatus();
  const cls = { primary: "btn primary", secondary: "btn", danger: "btn danger", sm: "btn sm", "sm-danger": "btn sm danger" }[tone];
  return (
    <button type="submit" disabled={pending} className={cls}>
      {pending ? "Aguarde…" : children}
    </button>
  );
}

/** Formulário ligado a uma server action com estado (erro/ok). */
export function ActionForm({
  action,
  children,
  submitLabel,
  hint,
}: {
  action: (state: ActionState, fd: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  submitLabel: string;
  hint?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="form">
      {children}
      <div className="actions">
        <SubmitButton>{submitLabel}</SubmitButton>
        {state?.erro ? <span className="msg-err">{state.erro}</span> : state?.ok ? <span className="msg-ok">{state.ok}</span> : hint && <span className="hint">{hint}</span>}
      </div>
    </form>
  );
}

export function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "ok" | "warn" | "bad" | "accent" }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="back-link">
      ← {children}
    </Link>
  );
}
