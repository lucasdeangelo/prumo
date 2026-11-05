import { normalizeMerchant, normalizeText } from "./normalize";

export type TransactionType = "credit" | "debit";
export type TagRef = { id: string; name: string };
export type TagRule = { id?: string; pattern: string; pattern_type: "merchant" | "description" | "contains" | "exact"; tag_id: string; priority: number };
export type CategorySource = "rule" | "keyword" | "provider" | "fallback" | "user" | "ai";
export type Categorization = { tagId: string; confidence: number; source: CategorySource };

export type CategorizeInput = {
  description: string;
  merchant?: string | null;
  type: TransactionType;
  providerCategory?: string | null;
};

// Default tag name -> keywords found in normalized descriptions. Order matters: first match wins.
const KEYWORDS: Array<{ tag: string; type?: TransactionType; words: string[] }> = [
  { tag: "Salário", type: "credit", words: ["salario", "folha", "pagto salario", "proventos", "remuneracao", "13o", "ferias"] },
  { tag: "Investimentos", words: ["aplicacao", "resgate", "cdb", "tesouro", "rdb", "poupanca", "corretora", "xp invest", "rico corretora", "nuinvest", "btg"] },
  { tag: "Transferências", words: ["transferencia entre contas", "mesma titularidade", "pagamento de fatura", "pagamento fatura", "pgto fatura", "fatura cartao"] },
  { tag: "Assinaturas", type: "debit", words: ["netflix", "spotify", "disney", "hbo", "max.com", "globoplay", "prime video", "amazon prime", "youtube premium", "google one", "icloud", "apple.com", "deezer", "paramount", "crunchyroll", "chatgpt", "openai", "anthropic", "claude.ai", "microsoft 365", "adobe", "canva", "uber one", "meli+", "ifood clube"] },
  { tag: "Alimentação", type: "debit", words: ["ifood", "ifd", "rappi", "restaurante", "lanchonete", "padaria", "pizzaria", "burger", "mcdonald", "bk ", "subway", "starbucks", "cafe", "bar ", "acai", "churrascaria", "sushi", "outback", "habibs", "ze delivery"] },
  { tag: "Mercado", type: "debit", words: ["supermercado", "mercado", "atacadao", "assai", "carrefour", "pao de acucar", "mercado extra", "hortifruti", "sacolao", "big ", "zaffari", "savegnago", "sams club"] },
  { tag: "Transporte", type: "debit", words: ["uber", "99app", "99 pop", "99pop", "cabify", "posto", "gasolina", "shell", "ipiranga", "petrobras", "combustivel", "estacionamento", "estapar", "sem parar", "conectcar", "veloe", "metro", "bilhete unico", "cptm", "onibus", "pedagio", "latam", "gol linhas", "azul linhas"] },
  { tag: "Moradia", type: "debit", words: ["aluguel", "condominio", "iptu", "imobiliaria", "quintoandar", "leroy", "telhanorte"] },
  { tag: "Contas", type: "debit", words: ["energia", "enel", "cemig", "copel", "cpfl", "eletropaulo", "sabesp", "agua", "saneamento", "comgas", "vivo", "claro", "tim ", "oi ", "net servicos", "internet", "telefone", "boleto", "tarifa", "anuidade", "iof", "juros"] },
  { tag: "Saúde", type: "debit", words: ["farmacia", "drogaria", "droga raia", "drogasil", "pague menos", "hospital", "clinica", "laboratorio", "unimed", "amil", "sulamerica", "bradesco saude", "odonto", "dentista", "medico", "smart fit", "smartfit", "academia", "wellhub", "gympass", "totalpass"] },
  { tag: "Educação", type: "debit", words: ["escola", "faculdade", "universidade", "curso", "udemy", "alura", "coursera", "livraria", "mensalidade escolar", "duolingo"] },
  { tag: "Lazer", type: "debit", words: ["cinema", "cinemark", "ingresso", "sympla", "eventim", "teatro", "show", "steam", "playstation", "xbox", "nintendo", "hotel", "airbnb", "booking", "viagem"] },
  { tag: "Compras", type: "debit", words: ["amazon", "mercado livre", "mercadolivre", "shopee", "magalu", "magazine luiza", "americanas", "shein", "aliexpress", "renner", "riachuelo", "c&a", "zara", "centauro", "netshoes", "kabum", "casas bahia"] },
];

