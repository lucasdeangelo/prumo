"use client";

import { useActionState, useState } from "react";

import { createManualInvestmentAction, type ManualState } from "@/app/(app)/investments/manual-actions";
import { AssetTile } from "@/components/app/investments";
import { Field, Input, SubmitButton } from "@/components/ui/form";
import { estimateAtMaturity, ratesFromSnapshot, type RateIndex, type RatesSnapshot } from "@/lib/domain/fixed-income";
import { formatBRL, parseBRL } from "@/lib/domain/money";
import { cn } from "@/lib/utils";

type Kind = "cdb" | "tesouro" | "lci" | "acao" | "fii" | "etf" | "fundo" | "cripto";

const KINDS: Array<{ kind: Kind; label: string; type: string; subtype: string | null }> = [
  { kind: "cdb", label: "CDB", type: "FIXED_INCOME", subtype: "CDB" },
  { kind: "tesouro", label: "Tesouro", type: "FIXED_INCOME", subtype: "TREASURY" },
  { kind: "lci", label: "LCI/LCA", type: "FIXED_INCOME", subtype: "LCI" },
  { kind: "acao", label: "Ações", type: "EQUITY", subtype: "STOCK" },
  { kind: "fii", label: "FIIs", type: "EQUITY", subtype: "REAL_ESTATE_FUND" },
  { kind: "etf", label: "ETFs", type: "ETF", subtype: "ETF" },
  { kind: "fundo", label: "Fundos", type: "MUTUAL_FUND", subtype: null },
  { kind: "cripto", label: "Cripto", type: "CRYPTO", subtype: null },
];

const FIXED: Kind[] = ["cdb", "tesouro", "lci"];
const QUOTED: Kind[] = ["acao", "fii", "etf", "cripto"];
const PLACEHOLDER: Partial<Record<Kind, string>> = { acao: "WEGE3", fii: "HGLG11", etf: "BOVA11", cripto: "BTC" };
const INDEX_LABEL: Record<RateIndex, string> = { cdi: "% do CDI", selic: "Selic", pre: "Prefixado", ipca: "IPCA +" };
const SUFFIX: Record<RateIndex, string> = { cdi: "% do CDI", selic: "", pre: "% ao ano", ipca: "% + IPCA" };

export type GoalOption = { id: string; label: string };

