"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links: [string, string][] = [
  ["/", "Painel"],
  ["/processos", "Processos"],
  ["/importar", "Importar PDF"],
  ["/documentos", "CPFs / CNPJs"],
  ["/empresas", "Empresas"],
  ["/alertas", "Alertas"],
];

export function NavLinks({ pendentes }: { pendentes: number }) {
  const path = usePathname();
  const ativo = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <nav className="nav" aria-label="Seções">
      {links.map(([href, label]) => (
        <Link key={href} href={href} aria-current={ativo(href) ? "page" : undefined}>
          {label}
          {href === "/alertas" && pendentes > 0 && <span className="count">{pendentes}</span>}
        </Link>
      ))}
    </nav>
  );
}
