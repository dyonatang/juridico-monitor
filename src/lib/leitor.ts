/**
 * Motor de leitura de PDFs jurídicos.
 *
 *  Camada 1 — texto local (pdf-parse): gratuita, instantânea. Acha números CNJ por regex.
 *  Camada 2 — Claude (Anthropic API): lê o PDF inteiro (inclusive digitalizado), identifica
 *             tipo da peça, partes, processo(s), resumo e prazos. Ativa com ANTHROPIC_API_KEY.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { somenteDigitos, validarCnj } from "./format";

export async function extrairTexto(bytes: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: bytes });
  try {
    const r = await parser.getText();
    return (r.text ?? "").replace(/\s+\n/g, "\n").trim();
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

/** Números CNJ válidos encontrados no texto (com ou sem pontuação). */
export function encontrarCnjs(texto: string): string[] {
  const achados = new Set<string>();
  for (const m of texto.matchAll(/\d{7}\s?-?\s?\d{2}\s?\.?\s?\d{4}\s?\.?\s?\d\s?\.?\s?\d{2}\s?\.?\s?\d{4}/g)) {
    const d = somenteDigitos(m[0]);
    if (d.length === 20 && validarCnj(d)) achados.add(d);
  }
  return [...achados];
}

export const AnaliseSchema = z.object({
  numeros_processo: z.array(z.string()).describe("Todos os números de processo no padrão CNJ (NNNNNNN-DD.AAAA.J.TR.OOOO) citados no documento"),
  tipo_documento: z.string().describe("Tipo da peça: petição inicial, contestação, citação, intimação, sentença, acórdão, decisão, mandado, contrato, notificação extrajudicial, etc."),
  orgao: z.string().nullable().describe("Vara, tribunal ou órgão emissor, se identificável"),
  partes: z.array(
    z.object({
      nome: z.string(),
      documento: z.string().nullable().describe("CPF ou CNPJ da parte, se aparecer no documento"),
      polo: z.enum(["ativo", "passivo", "outro"]),
    }),
  ),
  assunto: z.string().nullable().describe("Assunto/matéria em uma linha"),
  resumo: z.string().describe("Resumo objetivo em 3 a 5 linhas: o que é, o que pede/determina, contra quem"),
  datas_prazos: z.array(z.object({ data: z.string().describe("AAAA-MM-DD quando possível"), descricao: z.string() })).describe("Audiências, prazos e datas relevantes"),
  acao_recomendada: z.string().nullable().describe("O que a empresa precisa fazer e até quando, se o documento exigir alguma providência"),
});
export type Analise = z.infer<typeof AnaliseSchema>;

export const leitorIaDisponivel = () => Boolean(process.env.ANTHROPIC_API_KEY);

const INSTRUCOES = `Você é assistente jurídico de um grupo empresarial familiar do Espírito Santo (restaurante, incorporadora, investimentos).
Leia o documento PDF anexado (pode ser uma peça processual, ofício, citação, contrato ou documento digitalizado) e extraia os dados pedidos.
Regras:
- Números de processo: só no padrão CNJ (7 dígitos, hífen, 2 dígitos, ponto, ano, ponto, 1 dígito, ponto, 2 dígitos, ponto, 4 dígitos). Não invente; se não houver, retorne lista vazia.
- Partes: nomes como aparecem; CPF/CNPJ apenas se constar no documento.
- Resumo em português claro, para um empresário sem formação jurídica.
- Se houver prazo para resposta, defesa, pagamento ou comparecimento, destaque em acao_recomendada com a data.`;

/** Envia o PDF ao Claude e retorna a análise estruturada. */
export async function analisarComClaude(bytes: Buffer): Promise<Analise> {
  const client = new Anthropic({ timeout: 5 * 60 * 1000 });
  const response = await client.beta.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-opus-5",
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: INSTRUCOES,
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") } },
          { type: "text", text: "Extraia os dados deste documento conforme o formato." },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(AnaliseSchema) },
  });

  if (response.stop_reason === "refusal") throw new Error("A IA recusou analisar este documento.");
  const texto = response.content.find((b) => b.type === "text");
  if (!texto || texto.type !== "text") throw new Error("A IA não retornou conteúdo.");
  return AnaliseSchema.parse(JSON.parse(texto.text));
}
