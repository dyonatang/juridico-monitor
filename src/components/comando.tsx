"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icone } from "./icones";

export type ItemBusca = { href: string; titulo: string; detalhe: string; tipo: string; busca: string };

const PAGINAS: ItemBusca[] = [
  { href: "/", titulo: "Painel", detalhe: "Centro de comando", tipo: "tela", busca: "painel inicio dashboard" },
  { href: "/relatorio", titulo: "Relatório IA", detalhe: "Relatório executivo da carteira", tipo: "tela", busca: "relatorio executivo ia resumo fable" },
  { href: "/processos", titulo: "Processos", detalhe: "Lista completa", tipo: "tela", busca: "processos lista" },
  { href: "/importar", titulo: "Importar PDF", detalhe: "Ler um documento com a IA", tipo: "tela", busca: "importar pdf upload documento" },
  { href: "/documentos", titulo: "CPFs / CNPJs", detalhe: "Pessoas e empresas monitoradas", tipo: "tela", busca: "cpf cnpj empresas pessoas documentos" },
  { href: "/alertas", titulo: "Alertas", detalhe: "Novidades pendentes", tipo: "tela", busca: "alertas avisos novidades" },
];

const normal = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Botão do menu que abre a busca (o atalho Ctrl+K / ⌘K funciona em qualquer tela). */
export function BotaoBusca() {
  return (
    <button type="button" className="busca-btn" onClick={() => window.dispatchEvent(new Event("abrir-comando"))} aria-label="Buscar processo ou tela">
      <Icone nome="busca" tamanho={15} />
      <span className="rot">Buscar processo…</span>
      <kbd>Ctrl K</kbd>
    </button>
  );
}

export function PaletaComandos({ itens }: { itens: ItemBusca[] }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const entrada = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const abrir = () => { setAberto(true); setQ(""); setSel(0); };
    const tecla = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); abrir(); }
      if (e.key === "/" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); abrir(); }
    };
    window.addEventListener("abrir-comando", abrir);
    window.addEventListener("keydown", tecla);
    return () => { window.removeEventListener("abrir-comando", abrir); window.removeEventListener("keydown", tecla); };
  }, []);
  useEffect(() => { if (aberto) setTimeout(() => entrada.current?.focus(), 0); }, [aberto]);

  const resultados = useMemo(() => {
    const termo = normal(q.trim());
    const digitos = q.replace(/\D/g, "");
    const todos = [...PAGINAS, ...itens];
    if (!termo) return todos.slice(0, 12);
    return todos
      .map((it) => {
        const alvo = normal(`${it.titulo} ${it.detalhe} ${it.busca}`);
        let pontos = 0;
        if (digitos.length >= 3 && it.busca.includes(digitos)) pontos += 10;
        const palavras = termo.split(/\s+/);
        if (palavras.every((p) => alvo.includes(p))) pontos += 5 + (normal(it.titulo).startsWith(palavras[0]) ? 2 : 0);
        return { it, pontos };
      })
      .filter((r) => r.pontos > 0)
      .sort((a, b) => b.pontos - a.pontos)
      .slice(0, 30)
      .map((r) => r.it);
  }, [q, itens]);

  if (!aberto) return null;
  const ir = (it: ItemBusca | undefined) => { if (!it) return; setAberto(false); router.push(it.href); };
  return (
    <div className="cmd-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget) setAberto(false); }}>
      <div className="cmd" role="dialog" aria-modal="true" aria-label="Buscar">
        <input
          ref={entrada}
          value={q}
          placeholder="Número do processo, parte, descrição ou tela…"
          onChange={(e) => { setQ(e.target.value); setSel(0); }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setAberto(false);
            else if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, resultados.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
            else if (e.key === "Enter") ir(resultados[sel]);
          }}
          aria-controls="cmd-lista"
        />
        <ul id="cmd-lista" role="listbox">
          {resultados.length === 0 && <li aria-disabled="true"><span className="d">Nada encontrado.</span></li>}
          {resultados.map((it, i) => (
            <li key={it.href} role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={() => ir(it)}>
              <span className={it.tipo === "processo" ? "n" : ""}>{it.titulo}</span>
              <span className="tipo">{it.tipo}</span>
              <span className="d">{it.detalhe}</span>
            </li>
          ))}
        </ul>
        <div className="rodape"><span><kbd>↑</kbd> <kbd>↓</kbd> navegar</span><span><kbd>Enter</kbd> abrir</span><span><kbd>Esc</kbd> fechar</span></div>
      </div>
    </div>
  );
}
