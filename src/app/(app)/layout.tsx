import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { usuarioAtual } from "@/lib/usuarios";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const protegido = Boolean(process.env.DASHBOARD_USER && process.env.DASHBOARD_PASSWORD);
  const u = protegido ? await usuarioAtual().catch(() => null) : null;
  if (protegido && !u) redirect("/login");
  const papel = u?.papel ?? "admin";
  return (
    <div className="app">
      <Sidebar />
      {/* data-papel="leitura" esconde formulários e botões de alteração (o servidor também bloqueia) */}
      <main className="main" data-papel={papel}>
        {children}
      </main>
    </div>
  );
}