// Pluggy category names (English) mapped to default tags. Matched by substring, lower-case.
const PROVIDER_CATEGORIES: Array<{ tag: string; words: string[] }> = [
  { tag: "Salário", words: ["salary", "income"] },
  { tag: "Investimentos", words: ["investment"] },
  { tag: "Transferências", words: ["same person transfer", "credit card payment"] },
  { tag: "Assinaturas", words: ["streaming", "subscription", "digital services"] },
  { tag: "Alimentação", words: ["eating out", "food delivery", "restaurant", "food and drinks"] },
  { tag: "Mercado", words: ["groceries", "supermarket"] },
  { tag: "Transporte", words: ["transport", "taxi", "ride", "gas station", "parking", "tolls", "airport", "flight", "public transportation"] },
  { tag: "Moradia", words: ["housing", "rent", "condominium"] },
  { tag: "Contas", words: ["utilities", "electricity", "water", "telecommunication", "internet", "phone", "bank fees", "taxes", "interest"] },
  { tag: "Saúde", words: ["health", "pharmacy", "hospital", "dentist", "gyms", "wellness", "insurance"] },
  { tag: "Educação", words: ["education", "school", "university", "courses", "books"] },
  { tag: "Lazer", words: ["leisure", "entertainment", "tickets", "games", "travel", "lodging"] },
  { tag: "Compras", words: ["shopping", "online shopping", "clothing", "electronics", "department store"] },
  { tag: "Transferências", words: ["transfer"] },
];

function ruleMatches(rule: TagRule, text: string, merchant: string): boolean {
  const pattern = normalizeText(rule.pattern);
  if (!pattern) return false;
  switch (rule.pattern_type) {
    case "exact":
      return text === pattern || merchant === pattern;
    case "merchant":
      return merchant === pattern || merchant === normalizeMerchant(rule.pattern);
    case "description":
      return text.startsWith(pattern);
    case "contains":
      return text.includes(pattern) || merchant.includes(pattern);
  }
}

/**
 * Deterministic categorization: user rules > keyword dictionary > provider category > "Outros".
 * Returns null only when the user has no tag to fall back to.
 */
export function categorize(input: CategorizeInput, rules: TagRule[], tags: TagRef[]): Categorization | null {
  const text = normalizeText(`${input.description} ${input.merchant ?? ""}`);
  const merchant = normalizeMerchant(input.merchant || input.description);
  const tagIds = new Set(tags.map((t) => t.id));
  const byName = new Map(tags.map((t) => [normalizeText(t.name), t.id]));

  const ordered = [...rules].sort((a, b) => b.priority - a.priority || b.pattern.length - a.pattern.length);
  for (const rule of ordered) {
    if (tagIds.has(rule.tag_id) && ruleMatches(rule, text, merchant)) {
      return { tagId: rule.tag_id, confidence: 1, source: "rule" };
    }
  }

  const padded = ` ${text} `;
  for (const group of KEYWORDS) {
    if (group.type && group.type !== input.type) continue;
    const tagId = byName.get(normalizeText(group.tag));
    if (!tagId) continue;
    if (group.words.some((word) => padded.includes(word.endsWith(" ") ? ` ${word}` : word))) {
      return { tagId, confidence: 0.8, source: "keyword" };
    }
  }

  if (input.providerCategory) {
    const category = input.providerCategory.toLowerCase();
    for (const group of PROVIDER_CATEGORIES) {
      const tagId = byName.get(normalizeText(group.tag));
      if (tagId && group.words.some((word) => category.includes(word))) {
        return { tagId, confidence: 0.6, source: "provider" };
      }
    }
  }

  const fallback = byName.get("outros");
  return fallback ? { tagId: fallback, confidence: 0.2, source: "fallback" } : null;
}

/** Resolves a free-text tag hint ("mercado", "#lazer") to one of the user's tags. */
export function resolveTagHint(hint: string | null | undefined, tags: TagRef[]): string | null {
  if (!hint) return null;
  const wanted = normalizeText(hint.replace(/^#/, ""));
  if (!wanted) return null;
  const exact = tags.find((t) => normalizeText(t.name) === wanted);
  if (exact) return exact.id;
  const partial = tags.find((t) => normalizeText(t.name).startsWith(wanted) || wanted.startsWith(normalizeText(t.name)));
  return partial?.id ?? null;
}