function Segmented<T extends string>({ value, options, onChange, label, small }: { value: T; options: Array<[T, React.ReactNode]>; onChange: (v: T) => void; label: string; small?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-1 rounded-full bg-muted p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={v === value}
          onClick={() => onChange(v)}
          className={cn("flex items-center justify-center gap-1.5 rounded-full px-2 font-medium", small ? "min-h-[34px] text-[13px]" : "min-h-10 text-sm", v === value ? "bg-card font-semibold text-foreground shadow-[0_1px_3px_rgba(18,21,18,0.1)]" : "text-muted-foreground")}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

const monthYear = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

/** InvNovo: type, whose, institution, amount and date, how it earns, and an optional goal. */
export function ManualInvestmentForm({ partnerName, goals, rates, today }: { partnerName: string | null; goals: { mine: GoalOption[]; ours: GoalOption[] }; rates: RatesSnapshot; today: string }) {
  const [state, action] = useActionState<ManualState, FormData>(createManualInvestmentAction, undefined);
  const [kind, setKind] = useState<Kind>("cdb");
  const [scope, setScope] = useState<"mine" | "ours">("mine");
  const [index, setIndex] = useState<RateIndex>("cdi");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [rate, setRate] = useState("");
  const [due, setDue] = useState("");
  const fixed = FIXED.includes(kind);
  const quoted = QUOTED.includes(kind);
  const indexes: RateIndex[] = kind === "tesouro" ? ["selic", "pre", "ipca"] : ["cdi", "pre", "ipca"];
  const chosenIndex = indexes.includes(index) ? index : indexes[0];

  const amountCents = parseBRL(amount) ?? 0;
  const rateValue = Number(rate.replace(",", "."));
  const canEstimate = fixed && amountCents > 0 && due > date && (chosenIndex === "selic" || rateValue > 0);
  const meta = KINDS.find((k) => k.kind === kind)!;
  const estimate = canEstimate
    ? estimateAtMaturity({
        amountCents,
        investedCents: amountCents,
        since: date,
        today: date,
        due,
        terms: { index: chosenIndex, pct: chosenIndex === "cdi" ? rateValue : chosenIndex === "selic" ? 100 : null, annual: chosenIndex === "pre" || chosenIndex === "ipca" ? rateValue : null },
        rates: ratesFromSnapshot(rates),
        type: meta.type,
        subtype: meta.subtype,
      })
    : null;
  const rateText = chosenIndex === "cdi" ? `${rate}% do CDI` : chosenIndex === "selic" ? "a Selic" : chosenIndex === "pre" ? `${rate}% ao ano` : `IPCA + ${rate}%`;

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="scope" value={partnerName ? scope : "mine"} />
      {fixed ? <input type="hidden" name="index" value={chosenIndex} /> : null}

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Tipo</legend>
        <div role="radiogroup" aria-label="Tipo de investimento" className="grid grid-cols-4 gap-2">
          {KINDS.map((k) => (
            <button
              key={k.kind}
              type="button"
              role="radio"
              aria-checked={kind === k.kind}
              onClick={() => setKind(k.kind)}
              className={cn("flex min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-xl border bg-card px-1 py-1.5 text-xs font-medium", kind === k.kind ? "border-[1.5px] border-primary bg-[#F2F6F4]" : "border-border")}
            >
              <span className="origin-center scale-75"><AssetTile type={k.type} subtype={k.subtype} /></span>
              {k.label}
            </button>
          ))}
        </div>
      </fieldset>

      {partnerName ? (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">De quem é</legend>
          <Segmented value={scope} onChange={setScope} label="De quem é" options={[["mine", "Meu"], ["ours", "Nosso"]]} />
          <p className="text-xs text-muted-foreground">{scope === "ours" ? `Investimentos do Nosso aparecem para você e ${partnerName}, com os detalhes.` : `${partnerName} vê só o total dos seus investimentos, até você mudar.`}</p>
        </fieldset>
      ) : null}

      {quoted ? (
        <>
          <Field label={kind === "cripto" ? "Moeda" : "Código"}><Input name="name" required maxLength={20} placeholder={PLACEHOLDER[kind]} autoCapitalize="characters" /></Field>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Quantidade"><Input name="quantity" inputMode="decimal" required placeholder={kind === "cripto" ? "0,0042" : "60"} /></Field>
            <Field label="Preço pago (cada)"><Input name="price" inputMode="decimal" required placeholder="42,50" /></Field>
          </div>
          <Field label="Data da compra"><Input type="date" name="date" required max={today} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </>
      ) : (
        <>
          {kind === "fundo" ? <Field label="Nome do fundo"><Input name="name" required maxLength={120} placeholder="Fundo multimercado" /></Field> : null}
          <Field label="Instituição"><Input name="institution" maxLength={80} placeholder="Nubank" list="institutions" /></Field>
          <datalist id="institutions">{["Nubank", "Inter", "Itaú", "Bradesco", "Banco do Brasil", "Caixa", "Santander", "C6 Bank", "XP", "BTG", "Rico", "Tesouro Direto"].map((n) => <option key={n} value={n} />)}</datalist>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Valor aplicado"><Input name="amount" inputMode="decimal" required placeholder="3.000,00" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
            <Field label="Data"><Input type="date" name="date" required max={today} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          </div>
        </>
      )}

      {fixed ? (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Rentabilidade</legend>
          <Segmented value={chosenIndex} onChange={setIndex} label="Tipo de rentabilidade" small options={indexes.map((i) => [i, INDEX_LABEL[i]] as [RateIndex, string])} />
          <div className="grid grid-cols-2 gap-2.5">
            {chosenIndex === "selic" ? (
              <p className="flex min-h-12 items-center rounded-[10px] border border-border bg-card px-3.5 text-sm text-muted-foreground">Rende a Selic</p>
            ) : (
              <label className="flex min-h-12 items-center gap-2 rounded-[10px] border border-border bg-card px-3.5">
                <input name="rate" inputMode="decimal" required value={rate} onChange={(e) => setRate(e.target.value)} placeholder={chosenIndex === "cdi" ? "110" : "6,5"} aria-label={`Taxa (${SUFFIX[chosenIndex]})`} className="tabular min-w-0 flex-1 bg-transparent text-[15px] outline-none" />
                <span className="shrink-0 text-[13px] text-muted-foreground">{SUFFIX[chosenIndex]}</span>
              </label>
            )}
            <label className="flex min-h-12 items-center gap-2 rounded-[10px] border border-border bg-card px-3.5">
              <input type="date" name="due" min={date} value={due} onChange={(e) => setDue(e.target.value)} aria-label="Vencimento" className="tabular min-w-0 flex-1 bg-transparent text-[15px] outline-none" />
              <span className="shrink-0 text-[13px] text-muted-foreground">vence</span>
            </label>
          </div>
        </fieldset>
      ) : null}

      {goals.mine.length + goals.ours.length > 0 ? (
        <Field label="Meta (opcional)">
          <select name="goalId" defaultValue="" className="min-h-12 w-full rounded-[10px] border border-border bg-card px-3.5 text-[15px]">
            <option value="">Sem meta</option>
            {goals.mine.length ? <optgroup label="Minhas metas">{goals.mine.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}</optgroup> : null}
            {goals.ours.length ? <optgroup label={goals.mine.length ? "Metas do casal" : "Metas"}>{goals.ours.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}</optgroup> : null}
          </select>
        </Field>
      ) : null}

      {estimate ? (
        <p className="rounded-xl bg-secondary px-4 py-3 text-[13px] leading-[19px] text-secondary-foreground">
          Estimativa: com {rateText}, este aporte vira ≈ <span className="tabular font-medium">{formatBRL(estimate.netCents)}</span> em {monthYear.format(new Date(`${due}T00:00:00Z`))}
          {estimate.taxRate > 0 ? ", já descontado o IR" : ", sem IR"}. Usa as taxas de hoje{chosenIndex === "ipca" && rates.ipca12 !== null ? ` e o IPCA dos últimos 12 meses (${rates.ipca12.toLocaleString("pt-BR")}%)` : ""}.
        </p>
      ) : quoted ? (
        <p className="text-xs text-muted-foreground">O Prumo não busca cotações: atualize o preço quando quiser, na tela do investimento.</p>
      ) : null}

      {state?.error ? <p role="alert" className="rounded-[10px] bg-danger-bg px-3 py-2 text-sm text-danger">{state.error}</p> : null}
      <SubmitButton className="w-full">Salvar investimento</SubmitButton>
    </form>
  );
}
