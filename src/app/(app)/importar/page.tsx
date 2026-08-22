import Link from "next/link";
import * as store from "@/lib/store";
import { leitorIaDisponivel } from "@/lib/leitor";
import { formatarCnj, fmtDataHora } from "@/lib/format";
import { Card, Pill, SubmitButton } from "@/components/ui";
import { UploadForm } from "@/components/upload-form";
import { excluirArquivoAction } from "@/app/actions";

export const dynamic = "force-dynamic";

const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

export default async function Importar() {
  const [arquivos, empresas] = await Promise.all([store.listarArquivos(50), store.listarEmpresas(true)]);
  const nomeEmpresa = new Map(empresas.map((e) => [e.id, e.apelido || e.nome]));
  const ia = leitorIaDisponivel();

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Importar PDF</h1>
          <p>Suba citações, intimações, petições ou contratos. O sistema lê, acha o número do processo e cadastra.</p>
        </div>
      </div>

      {!ia && (
        <div className="notice">
          <b>Leitura por IA desativada.</b> Sem <code>ANTHROPIC_API_KEY</code> o sistema só extrai números de processo do texto do PDF (não lê documentos digitalizados nem faz resumo).
        </div>
      )}

      <Card title="Enviar documentos" hint="PDF · até 30 MB por envio">
        <UploadForm empresas={empresas.map((e) => ({ id: e.id, nome: e.apelido || e.nome }))} />
      </Card>

      <Card title="Importados" hint={String(arquivos.length)}>
        <div className="card-b">
          {arquivos.length === 0 && <p className="empty">Nenhum documento importado ainda.</p>}
          <ul className="feed">
            {arquivos.map((a) => (
              <li key={a.id} className={a.status === "sem_processo" ? "novo" : ""}>
                <span className="stripe" />
                <div>
                  <a href={`/api/arquivos/${a.id}`} target="_blank" rel="noopener" className="t link">{a.analise?.tipo_documento ?? a.nome}</a>
                  <span className="sub"> · {a.nome} · {kb(a.tamanho)}</span>
                  {a.analise?.resumo && <div className="m">{a.analise.resumo}</div>}
                  {a.analise?.acao_recomendada && <div className="m" style={{ color: "var(--accent)" }}>⚠️ {a.analise.acao_recomendada}</div>}
                  <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {a.processos.length === 0 && <Pill tone="warn">nenhum processo encontrado</Pill>}
                    {a.processos.map((n) => {
                      const r = a.resultado.find((x) => x.numero === n);
                      return (
                        <Link key={n} href={`/processos/${n}`} className="pill accent mono" style={{ textDecoration: "none" }}>
                          {formatarCnj(n)}{r?.criado ? " · novo" : ""}
                        </Link>
                      );
                    })}
                    {a.empresa_id && <Pill>{nomeEmpresa.get(a.empresa_id) ?? "empresa"}{a.vinculo ? ` (por ${a.vinculo})` : ""}</Pill>}
                  </div>
                  {a.avisos.length > 0 && <div className="sub" style={{ marginTop: 4, color: "var(--warn)" }}>{a.avisos.join(" ")}</div>}
                  <div className="when">{fmtDataHora(a.created_at)}</div>
                </div>
                <form action={excluirArquivoAction.bind(null, a.id)}>
                  <SubmitButton tone="sm-danger">Excluir</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </div>
      </Card>
    </>
  );
}
