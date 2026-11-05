// Amounts are integer cents. Decimal inputs are parsed as strings, never via float multiplication.

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatBRL(cents: number): string {
  return brl.format(cents / 100);
}

/** Short axis tick without currency symbol (the chart title says it is BRL): "1,5 mil", "800". */
export function formatAxisBRL(cents: number): string {
  const reais = cents / 100;
  if (Math.abs(reais) >= 1000) return `${(reais / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return Math.round(reais).toLocaleString("pt-BR");
}

/** Converts a dot-decimal value ("-55.9", 1234.5) to signed cents, rounding half away from zero. */
export function decimalToCents(value: number | string): number {
  let text = typeof value === "number" ? String(value) : value.trim();
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Valor inválido");
    if (/e/i.test(text)) text = value.toFixed(2);
  }
  const match = /^([+-])?(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) throw new Error(`Valor inválido: ${text}`);
  const sign = match[1] === "-" ? -1 : 1;
  const whole = Number(match[2]);
  const frac = (match[3] ?? "").padEnd(3, "0");
  let cents = whole * 100 + Number(frac.slice(0, 2));
  if (Number(frac[2]) >= 5) cents += 1;
  if (!Number.isSafeInteger(cents)) throw new Error("Valor fora do limite");
  return sign * cents;
}

/**
 * Parses an amount typed by a person in Brazil: "R$ 1.234,56", "45,9", "45.90", "1.500", "2k", "3 mil".
 * Returns positive cents or null when the text is not an amount.
 */
export function parseBRL(input: string): number | null {
  let text = input.trim().toLowerCase().replace(/r\$\s*/g, "").replace(/\s+reais$/, "").trim();
  let multiplier = 1;
  const suffix = /^(.*?)\s*(k|mil)$/.exec(text);
  if (suffix) {
    text = suffix[1].trim();
    multiplier = 1000;
  }
  if (!/^\d[\d.,]*$/.test(text)) return null;

  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSep = lastComma > lastDot ? "," : ".";
    const thousandSep = decimalSep === "," ? "." : ",";
    normalized = text.split(thousandSep).join("").replace(decimalSep, ".");
  } else if (lastComma >= 0) {
    if (text.indexOf(",") !== lastComma) return null;
    normalized = text.replace(",", ".");
  } else if (lastDot >= 0) {
    const groups = text.split(".");
    const thousands = groups.length > 2 || groups[groups.length - 1].length === 3;
    normalized = thousands ? groups.join("") : text;
    if (!thousands && groups.length > 2) return null;
  } else {
    normalized = text;
  }

  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const cents = decimalToCents(normalized) * multiplier;
  return cents > 0 && Number.isSafeInteger(cents) ? cents : null;
}

/** Formats cents for an editable input: 123456 -> "1234,56". */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}
