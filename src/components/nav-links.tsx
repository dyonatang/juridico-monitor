"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icone } from "./icones";

type Item = { href: string; rotulo: string; icone: string; novo?: boolean };
const links: Item[] = [
  { href: "/", rotulo: "Painel", icone: "painel" },
  { href: "/relatorio", rotulo: "Relatório IA", icone: "relatorio", novo: true },
  { href: "/processos", rotulo: "Processos", icone: "processos" },
  { href: "/importar", rotulo: "Importar PDF", icone: "importar" },
  { href: "/documentos", rotulo: "CPFs / CNPJs", icone: "documentos" },
  { href: "/alertas", rotulo: "Alertas", icone: "alertas" },
];
const deAdmin: Item[] = [
  { href: "/usuarios", rotulo: "Usuários", icone: "usuarios" },
  { href: "/auditoria", rotulo: "Auditoria", icone: "auditoria" },
];

export function NavLinks({ pendentes, admin }: { pendentes: number; admin?: boolean }) {
  const path = usePathname();
  const ativo = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const todos = admin ? [...links, ...deAdmin] : links;
  return (
    <nav className="nav" aria-label="Seções">
      {todos.map((l) => (
        <Link key={l.href} href={l.href} aria-current={ativo(l.href) ? "page" : undefined} title={l.rotulo}>
          <Icone nome={l.icone} />
          <span className="rot">{l.rotulo}</span>
          {l.href === "/alertas" && pendentes > 0 && <span className="count">{pendentes}</span>}
          {l.novo && <span className="novo-tag rot">novo</span>}
        </Link>
      ))}
    </nav>
  );
}
