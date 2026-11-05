import { z } from "zod";

import { addDays, addMonths, isIsoDate } from "./dates";
import { decimalToCents, parseBRL } from "./money";
import { normalizeText } from "./normalize";

export type TransactionDraft = {
  type: "credit" | "debit";
  amountCents: number;
  description: string;
  date: string;
  tagHint: string | null;
};

export type QueryKind = "summary" | "upcoming" | "balance" | "subscriptions" | "recent";

export type Intent =
  | { kind: "help" }
  | { kind: "link"; code: string }
  | { kind: "query"; query: QueryKind }
  | { kind: "transaction"; draft: TransactionDraft }
  | { kind: "needs_ai" }
  | { kind: "unknown" };

const DEBIT_VERBS = ["gastei", "paguei", "comprei", "gasto", "despesa", "saida", "debito", "pago", "pagamento", "-"];
const CREDIT_VERBS = ["recebi", "ganhei", "entrou", "entrada", "receita", "credito", "deposito", "+"];
const CONNECTORS = /^(?:(?:no|na|nos|nas|em|com|de|do|da|pra|para|pro|pelo|pela|o|a|um|uma)\s+)+/;
const AMOUNT = /(?:r\$\s*)?(\d[\d.,]*(?:\s*(?:k|mil))?)(?:\s*reais)?/;

const QUERIES: Array<{ query: QueryKind; words: string[] }> = [
  { query: "balance", words: ["saldo", "quanto tenho", "saldos"] },
  { query: "summary", words: ["resumo", "gastos do mes", "relatorio", "extrato do mes", "balanco"] },
  { query: "upcoming", words: ["contas", "proximas contas", "a pagar", "vencimentos", "futuras", "boletos"] },
  { query: "subscriptions", words: ["assinaturas", "assinatura"] },
  { query: "recent", words: ["ultimas", "ultimos", "extrato", "movimentacoes"] },
];

/** Pulls a date hint out of the text: "ontem", "anteontem", "hoje", "dia 12", "12/10". */
export function extractDate(text: string, today: string): { date: string; rest: string } {
  const strip = (found: string) => text.replace(found, " ").replace(/\s+/g, " ").trim();
  const relative: Array<[RegExp, number]> = [[/\banteontem\b/, -2], [/\bontem\b/, -1], [/\bhoje\b/, 0]];
  for (const [pattern, offset] of relative) {
    const found = pattern.exec(text);
    if (found) return { date: addDays(today, offset), rest: strip(found[0]) };
  }

  const full = /\b(?:em |no |dia )?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(text);
  if (full) {
    const year = full[3] ? (full[3].length === 2 ? `20${full[3]}` : full[3]) : today.slice(0, 4);
    const candidate = `${year}-${full[2].padStart(2, "0")}-${full[1].padStart(2, "0")}`;
    if (isIsoDate(candidate)) return { date: candidate, rest: strip(full[0]) };
  }

  const dayOnly = /\b(?:no )?dia (\d{1,2})\b/.exec(text);
  if (dayOnly) {
    let candidate = `${today.slice(0, 8)}${dayOnly[1].padStart(2, "0")}`;
    // "dia 28" said on the 3rd means last month.
    if (isIsoDate(candidate) && candidate > today) candidate = addMonths(candidate, -1);
    if (isIsoDate(candidate)) return { date: candidate, rest: strip(dayOnly[0]) };
  }
  return { date: today, rest: text };
}

function cleanDescription(text: string): string {
  return text.replace(CONNECTORS, "").replace(/[.,;!]+$/, "").replace(/\s+/g, " ").trim();
}

