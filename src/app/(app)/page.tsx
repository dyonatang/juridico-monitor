import Link from "next/link";
import * as store from "@/lib/store";
import { fmtDataHora } from "@/lib/format";
import { Card, Stat, Pill, SubmitButton } from "@/components/ui";
import { marcarLidoAction, sincronizarTudoAction } from "@/app/actions";

export const dynamic = "force-dynamic";

const hoje = () => new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });

export default async function Painel() {
  let dados;
  try {
    dados = await Promise.all([
      store.listarProcessos({ apenasAtivos: true }),
      store.listarDocumentos(true),
      store.listarAlertas({ apenasNaoLidos: true }),
      store.movimentacoesRecentes(new Date(Date.now() - 7 * 86400000).toISOString(), 10),
      store.listarEmpresas(),
    ]);
  } catch (e) {
    return (
      <div className="notice bad">
        <b>Não foi possível conectar ao Firebase.</b> Configure <code>FIREBASE_SERVICE_ACCOUNT</code> (ou as credenciais automáticas do App Hosting). Detalhe: {e instanceof Error ? e.message : String(e)}
      </div>
    );
  }
  const [processos, docs, alertas, movs, empresas] = dados;
  const nomeEmpresa = new Map(empresas.map((e) => [e.id, e.apelido || e.nome]));
  const porId = new Map(processos.map((p) => [p.id, p]));
  const comErro = processos.filter((p) => p.ultimo_erro);
  const novosProc = alertas.filter((a) => a.tipo === "novo_processo").length;

  // agrupamento por empresa (+ "Família" para documentos sem empresa)
  const grupos = new Map<string, { nome: string; sub: string; ativos: number; alertas: number; ultimo: string | null }>();
  for (const e of empresas) grupos.set(e.id, { nome: e.apelido || e.nome, sub: e.apelido ? e.nome : "", ativos: 0, alertas: 0, ultimo: null });
  grupos.set("_fam", { nome: "Família / sem empresa", sub: `${docs.filter((d) => !d.empresa_id).length} CPF(s) monitorado(s)`, ativos: 0, alertas: 0, ultimo: null });
  for (const p of processos) {
    const g = grupos.get(p.empresa_id ?? "_fam") ?? grupos.get("_fam")!;
    g.ativos++;
  }
  for (const a of alertas) {
    const p = a.processo_id ? porId.get(a.processo_id) : null;
    const g = grupos.get(p?.empresa_id ?? "_fam") ?? grupos.get("_fam")!;
    g.alertas++;
  }
  for (const m of movs) {
    const p = porId.get(m.processo_id);
    const g = grupos.get(p?.empresa_id ?? "_fam") ?? grupos.get("_fam")!;
    if (!g.ultimo) g.ultimo = `${fmtDataHora(m.data_hora).slice(0, 5)} — ${m.descricao}`;
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Painel</h1>
          <p style={{ textTransform: "capitalize" }}>{hoje()}</p>
        </div>
        <form action={sincronizarTudoAction}>
          <SubmitButton tone="secondary">Sincronizar agora</SubmitButton>
        </form>
      </div>

      <div className="stats">
        <Stat label="Processos ativos" value={processos.length} sub={`${processos.filter((p) => p.origem === "descoberto").length} descobertos automaticamente`} />
        <Stat label="CPFs / CNPJs monitorados" value={docs.length} sub={`${docs.filter((d) => d.tipo === "CNPJ").length} empresas · ${docs.filter((d) => d.tipo === "CPF").length} pessoas`} />
        <Stat label="Alertas pendentes" value={alertas.length} tone={alertas.length ? "alert" : "ok"} sub={`${novosProc} processo(s) novo(s) · ${alertas.length - novosProc} andamento(s)`} />
        <Stat label="Com erro na consulta" value={comErro.length} tone={comErro.length ? "alert" : "ok"} sub={comErro.length ? "veja abaixo" : "todas as fontes responderam"} />
      </div>

      <div className="grid2">
        <Card
          title="Alertas pendentes"
          actions={
            alertas.length ? (
              <form action={marcarLidoAction.bind(null, undefined)}>
                <SubmitButton tone="sm">Marcar todos como lidos</SubmitButton>
              </form>
            ) : null
          }
        >
          <div className="card-b">
            {alertas.length === 0 && <p className="empty">Nenhum alerta pendente.</p>}
            <ul className="feed">
              {alertas.slice(0, 10).map((a) => (
                <li key={a.id} className={a.tipo === "novo_processo" ? "novo" : a.tipo === "erro" ? "erro" : a.tipo === "documento_importado" ? "doc" : ""}>
                  <span className="stripe" />
                  <div>
                    <Pill tone={a.tipo === "erro" ? "bad" : a.tipo === "novo_processo" ? "warn" : a.tipo === "documento_importado" ? "accent" : "ok"}>{a.tipo === "nova_movimentacao" ? "andamento" : a.tipo === "novo_processo" ? "processo novo" : a.tipo === "documento_importado" ? "documento" : "erro"}</Pill>{" "}
                    {a.processo_id ? (
                      <Link href={`/processos/${a.processo_id}`} className="t link">{a.titulo}</Link>
                    ) : (
                      <span className="t">{a.titulo}</span>
                    )}
                    <div className="m">{a.mensagem}</div>
                    <div className="when">{fmtDataHora(a.created_at)}</div>
                  </div>
                  <form action={marcarLidoAction.bind(null, a.id)}>
                    <SubmitButton tone="sm">✓</SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
            {alertas.length > 10 && (
              <Link href="/alertas" className="hint" style={{ textDecoration: "underline" }}>
                Ver todos os {alertas.length}
              </Link>
            )}
          </div>
        </Card>

        <Card title="Últimas movimentações" hint="7 dias">
          <div className="card-b">
            {movs.length === 0 && <p className="empty">Nenhuma movimentação nos últimos 7 dias.</p>}
            <ul className="feed">
              {movs.map((m) => {
                const p = porId.get(m.processo_id);
                return (
                  <li key={m.id}>
                    <span className="stripe" style={{ background: "var(--line-strong)" }} />
                    <div>
                      <Link href={`/processos/${m.processo_id}`} className="t link mono">{p?.numero_formatado ?? m.processo_id}</Link>
                      {p?.descricao && <span className="sub"> · {p.descricao}</span>}
                      <div className="m">{m.descricao}{m.complemento && <span className="hint"> — {m.complemento}</span>}</div>
                      <div className="when">{fmtDataHora(m.data_hora)}</div>
                    </div>
                    <span />
                  </li>
                );
              })}
            </ul>
          </div>
        </Card>
      </div>

      <Card title="Processos por empresa" actions={<Link href="/processos" className="btn sm">Ver todos</Link>}>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Empresa</th><th className="right">Ativos</th><th>Último andamento (7 dias)</th><th>Pendente</th></tr></thead>
            <tbody>
              {[...grupos.values()].filter((g) => g.ativos || g.alertas || g.sub).map((g) => (
                <tr key={g.nome}>
                  <td><b>{g.nome}</b>{g.sub && <div className="sub">{g.sub}</div>}</td>
                  <td className="right">{g.ativos}</td>
                  <td>{g.ultimo ?? <span className="hint">—</span>}</td>
                  <td>{g.alertas ? <Pill tone="accent">{g.alertas} alerta(s)</Pill> : <Pill>em dia</Pill>}</td>
                </tr>
              ))}
              {grupos.size === 0 && <tr><td colSpan={4} className="empty">Cadastre uma empresa para começar.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {comErro.length > 0 && (
        <Card title="Processos com erro na última consulta">
          <div className="card-b">
            <ul className="feed">
              {comErro.map((p) => (
                <li key={p.id} className="erro">
                  <span className="stripe" />
                  <div>
                    <Link href={`/processos/${p.id}`} className="t link mono">{p.numero_formatado}</Link>
                    <div className="m">{p.ultimo_erro}</div>
                  </div>
                  <span />
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}
      {nomeEmpresa.size === 0 && processos.length === 0 && (
        <div className="notice">
          <b>Começando do zero?</b> Cadastre as <Link href="/empresas">empresas</Link>, depois os <Link href="/documentos">CPFs/CNPJs</Link> e os <Link href="/processos">processos</Link>.
        </div>
      )}
    </>
  );
}
