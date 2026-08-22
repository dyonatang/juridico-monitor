"use client";

import { useRouter } from "next/navigation";

/** Linha de tabela clicável: navega ao clicar em qualquer célula, exceto em botões/links/forms internos. */
export function RowLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <tr
      className={`linha-clicavel ${className ?? ""}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a, button, input, form, select")) return;
        router.push(href);
      }}
    >
      {children}
    </tr>
  );
}

/** Item de lista (feed) clicável, mesma regra. */
export function ItemLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <li
      className={`clicavel ${className ?? ""}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a, button, input, form, select")) return;
        router.push(href);
      }}
    >
      {children}
    </li>
  );
}
