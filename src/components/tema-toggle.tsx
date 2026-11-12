"use client";

import { useEffect, useState } from "react";
import { Icone } from "./icones";

/** Troca escuro/claro na hora e grava a escolha num cookie (o servidor já renderiza no tema certo). */
export function TemaToggle({ inicial }: { inicial: "dark" | "light" }) {
  const [tema, setTema] = useState(inicial);
  // O servidor nem sempre recebe o cookie (endereço .web.app): confia no tema já aplicado na página.
  useEffect(() => {
    const atual = document.documentElement.dataset.theme;
    if (atual === "light" || atual === "dark") setTema(atual);
  }, []);
  const trocar = () => {
    const novo = tema === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = novo;
    document.cookie = `tema=${novo}; path=/; max-age=31536000; samesite=lax`;
    setTema(novo);
  };
  return (
    <button type="button" className="btn-ghost" onClick={trocar} title={tema === "dark" ? "Mudar para o tema claro" : "Mudar para o tema escuro"} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <Icone nome={tema === "dark" ? "sol" : "lua"} tamanho={14} />
      {tema === "dark" ? "Claro" : "Escuro"}
    </button>
  );
}
