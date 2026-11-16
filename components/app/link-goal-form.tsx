"use client";

import { useActionState, useState } from "react";

import { linkInvestmentAction, type LinkState } from "@/app/(app)/investments/actions";
import { Money } from "@/components/app/money";
import { Input, SubmitButton } from "@/components/ui/form";
import { cn } from "@/lib/utils";

export type GoalChoice = { id: string; name: string; caption: string; scope: "mine" | "ours" };

/**
 * InvVincular: pick one goal, then whether the whole asset or a part counts for it.
 * Picking a couple goal for an asset the partner cannot see explains what changes before saving.
 */
export function LinkGoalForm({
  investmentId,
  amountCents,
  mine,
  ours,
  preselected,
  shareNote,
  returnTo,
}: {
  investmentId: string;
  amountCents: number;
  mine: GoalChoice[];
  ours: GoalChoice[];
  preselected: string | null;
  shareNote: string | null;
  returnTo: string;
}) {
  const [state, action] = useActionState<LinkState, FormData>(linkInvestmentAction, undefined);
  const all = [...mine, ...ours];
  const [goalId, setGoalId] = useState<string | null>(preselected && all.some((g) => g.id === preselected) ? preselected : all[0]?.id ?? null);
  const [mode, setMode] = useState<"all" | "part">("all");
  const chosen = all.find((g) => g.id === goalId);

  const option = (g: GoalChoice) => (
    <label
      key={g.id}
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-xl border bg-card px-3.5 py-3 text-sm",
        goalId === g.id ? "border-[1.5px] border-primary bg-[#F2F6F4]" : "border-border",
      )}
    >
      <input type="radio" name="goalId" value={g.id} checked={goalId === g.id} onChange={() => setGoalId(g.id)} className="sr-only" />
      <span aria-hidden="true" className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", g.scope === "ours" ? "bg-[#E3EDE8] text-primary" : "bg-[#E6ECF6] text-[#2B4579]")}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.5" /></svg>
      </span>
      <span className="grid min-w-0 flex-1 gap-px">
        <span className="font-medium">{g.name}</span>
        <span className="text-xs text-muted-foreground">{g.caption}</span>
      </span>
      <span aria-hidden="true" className={cn("size-5 shrink-0 rounded-full border-[1.5px] border-[#C9CCC6]", goalId === g.id && "border-[6px] border-primary")} />
    </label>
  );

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="id" value={investmentId} />
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <fieldset className="grid gap-2">
        <legend className="sr-only">Meta</legend>
        {mine.length > 0 ? <p className="label-mono pt-1">Minhas metas</p> : null}
        {mine.map(option)}
        {ours.length > 0 ? <p className="label-mono pt-2">{mine.length > 0 ? "Metas do casal" : "Metas"}</p> : null}
        {ours.map(option)}
      </fieldset>
      {chosen?.scope === "ours" && shareNote ? (
        <p className="flex items-start gap-2.5 rounded-xl bg-background px-3.5 py-3 text-[13px] leading-[19px] text-muted-foreground">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" className="mt-px shrink-0"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
          <span>{shareNote}</span>
        </p>
      ) : null}
      <div className="grid gap-2">
        <p className="text-sm font-medium">Quanto conta para a meta</p>
        <div className="grid grid-cols-2 gap-1 rounded-full bg-muted p-1" role="radiogroup" aria-label="Quanto conta">
          {(["all", "part"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              className={cn("min-h-[34px] rounded-full text-[13px] font-medium", mode === m ? "bg-card font-semibold text-foreground shadow-[0_1px_3px_rgba(18,21,18,0.1)]" : "text-muted-foreground")}
            >
              {m === "all" ? <>Tudo · <Money cents={amountCents} /></> : "Uma parte"}
            </button>
          ))}
        </div>
        {mode === "part" ? <Input name="part" inputMode="decimal" required placeholder="1.000,00" aria-label="Quanto conta para a meta" /> : null}
      </div>
      {state?.error ? <p role="alert" className="rounded-[10px] bg-danger-bg px-3 py-2 text-sm text-danger">{state.error}</p> : null}
      <SubmitButton className="w-full" pendingText="Vinculando…">{chosen ? `Vincular a “${chosen.name}”` : "Vincular"}</SubmitButton>
    </form>
  );
}
