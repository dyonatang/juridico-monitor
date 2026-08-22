/** Utilitários de CPF, CNPJ e número CNJ. */

export const somenteDigitos = (s: string) => (s || "").replace(/\D/g, "");

export function formatarCpf(d: string) {
  d = somenteDigitos(d);
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}
export function formatarCnpj(d: string) {
  d = somenteDigitos(d);
  return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}
export function formatarDocumento(tipo: "CPF" | "CNPJ", d: string) {
  return tipo === "CPF" ? formatarCpf(d) : formatarCnpj(d);
}

export function validarCpf(cpf: string): boolean {
  cpf = somenteDigitos(cpf);
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  const calc = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += parseInt(cpf[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === parseInt(cpf[9]) && calc(10) === parseInt(cpf[10]);
}

export function validarCnpj(cnpj: string): boolean {
  cnpj = somenteDigitos(cnpj);
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
  const calc = (len: number) => {
    const pesos =
      len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let s = 0;
    for (let i = 0; i < len; i++) s += parseInt(cnpj[i]) * pesos[i];
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === parseInt(cnpj[12]) && calc(13) === parseInt(cnpj[13]);
}

/** Número CNJ: NNNNNNN-DD.AAAA.J.TR.OOOO (20 dígitos). */
export function formatarCnj(d: string) {
  d = somenteDigitos(d);
  if (d.length !== 20) return d;
  return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16, 20)}`;
}

/** Valida o dígito verificador (Resolução CNJ 65/2008, módulo 97 calculado por partes). */
export function validarCnj(n: string): boolean {
  const d = somenteDigitos(n);
  if (d.length !== 20) return false;
  const numero = d.slice(0, 7);
  const dv = d.slice(7, 9);
  const resto = d.slice(9); // AAAA J TR OOOO
  const mod97 = (s: string) => {
    let r = 0;
    for (const ch of s) r = (r * 10 + Number(ch)) % 97;
    return r;
  };
  const calc = mod97(numero + resto + "00");
  return String(98 - calc).padStart(2, "0") === dv;
}

const UF_TJ: Record<string, string> = {
  "01": "tjac", "02": "tjal", "03": "tjap", "04": "tjam", "05": "tjba", "06": "tjce", "07": "tjdft",
  "08": "tjes", "09": "tjgo", "10": "tjma", "11": "tjmt", "12": "tjms", "13": "tjmg", "14": "tjpa",
  "15": "tjpb", "16": "tjpr", "17": "tjpe", "18": "tjpi", "19": "tjrj", "20": "tjrn", "21": "tjrs",
  "22": "tjro", "23": "tjrr", "24": "tjsc", "25": "tjse", "26": "tjsp", "27": "tjto",
};

/** Deduz o alias DataJud (ex.: tjes, trt17, trf2) a partir do número CNJ. */
export function tribunalDoCnj(n: string): string | null {
  const d = somenteDigitos(n);
  if (d.length !== 20) return null;
  const j = d[13];
  const tr = d.slice(14, 16);
  switch (j) {
    case "1": return "stf";
    case "2": return "cnj";
    case "3": return "stj";
    case "4": return tr === "90" ? "cjf" : `trf${parseInt(tr)}`;
    case "5": return tr === "00" || tr === "90" ? "tst" : `trt${parseInt(tr)}`;
    case "6": return tr === "00" ? "tse" : `tre-${(UF_TJ[tr] ?? tr).replace("tj", "")}`;
    case "7": return "stm";
    case "8": return UF_TJ[tr] ?? null;
    case "9": return tr === "13" ? "tjmmg" : tr === "21" ? "tjmrs" : tr === "26" ? "tjmsp" : null;
    default: return null;
  }
}

export const fmtData = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";
export const fmtDataHora = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";
