import { DataJudProvider } from "./datajud";
import { JuditProvider } from "./judit";
import { EscavadorProvider } from "./escavador";
import type { ProcessoProvider } from "./types";

export type { ProcessoProvider, ProcessoRemoto, MovimentacaoRemota } from "./types";

export const datajud = new DataJudProvider();

/**
 * Provedor "premium" (busca/monitoramento por CPF/CNPJ).
 * Escolhido por MONITOR_PROVIDER=judit|escavador; null se nenhum configurado.
 */
export function provedorPremium(): ProcessoProvider | null {
  const escolha = (process.env.MONITOR_PROVIDER || "").toLowerCase();
  try {
    if (escolha === "judit" || (!escolha && process.env.JUDIT_API_KEY)) return new JuditProvider();
    if (escolha === "escavador" || (!escolha && process.env.ESCAVADOR_TOKEN)) return new EscavadorProvider();
  } catch {
    return null;
  }
  return null;
}

/** Provedor usado para acompanhar um processo específico (por número CNJ). */
export function provedorDeProcesso(): ProcessoProvider {
  return provedorPremium() ?? datajud;
}
