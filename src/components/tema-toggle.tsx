"use client";

import { useState } from "react";
import { Icone } from "./icones";

/** Troca escuro/claro na hora e grava a escolha num cookie (o servidor já renderiza no tema certo). */
export function TemaToggle({ inicial }: { inicial: "dark" | "light" }) {
  const [tema, setTema] = useState(inicial);
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
