import Link from "next/link";
import * as store from "@/lib/store";
import { fmtDataHora } from "@/lib/format";
import { Card, Pill, SubmitButton } from "@/components/ui";
import { ItemLink } from "@/components/row-link";
import { marcarLidoAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function Alertas({ searchParams }: { searchParams: Promise<{ todos?: string }> }) {
  const { todos } = await searchParams;
  const lista = await store.listarAlertas({ apenasNaoLidos: !todos, limite: 200 });
  const pendentes = todos ? lista.filter((a) => !a.lido).length : lista.length;

  return (
    <>
      <div className="topbar">
        <div><h1>Alertas</h1><p>{pendentes} pendente(s) · tudo que o sistema detectou e ainda não foi lido</p></div>
        <div className="actions-row">
          <Link href={todos ? "/alertas" : "/alertas?todos=1"} className="btn">{todos ? "Só pendentes" : "Ver histórico"}</Link>
          {pendentes > 0 && <form action={marcarLidoAction.bind(null, undefined)}><SubmitButton tone="secondary">Marcar todos como lidos</SubmitButton></form>}
        </div>
      </div>

      <Card>
        <div className="card-b">
          {lista.length === 0 && <p className="empty">Nenhum alerta.</p>}
          <ul className="feed">
            {lista.map((a) => {
              const cls = a.lido ? "lido" : a.tipo === "novo_processo" ? "novo" : a.tipo === "erro" ? "erro" : a.tipo === "documento_importado" ? "doc" : "";
              const linha = (
                <>
                  <span className="stripe" />
                  <div>
                    <Pill tone={a.lido ? "neutral" : a.tipo === "erro" ? "bad" : a.tipo === "novo_processo" ? "warn" : a.tipo === "documento_importado" ? "accent" : "ok"}>
                      {a.lido ? "lido" : a.tipo === "nova_movimentacao" ? "andamento" : a.tipo === "novo_processo" ? "processo novo" : a.tipo === "documento_importado" ? "documento" : "erro"}
                    </Pill>{" "}
                    {a.processo_id ? <Link href={`/processos/${a.processo_id}`} className="t link">{a.titulo}</Link> : <span className="t">{a.titulo}</span>}
                    <div className="m">{a.mensagem}</div>
                    <div className="when">{fmtDataHora(a.created_at)}{a.notificado_em && " · notificado"}</div>
                  </div>
                  {!a.lido ? <form action={marcarLidoAction.bind(null, a.id)}><SubmitButton tone="sm">✓ Lido</SubmitButton></form> : <span />}
                </>
              );
              return a.processo_id ? (
                <ItemLink key={a.id} href={`/processos/${a.processo_id}`} className={cls}>
                  {linha}
                </ItemLink>
              ) : (
                <li key={a.id} className={cls}>
                  {linha}
                </li>
              );
            })}
          </ul>
        </div>
      </Card>
    </>
  );
}
