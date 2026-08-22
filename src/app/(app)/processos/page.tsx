import Link from "next/link";
import * as store from "@/lib/store";
import { ActionForm, Card, Input, Select } from "@/components/ui";
import { ProcessosTable } from "@/components/processos-table";
import { criarProcessoAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function Processos({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  const [todos, empresas, docs] = await Promise.all([store.listarProcessos(), store.listarEmpresas(true), store.listarDocumentos(true)]);
  const nomeEmpresa = new Map(empresas.map((e) => [e.id, e.apelido || e.nome]));
  const nomeDoc = new Map(docs.map((d) => [d.id, d.nome]));
  const ativos = todos.filter((p) => p.ativo).length;
  const comErro = todos.filter((p) => p.ativo && p.ultimo_erro);
  const processos = erro ? comErro : todos;

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Processos</h1>
          <p>
            {ativos} ativos · {todos.length - ativos} pausados
            {erro ? " · mostrando só os com erro na consulta" : ""}
          </p>
        </div>
        {erro && (
          <Link href="/processos" className="btn">
            Ver todos
          </Link>
        )}
      </div>

      {!erro && (
        <Card title="Novo processo" hint="o tribunal é deduzido do número">
          <ActionForm action={criarProcessoAction} submitLabel="Cadastrar e consultar" hint="Consulta a fonte na hora e importa as movimentações.">
            <Input label="Número CNJ *" name="numero" mono required placeholder="0001234-56.2024.8.08.0024" />
            <Input label="Descrição / apelido" name="descricao" placeholder="ex.: Ação trabalhista João" />
            <Select label="Empresa" name="empresa_id" defaultValue="">
              <option value="">—</option>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.apelido || e.nome}
                </option>
              ))}
            </Select>
            <Select label="Parte monitorada" name="documento_id" defaultValue="">
              <option value="">—</option>
              {docs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nome} ({d.tipo})
                </option>
              ))}
            </Select>
          </ActionForm>
        </Card>
      )}

      <Card title={erro ? "Processos com erro" : "Cadastrados"} hint={String(processos.length)}>
        <ProcessosTable processos={processos} nomeEmpresa={(id) => nomeEmpresa.get(id)} nomeDocumento={(id) => nomeDoc.get(id)} />
      </Card>
    </>
  );
}