/** Parsing runs on accent-free text; this puts the user's own spelling back ("farmacia" -> "Farmácia"). */
function restoreSpelling(description: string, original: string): string {
  const words = original.normalize("NFC").split(/\s+/).map((w) => w.replace(/[.,;!?]+$/, ""));
  const used = new Set<number>();
  const restored = description.split(" ").map((word) => {
    const index = words.findIndex((w, i) => !used.has(i) && normalizeText(w) === word);
    if (index < 0) return word;
    used.add(index);
    return words[index];
  });
  const text = restored.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Deterministic parse of a WhatsApp message. Ambiguous messages with a number go to the AI fallback. */
export function parseMessage(raw: string, today: string): Intent {
  const original = raw.trim();
  const text = normalizeText(original);
  if (!text) return { kind: "unknown" };

  if (["ajuda", "menu", "oi", "ola", "/ajuda", "help", "comandos", "?"].includes(text)) return { kind: "help" };

  const link = /^vincular\s+([a-z0-9-]{6,16})$/i.exec(original.trim());
  if (link) return { kind: "link", code: link[1].toUpperCase().replace(/-/g, "") };

  for (const q of QUERIES) {
    if (q.words.some((w) => text === w || text === `/${w}` || text.startsWith(`${w} `) || text.startsWith(`meu ${w}`) || text.startsWith(`minhas ${w}`))) {
      return { kind: "query", query: q.query };
    }
  }

  const tagMatch = /#([\p{L}\d_-]+)/u.exec(original);
  const tagHint = tagMatch ? tagMatch[1] : null;
  const withoutTag = tagMatch ? text.replace(normalizeText(tagMatch[0]), " ").replace(/\s+/g, " ").trim() : text;
  const { date, rest } = extractDate(withoutTag, today);

  const verbs = [...DEBIT_VERBS.map((v) => ({ v, type: "debit" as const })), ...CREDIT_VERBS.map((v) => ({ v, type: "credit" as const }))]
    .sort((a, b) => b.v.length - a.v.length);
  const verb = verbs.find(({ v }) => (v.length === 1 ? rest.startsWith(v) : rest === v || rest.startsWith(`${v} `)));

  if (verb) {
    const afterVerb = rest.slice(verb.v.length).trim();
    const amountFirst = new RegExp(`^${AMOUNT.source}\\s*(.*)$`).exec(afterVerb);
    const amountLast = new RegExp(`^(.*?)\\s+${AMOUNT.source}$`).exec(afterVerb);
    let amountText: string | null = null;
    let description = "";
    if (amountFirst) {
      amountText = amountFirst[1];
      description = amountFirst[2];
    } else if (amountLast) {
      amountText = amountLast[2];
      description = amountLast[1];
    }
    const amountCents = amountText ? parseBRL(amountText) : null;
    if (amountCents) {
      const clean = cleanDescription(description);
      return {
        kind: "transaction",
        draft: {
          type: verb.type,
          amountCents,
          description: clean ? restoreSpelling(clean, original) : verb.type === "credit" ? "Entrada" : "Saída",
          date,
          tagHint,
        },
      };
    }
  }

  return /\d/.test(text) ? { kind: "needs_ai" } : { kind: "unknown" };
}

/** Shape the small local model must return. Anything else is rejected. */
export const aiDraftSchema = z.object({
  tipo: z.enum(["entrada", "saida"]),
  valor: z.union([z.number().positive(), z.string().min(1)]),
  descricao: z.string().trim().min(1).max(120),
  categoria: z.string().trim().max(40).nullish(),
  data: z.string().nullish(),
});

/** Validates untrusted model output into a draft, or null when it does not hold up. */
export function draftFromAi(output: unknown, today: string): TransactionDraft | null {
  const parsed = aiDraftSchema.safeParse(output);
  if (!parsed.success) return null;
  const { tipo, valor, descricao, categoria, data } = parsed.data;
  let amountCents: number | null;
  try {
    amountCents = typeof valor === "number" ? decimalToCents(valor) : parseBRL(valor);
  } catch {
    amountCents = null;
  }
  if (!amountCents || amountCents <= 0 || amountCents > 100_000_000_00) return null;
  const date = data && isIsoDate(data) && data <= addDays(today, 1) && data >= addDays(today, -366) ? data : today;
  return {
    type: tipo === "entrada" ? "credit" : "debit",
    amountCents,
    description: descricao.replace(/[\r\n\t]+/g, " ").slice(0, 120),
    date,
    tagHint: categoria ?? null,
  };
}
