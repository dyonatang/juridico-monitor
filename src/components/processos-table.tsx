import Link from "next/link";
import { fmtDataHora } from "@/lib/format";
import { Pill } from "./ui";
import { RowLink } from "./row-link";
import type { Processo } from "@/lib/types";

/**
 * Tabela de processos reutilizada em /processos, /documentos/[id] e /empresas/[id].
 * Sempre ordenada por data (o chamador já traz a lista ordenada); a linha inteira é clicável.
 */
export function ProcessosTable({
  processos,
  nomeEmpresa,
  nomeDocumento,
  mostrarVinculo = true,
}: {
  processos: Processo[];
  nomeEmpresa?: (id: string) => string | undefined;
  nomeDocumento?: (id: string) => string | undefined;
  mostrarVinculo?: boolean;
}) {
  if (processos.length === 0) return <p className="empty">Nenhum processo aqui ainda.</p>;
  return (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            <th>Processo</th>
            <th>Tribunal</th>
            <th>Classe / assunto</th>
            {mostrarVinculo && <th>Vínculo</th>}
            <th>Última movimentação</th>
            <th className="right">Movs</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {processos.map((p) => (
            <RowLink key={p.id} href={`/processos/${p.id}`} className={p.ativo ? "" : "off"}>
              <td>
                <Link href={`/processos/${p.id}`} className="link mono">
                  {p.numero_formatado}
                </Link>
                <div className="sub">
                  {p.origem === "descoberto" && <Pill tone="warn">descoberto</Pill>} {p.descricao ?? (p.origem === "descoberto" ? "sem apelido" : "")}
                </div>
              </td>
              <td style={{ textTransform: "uppercase" }}>{p.tribunal ?? "—"}</td>
              <td style={{ maxWidth: 260 }}>
                <div>{p.classe ?? "—"}</div>
                <div className="sub">{p.assunto}</div>
              </td>
              {mostrarVinculo && <td>{(p.empresa_id && nomeEmpresa?.(p.empresa_id)) || (p.documento_id && nomeDocumento?.(p.documento_id)) || "—"}</td>}
              <td className="sub">{fmtDataHora(p.ultima_movimentacao_em)}</td>
              <td className="right">{p.total_movimentacoes ?? 0}</td>
              <td>
                {!p.ativo ? (
                  <Pill>pausado</Pill>
                ) : p.ultimo_erro ? (
                  <span title={p.ultimo_erro}>
                    <Pill tone="bad">erro</Pill>
                  </span>
                ) : (
                  <Pill tone="ok">ok</Pill>
                )}
              </td>
            </RowLink>
          ))}
        </tbody>
      </table>
    </div>
  );
}
