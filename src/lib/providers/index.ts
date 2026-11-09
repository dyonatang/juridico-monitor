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

/**
 * Provedor usado para acompanhar um processo específico (por número CNJ).
 * Padrão: DataJud (gratuito), MESMO com provedor pago configurado — o pago serve para
 * DESCOBRIR processos novos por CPF/CNPJ; usá-lo também na atualização de hora em hora
 * cobraria cada consulta (e trocaria a consulta em lote por uma por processo).
 * Para acompanhar pelo provedor pago, defina PROVEDOR_ACOMPANHAMENTO=premium.
 */
export function provedorDeProcesso(): ProcessoProvider {
  if ((process.env.PROVEDOR_ACOMPANHAMENTO || "").toLowerCase() === "premium") return provedorPremium() ?? datajud;
  return datajud;
}
