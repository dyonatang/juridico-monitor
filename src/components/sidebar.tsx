import Link from "next/link";
import * as store from "@/lib/store";
import { fmtDataHora } from "@/lib/format";
import { usuarioAtual } from "@/lib/usuarios";
import { logoutAction } from "@/app/auth-actions";
import { NavLinks } from "./nav-links";

export async function Sidebar() {
  let pendentes = 0;
  let log: Awaited<ReturnType<typeof store.ultimoSyncLog>> = null;
  try {
    [pendentes, log] = await Promise.all([store.contarAlertasNaoLidos(), store.ultimoSyncLog()]);
  } catch {
    // sem credenciais do Firebase ainda — a página principal mostra o erro
  }
  const usuario = await usuarioAtual().catch(() => null);

  return (
    <aside className="side">
      <Link href="/" className="brand">
        <div className="mark">§</div>
        <div>
          <b>Jurídico Monitor</b>
          <small>{process.env.APP_GRUPO || "Grupo"}</small>
        </div>
      </Link>
      <NavLinks pendentes={pendentes} admin={usuario?.papel === "admin"} />
      <div className="meta">
        <span className={`dot ${log?.erros ? "bad" : ""}`} />
        Última sincronização
        <br />
        {log ? `${fmtDataHora(log.iniciado_em)} · ${log.processos_verificados} processos · ${log.novas_movimentacoes} novas` : "nunca"}
        {usuario && (
          <div style={{ marginTop: 12 }}>
            <div style={{ color: "var(--nav-active)", fontWeight: 500 }}>{usuario.nome}</div>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em" }}>{usuario.papel === "admin" ? "administrador" : "leitura"}</div>
            <form action={logoutAction} style={{ marginTop: 6 }}>
              <button type="submit" className="btn sm" style={{ background: "transparent", color: "var(--nav-ink)", borderColor: "var(--nav-hover)" }}>
                Sair
              </button>
            </form>
          </div>
        )}
      </div>
    </aside>
  );
}
