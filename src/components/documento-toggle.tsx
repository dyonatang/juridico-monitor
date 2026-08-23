"use client";

import { useState } from "react";

/** Mostra o CPF/CNPJ mascarado por padrão, com um botão pra revelar o número completo. */
export function DocumentoToggle({ mascarado, completo }: { mascarado: string; completo: string }) {
  const [revelado, setRevelado] = useState(false);
  return (
    <span className="mono doc-toggle">
      {revelado ? completo : mascarado}{" "}
      <button
        type="button"
        onClick={() => setRevelado((r) => !r)}
        className="doc-toggle-btn"
        aria-label={revelado ? "Ocultar número completo" : "Mostrar número completo"}
      >
        {revelado ? "ocultar" : "mostrar"}
      </button>
    </span>
  );
}
