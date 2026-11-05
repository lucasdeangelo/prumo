import Link from "next/link";

import { clearSurpriseAction, txPrivacyAction } from "@/app/(app)/couple-actions";
import { SpaceChip, VisibilityBadge } from "@/components/app/couple";
import { Card, CardTitle } from "@/components/ui/card";
import { formatDayShort } from "@/lib/domain/dates";
import { formatBRL } from "@/lib/domain/money";
import { cn } from "@/lib/utils";

type Tx = {
  id: string;
  type: "credit" | "debit";
  amount_cents: number;
  scope: "mine" | "ours" | "partner";
  privacy: "account" | "category_only" | "hidden";
  surprise_until: string | null;
  free_money: boolean;
};

const ACCOUNT_DEFAULT: Record<string, string> = {
  private: "a conta é só sua, então nada aparece",
  totals: "a conta mostra só totais",
  details: "padrão da conta",
};

function Choice({ tx, field, value, active, title, body, returnTo }: { tx: Tx; field: string; value: string; active: boolean; title: string; body?: string; returnTo: string }) {
  return (
    <form action={txPrivacyAction}>
      <input type="hidden" name="id" value={tx.id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <button
        type="submit"
        name={field}
        value={value}
        aria-pressed={active}
        className={cn("flex w-full items-start gap-3 rounded-[10px] border px-3.5 py-3 text-left", active ? "border-foreground bg-card" : "border-border bg-card hover:border-[#cdd0ca]")}
      >
        <span aria-hidden="true" className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border", active ? "border-primary" : "border-[#b9bdb6]")}>
          {active ? <span className="size-2.5 rounded-full bg-primary" /> : null}
        </span>
        <span className="min-w-0">
          <span className="block text-[15px] font-medium">{title}</span>
          {body ? <span className="block text-[13px] text-muted-foreground">{body}</span> : null}
        </span>
      </button>
    </form>
  );
}

/** "De quem é este gasto" + "O que Rafa vê" for the owner of a fact. */
export function TxPrivacySection({ tx, partnerName, accountVisibility, tagName, today, meColor }: { tx: Tx; partnerName: string; accountVisibility: "private" | "totals" | "details" | null; tagName: string | null; today: string; meColor: "blue" | "terracotta" }) {
  const returnTo = `/transactions/${tx.id}`;
  const surpriseActive = tx.surprise_until && tx.surprise_until >= today;
  const isShared = tx.scope === "ours";

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <SpaceChip space={isShared ? "nosso" : "meu"} caption={isShared ? "Nosso · os dois veem" : tx.scope === "partner" ? `De ${partnerName} · no seu cartão` : "Meu · lançamento seu"} me={meColor} />
        {surpriseActive ? <VisibilityBadge kind="surprise" until={formatDayShort(tx.surprise_until!)} /> : null}
      </div>

      {tx.scope !== "partner" ? (
        <Card className="grid gap-3">
          <CardTitle>De quem é {tx.type === "debit" ? "este gasto" : "esta entrada"}</CardTitle>
          <form action={txPrivacyAction} className="grid grid-cols-2 gap-1 rounded-full bg-muted p-1">
            <input type="hidden" name="id" value={tx.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            {(["mine", "ours"] as const).map((scope) => (
              <button
                key={scope}
                type="submit"
                name="scope"
                value={scope}
                aria-pressed={tx.scope === scope}
                className={cn("min-h-10 rounded-full text-sm font-medium", tx.scope === scope ? "bg-card font-semibold text-primary shadow-[0_1px_3px_rgba(18,21,18,0.1)]" : "text-muted-foreground")}
              >
                {scope === "mine" ? "Meu" : "Nosso"}
              </button>
            ))}
          </form>
          {isShared ? <p className="text-[13px] text-muted-foreground">{partnerName} vê tudo, e entra no orçamento do lar e na divisão.</p> : null}
        </Card>
      ) : null}

      {tx.scope === "mine" ? (
        <Card className="grid gap-3">
          <CardTitle>O que {partnerName} vê</CardTitle>
          <Choice tx={tx} field="privacy" value="account" active={tx.privacy === "account" && !tx.free_money} returnTo={returnTo} title="Tudo" body={`Loja, categoria, valor e data. ${accountVisibility ? ACCOUNT_DEFAULT[accountVisibility].charAt(0).toUpperCase() + ACCOUNT_DEFAULT[accountVisibility].slice(1) : "Padrão da conta"}.`} />
          <Choice tx={tx} field="privacy" value="category_only" active={tx.privacy === "category_only"} returnTo={returnTo} title="Só categoria e valor" body={`${partnerName} vê “${tagName ?? "Outros"} · ${formatBRL(tx.amount_cents)}”, sem o nome da loja.`} />
          <Choice tx={tx} field="privacy" value="hidden" active={tx.privacy === "hidden"} returnTo={returnTo} title={`Ocultar de ${partnerName}`} body="Não aparece para ele. O saldo da conta continua o mesmo." />
          {tx.type === "debit" ? (
            <form action={txPrivacyAction}>
              <input type="hidden" name="id" value={tx.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <button type="submit" name="freeMoney" value={tx.free_money ? "0" : "1"} className="flex w-full items-center justify-between gap-3 rounded-[10px] border border-border bg-card px-3.5 py-3 text-left">
                <span>
                  <span className="block text-[15px] font-medium">Dinheiro livre</span>
                  <span className="block text-[13px] text-muted-foreground">{partnerName} vê só o total do mês, nunca onde foi.</span>
                </span>
                <span aria-hidden="true" className={cn("flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition", tx.free_money ? "justify-end bg-primary" : "justify-start bg-[#cdd0ca]")}>
                  <span className="size-5 rounded-full bg-white" />
                </span>
                <span className="sr-only">{tx.free_money ? "Ligado" : "Desligado"}</span>
              </button>
            </form>
          ) : null}
          {tx.type === "debit" ? (
            surpriseActive ? (
              <form action={clearSurpriseAction} className="flex items-center justify-between gap-3 rounded-[10px] border border-border px-3.5 py-3">
                <input type="hidden" name="id" value={tx.id} />
                <span className="text-sm">Surpresa até {formatDayShort(tx.surprise_until!)}</span>
                <button type="submit" className="min-h-11 text-sm font-medium text-primary">Revelar agora</button>
              </form>
            ) : (
              <Link href={`/transactions/${tx.id}/surprise`} className="flex items-center justify-between rounded-[10px] border border-border bg-card px-3.5 py-3 text-foreground no-underline hover:text-foreground">
                <span>
                  <span className="block text-[15px] font-medium">Modo surpresa</span>
                  <span className="block text-[13px] text-muted-foreground">É um presente? Guarde até uma data.</span>
                </span>
                <span aria-hidden="true" className="text-muted-foreground">›</span>
              </Link>
            )
          ) : null}
          {tagName ? (
            <Link href="/privacy/rules" className="text-sm font-medium">Fazer isso sempre em {tagName} · Criar uma regra de privacidade</Link>
          ) : null}
          <p className="text-[13px] text-muted-foreground">{partnerName} não recebe aviso quando você muda o que ele vê. Lançamentos ocultos não aparecem como “ocultos” para ele.</p>
        </Card>
      ) : null}
    </>
  );
}
