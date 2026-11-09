import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";

/** Login 2.0: cartão com borda de luz girando, emblema com órbitas e entrada em cascata. Só CSS. */
export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="login-wrap">
      <div className="login-orbitas" aria-hidden="true"><i /><i /><i /></div>
      <div className="login-card">
        <div className="login-emblema" aria-hidden="true">
          <span className="anel a1" /><span className="anel a2" /><span className="satelite" />
          <div className="mark"><span>§</span></div>
        </div>
        <div className="login-titulo entra" style={{ animationDelay: "150ms" }}>
          <b>Jurídico Monitor</b> <span className="ver-login">2.0</span>
          <small>{process.env.APP_GRUPO || "Grupo"}</small>
        </div>
        <h1 className="entra" style={{ fontSize: 24, animationDelay: "260ms" }}>Entrar</h1>
        <p className="sub entra" style={{ marginBottom: 18, animationDelay: "340ms" }}>Acesso restrito à diretoria.</p>
        <div className="entra" style={{ animationDelay: "440ms" }}>
          <LoginForm next={next ?? "/"} />
        </div>
        <p className="login-rodape entra" style={{ animationDelay: "620ms" }}><span className="ia-dot" /> Monitoramento com Claude Fable 5.2</p>
      </div>
    </div>
  );
}
