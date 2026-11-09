import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { PaletaComandos, type ItemBusca } from "@/components/comando";
import * as store from "@/lib/store";
import { usuarioAtual } from "@/lib/usuarios";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const protegido = Boolean(process.env.DASHBOARD_USER && process.env.DASHBOARD_PASSWORD);
  const [u, processos] = await Promise.all([
    protegido ? usuarioAtual().catch(() => null) : Promise.resolve(null),
    store.listarProcessos().catch(() => []), // mesma lista (memória de 30 s) que as telas já leem
  ]);
  if (protegido && !u) redirect("/login");
  const papel = u?.papel ?? "admin";
  const itens: ItemBusca[] = processos.map((p) => ({
    href: `/processos/${p.id}`,
    titulo: p.numero_formatado,
    detalhe: [p.descricao, p.classe, p.ativo ? null : "pausado"].filter(Boolean).join(" · ") || "sem descrição",
    tipo: "processo",
    busca: [p.id, p.numero_formatado, p.descricao, p.polo_ativo, p.polo_passivo, p.classe, p.assunto, p.orgao_julgador].filter(Boolean).join(" "),
  }));
  return (
    <div className="app">
      <Sidebar />
      {/* data-papel="leitura" esconde formulários e botões de alteração (o servidor também bloqueia) */}
      <main className="main" data-papel={papel}>
        {children}
      </main>
      <PaletaComandos itens={itens} />
    </div>
  );
}
