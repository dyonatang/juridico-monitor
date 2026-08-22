import Link from "next/link";
import { cookies } from "next/headers";
import * as store from "@/lib/store";
import { fmtDataHora } from "@/lib/format";
import { COOKIE_SESSAO, validarSessao } from "@/lib/auth";
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
  const usuario = await validarSessao((await cookies()).get(COOKIE_SESSAO)?.value);

  return (
    <aside className="side">
      <Link href="/" className="brand">
        <div className="mark">§</div>
        <div>
          <b>Jurídico Monitor</b>
          <small>{process.env.APP_GRUPO || "Grupo"}</small>
        </div>
      </Link>
      <NavLinks pendentes={pendentes} />
      <div className="meta">
        <span className={`dot ${log?.erros ? "bad" : ""}`} />
        Última sincronização
        <br />
        {log ? `${fmtDataHora(log.iniciado_em)} · ${log.processos_verificados} processos · ${log.novas_movimentacoes} novas` : "nunca"}
        {usuario && (
          <form action={logoutAction} style={{ marginTop: 10 }}>
            <button type="submit" className="btn sm" style={{ background: "transparent", color: "var(--nav-ink)", borderColor: "var(--nav-hover)" }}>
              Sair ({usuario})
            </button>
          </form>
        )}
      </div>
    </aside>
  );
}
