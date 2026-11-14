"use client";

import { useActionState, useState } from "react";

import { batchOwnerAction, type CardsState } from "@/app/(app)/cards/actions";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { Money } from "@/components/app/money";
import { cn } from "@/lib/utils";

type Item = { id: string; label: string; detail: string; amountCents: number; category: string };

/** "Marcar em lote + rateio": choose purchases, whose they are and how to split them. */
export function BatchForm({ items, holder, other, incomeShare, returnTo }: { items: Item[]; holder: string; other: string; incomeShare: number; returnTo: string }) {
  const [state, action] = useActionState<CardsState, FormData>(batchOwnerAction, undefined);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [owner, setOwner] = useState<"ours" | "holder" | "partner">("ours");
  const [method, setMethod] = useState<"equal" | "income" | "fixed">("income");
  const [fixed, setFixed] = useState(50);
  const [always, setAlways] = useState(false);

  const chosen = items.filter((i) => selected.has(i.id));
  const total = chosen.reduce((s, i) => s + i.amountCents, 0);
  const share = method === "equal" ? 0.5 : method === "income" ? incomeShare : fixed / 100;
  const first = Math.round(total * share);
  const categories = [...new Set(chosen.map((c) => c.category))];
  const oneCategory = categories.length === 1 ? categories[0] : null;

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="returnTo" value={returnTo} />
      <div className="flex items-center justify-between px-1">
        <span className="text-[15px] font-medium">{selected.size} {selected.size === 1 ? "selecionada" : "selecionadas"}</span>
        <button type="button" className="min-h-11 text-sm font-medium text-primary" onClick={() => setSelected(selected.size === items.length ? new Set() : new Set(items.map((i) => i.id)))}>
          {selected.size === items.length ? "Nenhuma" : "Todas"}
        </button>
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {items.map((item) => (
          <li key={item.id}>
            <label className="flex min-h-14 cursor-pointer items-center gap-3 px-4 py-3">
              <input type="checkbox" name="ids" value={item.id} checked={selected.has(item.id)} onChange={() => toggle(item.id)} className="size-5 accent-[var(--primary)]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium">{item.label}</span>
                <span className="block text-[13px] text-muted-foreground">{item.detail}</span>
              </span>
              <span className="tabular text-[15px] font-medium"><Money cents={item.amountCents} /></span>
            </label>
          </li>
        ))}
      </ul>

      <div className="grid gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between"><span className="text-[15px] font-medium">Marcar {selected.size} {selected.size === 1 ? "compra" : "compras"} como</span><span className="tabular text-sm font-medium"><Money cents={total} /></span></div>
        <div className="grid grid-cols-3 gap-1 rounded-full bg-muted p-1" role="radiogroup" aria-label="De quem é">
          {([["ours", "Nosso"], ["holder", `De ${holder}`], ["partner", `De ${other}`]] as const).map(([value, label]) => (
            <label key={value} className="relative">
              <input type="radio" name="owner" value={value} checked={owner === value} onChange={() => setOwner(value)} className="peer sr-only" />
              <span className="flex min-h-10 cursor-pointer items-center justify-center rounded-full text-[13px] font-medium text-muted-foreground peer-checked:bg-card peer-checked:font-semibold peer-checked:text-primary peer-checked:shadow-[0_1px_3px_rgba(18,21,18,0.1)]">{label}</span>
            </label>
          ))}
        </div>
        {owner === "ours" ? (
          <>
            <p className="text-sm font-medium">Como dividir</p>
            <div className="grid gap-2">
              {([
                ["equal", "50/50", <><Money cents={Math.round(total / 2)} /> cada</>],
                ["income", "Pela renda", `${Math.round(incomeShare * 100)}% · ${100 - Math.round(incomeShare * 100)}%`],
                ["fixed", "Valor fixo", "definir"],
              ] as const).map(([value, label, hint]) => (
                <label key={value} className={cn("flex min-h-12 cursor-pointer items-center gap-3 rounded-[10px] border px-3.5", method === value ? "border-foreground" : "border-border")}>
                  <input type="radio" name="method" value={value} checked={method === value} onChange={() => setMethod(value)} className="size-4 accent-[var(--primary)]" />
                  <span className="flex-1 text-[15px]">{label}</span>
                  <span className="text-[13px] text-muted-foreground">{hint}</span>
                </label>
              ))}
            </div>
            {method === "fixed" ? (
              <label className="grid gap-1.5 text-sm">
                <span>Parte de {holder}: {fixed}%</span>
                <input type="range" name="share" min={0} max={100} step={5} value={fixed} onChange={(e) => setFixed(Number(e.target.value))} className="accent-[var(--primary)]" />
              </label>
            ) : null}
            <p className="text-[13px] text-muted-foreground">
              {holder} <Money cents={first} /> · {other} <Money cents={total - first} />.{method === "income" ? " A proporção vem das rendas que vocês informaram." : ""}
            </p>
            {oneCategory ? (
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" name="always" value={oneCategory} checked={always} onChange={(e) => setAlways(e.target.checked)} className="mt-0.5 size-5 accent-[var(--primary)]" />
                <span>
                  <span className="block font-medium">Usar sempre para {oneCategory}</span>
                  <span className="block text-muted-foreground">Compras futuras já entram como Nosso, {method === "equal" ? "50/50" : method === "income" ? "pela renda" : "com este valor"}</span>
                </span>
              </label>
            ) : null}
          </>
        ) : null}
      </div>
      <FormMessage state={state} />
      <SubmitButton className="w-full">Aplicar {selected.size === 1 ? "à compra" : `às ${selected.size} compras`}</SubmitButton>
    </form>
  );
}
