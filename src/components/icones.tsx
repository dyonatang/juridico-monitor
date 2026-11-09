/** Ícones de traço (24×24, stroke 1.8), desenhados para o menu. Sem dependência externa. */
const P: Record<string, React.ReactNode> = {
  painel: (<><rect x="3" y="3" width="7.5" height="9" rx="2" /><rect x="13.5" y="3" width="7.5" height="5.5" rx="2" /><rect x="13.5" y="11.5" width="7.5" height="9.5" rx="2" /><rect x="3" y="15" width="7.5" height="6" rx="2" /></>),
  processos: (<><path d="M12 3v18" /><path d="M5 7h14" /><path d="M5 7l-3 7a3.5 3.5 0 0 0 6 0L5 7z" /><path d="M19 7l-3 7a3.5 3.5 0 0 0 6 0l-3-7z" /><path d="M8 21h8" /></>),
  relatorio: (<><path d="M12 2.5l1.9 4.6 4.6 1.9-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.9z" /><path d="M18.5 14.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" /><path d="M5 16.5l.6 1.4 1.4.6-1.4.6L5 20.5l-.6-1.4-1.4-.6 1.4-.6z" /></>),
  importar: (<><path d="M12 15V3.5" /><path d="M7 8.5l5-5 5 5" /><path d="M4 14.5v3.5a2.5 2.5 0 0 0 2.5 2.5h11a2.5 2.5 0 0 0 2.5-2.5v-3.5" /></>),
  documentos: (<><rect x="3" y="5" width="18" height="14" rx="2.5" /><circle cx="9" cy="11" r="2.2" /><path d="M5.8 16c.6-1.6 1.8-2.4 3.2-2.4s2.6.8 3.2 2.4" /><path d="M14.5 10h4M14.5 13.5h3" /></>),
  alertas: (<><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>),
  usuarios: (<><circle cx="9" cy="8.5" r="3.2" /><path d="M3 19.5c.8-3 3.1-4.6 6-4.6s5.2 1.6 6 4.6" /><path d="M16 5.6a3 3 0 0 1 0 5.8M18 14.9c1.6.6 2.6 2 3 4.6" /></>),
  auditoria: (<><path d="M12 3l7.5 3v5.5c0 4.5-3.2 8.2-7.5 9.5-4.3-1.3-7.5-5-7.5-9.5V6z" /><path d="M8.8 12l2.2 2.2 4.4-4.4" /></>),
  busca: (<><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></>),
  sol: (<><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></>),
  lua: (<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />),
  copiar: (<><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>),
};

export function Icone({ nome, tamanho = 18 }: { nome: keyof typeof P | string; tamanho?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={tamanho} height={tamanho} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {P[nome] ?? null}
    </svg>
  );
}
