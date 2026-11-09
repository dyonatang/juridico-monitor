"use client";

import { useState } from "react";

/** Botão que copia um texto (ex.: a mensagem pronta para o Balcão Virtual). */
export function CopiarTexto({ texto, rotulo = "Copiar mensagem" }: { texto: string; rotulo?: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      className="btn sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2000);
        } catch {
          // navegador sem permissão de área de transferência: o texto continua visível para copiar à mão
        }
      }}
    >
      {copiado ? "Copiado ✓" : rotulo}
    </button>
  );
}
