import Link from "next/link";
import { cookies } from "next/headers";
import * as store from "@/lib/store";
import { fmtDataHora } from "@/lib/format";
import { usuarioAtual } from "@/lib/usuarios";
import { logoutAction } from "@/app/auth-actions";
import { NavLinks } from "./nav-links";
import { BotaoBusca } from "./comando";
import { TemaToggle } from "./tema-toggle";

export async function Sidebar() {
  const [contagens, usuario, jar] = await Promise.all([
    Promise.all([store.contarAlertasNaoLidos(), store.ultimoSyncLog()]).catch(() => null), // sem credenciais: a página mostra o erro
    usuarioAtual().catch(() => null),
    cookies(),
  ]);
  const [pendentes, log] = contagens ?? [0, null];
  const tema = jar.get("tema")?.value === "light" ? "light" : "dark";
  const iniciais = usuario?.nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";

  return (
    <aside className="side">
      <Link href="/" className="brand">
        <div className="mark"><span>§</span></div>
        <div>
          <b>Jurídico Monitor<span className="ver">2.0</span></b>
          <small>{process.env.APP_GRUPO || "Grupo"}</small>
        </div>
      </Link>
      <BotaoBusca />
      <NavLinks pendentes={pendentes} admin={usuario?.papel === "admin"} />
      <div className="meta">
        <span className={`dot ${log?.erros ? "bad" : ""}`} />
        Última sincronização
        <br />
        <span className="mono" style={{ fontSize: 11.5 }}>
          {log ? `${fmtDataHora(log.iniciado_em)} · ${log.processos_verificados} proc. · ${log.novas_movimentacoes} novas` : "nunca"}
        </span>
        <div className="usuario-linha">
          {usuario && <div className="avatar" aria-hidden="true">{iniciais}</div>}
          {usuario && (
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ color: "var(--nav-active)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{usuario.nome}</div>
              <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".08em" }}>{usuario.papel === "admin" ? "administrador" : "leitura"}</div>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          <TemaToggle inicial={tema} />
          {usuario && (
            <form action={logoutAction}>
              <button type="submit" className="btn-ghost">Sair</button>
            </form>
          )}
        </div>
      </div>
    </aside>
  );
}
