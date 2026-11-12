/** Moldura das telas de acesso (login, esqueci a senha, nova senha): cartão com emblema e órbitas. Só CSS. */
export function LoginCasca({ titulo, sub, children }: { titulo: string; sub: string; children: React.ReactNode }) {
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
        <h1 className="entra" style={{ fontSize: 24, animationDelay: "260ms" }}>{titulo}</h1>
        <p className="sub entra" style={{ marginBottom: 18, animationDelay: "340ms" }}>{sub}</p>
        <div className="entra" style={{ animationDelay: "440ms" }}>{children}</div>
        <p className="login-rodape entra" style={{ animationDelay: "620ms" }}><span className="ia-dot" /> Monitoramento com Claude Fable 5.2</p>
      </div>
    </div>
  );
}
