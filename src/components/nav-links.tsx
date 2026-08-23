"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links: [string, string][] = [
  ["/", "Painel"],
  ["/processos", "Processos"],
  ["/importar", "Importar PDF"],
  ["/documentos", "CPFs / CNPJs"],
  ["/alertas", "Alertas"],
];

export function NavLinks({ pendentes, admin }: { pendentes: number; admin?: boolean }) {
  const path = usePathname();
  const ativo = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const todos = admin ? [...links, ["/usuarios", "Usuários"] as [string, string], ["/auditoria", "Auditoria"] as [string, string]] : links;
  return (
    <nav className="nav" aria-label="Seções">
      {todos.map(([href, label]) => (
        <Link key={href} href={href} aria-current={ativo(href) ? "page" : undefined}>
          {label}
          {href === "/alertas" && pendentes > 0 && <span className="count">{pendentes}</span>}
        </Link>
      ))}
    </nav>
  );
}
