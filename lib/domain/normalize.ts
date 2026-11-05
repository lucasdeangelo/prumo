export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Bank statement noise that says how money moved, not who received it.
const PREFIXES = [
  "compra no debito", "compra no credito", "compra cartao", "compra debito", "compra credito", "compra",
  "pagamento de boleto", "pagamento boleto", "pagamento", "pag boleto",
  "pix enviado", "pix recebido", "pix transf", "pix qrs", "pix",
  "transferencia enviada", "transferencia recebida", "transferencia", "ted", "doc",
  "debito automatico", "deb aut", "debito", "credito",
  "assinatura do", "assinatura da", "assinatura de", "assinatura", "plano do", "plano da", "plano",
  "pg", "pag", "mp", "ifd", "ec", "pp", "dl", "ebn", "htm", "pagseguro", "paypal", "ebanx",
];

const SUFFIXES = /\b(sao paulo|rio de janeiro|belo horizonte|curitiba|porto alegre|brasilia|osasco|barueri|br|bra|brasil|ltda|me|sa|s a|eireli|com|com br)\b/g;

/** Reduces a bank description to a stable merchant key: "COMPRA CARTAO NETFLIX.COM 12/10" -> "netflix". */
export function normalizeMerchant(description: string): string {
  let text = normalizeText(description)
    .replace(/\d{1,2}\/\d{1,2}(\/\d{2,4})?/g, " ")
    .replace(/parc(ela)?\s*\d+\s*(de|\/)?\s*\d*/g, " ")
    .replace(/[*_.\-/\\|#:]/g, " ")
    .replace(/\d+/g, " ")
    .replace(/[^a-z\s+]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of PREFIXES) {
      if (text === prefix) break;
      if (text.startsWith(`${prefix} `)) {
        text = text.slice(prefix.length + 1).trim();
        changed = true;
      }
    }
  }

  text = text.replace(SUFFIXES, " ").replace(/\s+/g, " ").trim();
  return text.split(" ").filter(Boolean).slice(0, 3).join(" ");
}

/** Readable merchant name from a key: "amazon prime" -> "Amazon Prime". */
export function titleCase(value: string): string {
  return value.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}
