import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="brand" style={{ padding: 0, marginBottom: 22 }}>
          <div className="mark">§</div>
          <div>
            <b style={{ color: "var(--ink)" }}>Jurídico Monitor</b>
            <small style={{ color: "var(--ink-3)" }}>{process.env.APP_GRUPO || "Grupo"}</small>
          </div>
        </div>
        <h1 style={{ fontSize: 24 }}>Entrar</h1>
        <p className="sub" style={{ marginBottom: 18 }}>Acesso restrito à diretoria.</p>
        <LoginForm next={next ?? "/"} />
      </div>
    </div>
  );
}
