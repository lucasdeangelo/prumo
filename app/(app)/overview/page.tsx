import Link from "next/link";

import { Amount, SectionHeader } from "@/components/app/bits";
import { CoupleAvatars, InstitutionMark, SegmentBar, SpaceSwitcher, UpdatedAt, VisibilityBadge, PERSON_BG } from "@/components/app/couple";
import { HomeAnalytics } from "@/components/app/home-analytics";
import { ChevronRightIcon } from "@/components/app/icons";
import { Card, EmptyState } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import {
  budgetOverview,
  cardInvoices,
  freeMoneyFor,
  goalsOverview,
  loadCoupleContext,
  loadSharedHistory,
  loadSharedPlans,
  partnerView,
  pendingApprovalsFor,
} from "@/lib/application/couple-data";
import { daysLeftInMonth } from "@/lib/domain/couple";
import { addMonths, formatDayShort, formatMonthLong, monthBounds, monthOf, todayIn } from "@/lib/domain/dates";
import { formatBRL } from "@/lib/domain/money";
import { listAccounts, listBills, listSubscriptions, listTags, listTransactions } from "@/lib/repositories/reads";
import { currentSpace } from "@/lib/space";
import { transactionLabel, type Transaction } from "@/lib/types";

export const metadata = { title: "Início · Prumo" };

const monthName = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" });

export default async function OverviewPage() {
  const { user, db } = await requireUser();
  const today = todayIn();
  const month = monthOf(today);
  const historyStart = monthBounds(addMonths(`${month}-01`, -5).slice(0, 7)).start;
  const [ctx, space] = await Promise.all([loadCoupleContext(user.id, month), currentSpace()]);
  const { household } = ctx;
  const me = household?.me ?? { userId: user.id, name: user.name?.split(" ")[0] ?? "Você", initial: (user.name ?? "V").charAt(0).toUpperCase(), color: "blue" as const, incomeCents: null, pixKey: null };
  const partner = household?.partner ?? null;
  const shownSpace = space === "nosso" ? "nosso" : "meu";
  const lowerMonth = monthName.format(new Date(`${month}-01T00:00:00Z`));

  return (
    <div className="grid gap-5">
      <SpaceSwitcher space={shownSpace} me={me} partner={partner} returnTo="/overview" />
      {shownSpace === "nosso" ? (
        partner && household ? (
          <NossoHome userId={user.id} ctx={ctx} today={today} month={month} lowerMonth={lowerMonth} historyStart={historyStart} />
        ) : (
          <InviteCard />
        )
      ) : (
        <MeuHome userId={user.id} db={db} ctx={ctx} today={today} month={month} lowerMonth={lowerMonth} historyStart={historyStart} meName={me.name} />
      )}
    </div>
  );
}

type Ctx = Awaited<ReturnType<typeof loadCoupleContext>>;

function InviteCard() {
  return (
    <Card className="flex flex-col gap-3">
      <p className="label-mono">Espaço Nosso</p>
      <h1 className="text-2xl font-medium tracking-[-0.02em]">Finanças a dois, no prumo</h1>
      <p className="text-sm text-muted-foreground">
        Convide seu par para ver juntos o que é dos dois: orçamento do lar, fatura compartilhada, metas e combinados. Cada um continua dono do que é seu.
      </p>
      <Link href="/couple" className="inline-flex min-h-12 items-center justify-center rounded-full bg-primary px-6 text-[15px] font-medium text-primary-foreground hover:bg-primary-press hover:text-primary-foreground">
        Convidar meu par
      </Link>
    </Card>
  );
}

async function MeuHome({ userId, db, ctx, today, month, lowerMonth, historyStart, meName }: { userId: string; db: Parameters<typeof listTags>[0]; ctx: Ctx; today: string; month: string; lowerMonth: string; historyStart: string; meName: string }) {
  const { household } = ctx;
  const hasPartner = Boolean(household?.partner);
  const [tags, accounts, history, bills, subscriptions, freeMoney, pending] = await Promise.all([
    listTags(db, userId),
    listAccounts(db, userId),
    listTransactions(db, userId, { from: historyStart, to: monthBounds(month).end, limit: 5000 }),
    listBills(db, userId, { status: ["pending", "overdue"] }),
    listSubscriptions(db, userId),
    household ? freeMoneyFor(household, userId, ctx.facts, month) : Promise.resolve(null),
    household ? pendingApprovalsFor(household.id, userId) : Promise.resolve([]),
  ]);
  // In Meu, what is marked "Nosso" lives in the shared space.
  const mine = (t: { scope?: string }) => !hasPartner || t.scope !== "ours";
  const myHistory = history.filter(mine);
  const partnerName = household?.partner?.name ?? "seu par";
  const recentMine = myHistory.filter((t) => t.transaction_date >= monthBounds(month).start).slice(0, 3);
  const withBalance = accounts.filter((a) => a.balance_cents !== null);

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-medium tracking-[-0.02em]">Seu {lowerMonth}, {meName}</h1>
        <UpdatedAt at={ctx.syncedAt} />
      </header>

      {freeMoney ? (
        <Link href="/couple/free-money" className="block rounded-2xl border border-border bg-card p-5 text-foreground no-underline hover:text-foreground">
          <div className="flex items-center justify-between">
            <span className="label-mono">Dinheiro livre</span>
            <VisibilityBadge kind="totals" />
          </div>
          <p className="tabular mt-2 text-[32px] font-medium tracking-[-0.03em]">{formatBRL(freeMoney.remainingCents)} <span className="text-base text-muted-foreground">restam</span></p>
          <div className="mt-3"><SegmentBar segments={[{ value: freeMoney.usedCents, color: PERSON_BG[household!.me.color] }]} total={freeMoney.allowanceCents} label={`${formatBRL(freeMoney.usedCents)} de ${formatBRL(freeMoney.allowanceCents)}`} /></div>
          <p className="mt-2 text-[13px] text-muted-foreground">{formatBRL(freeMoney.usedCents)} de {formatBRL(freeMoney.allowanceCents)} · renova em 1º de {monthName.format(new Date(`${freeMoney.renewsOn}T00:00:00Z`))}. {partnerName.charAt(0).toUpperCase() + partnerName.slice(1)} vê só o total.</p>
        </Link>
      ) : null}

      {accounts.length > 0 ? (
        <section className="grid gap-2">
          <SectionHeader title="Suas contas" action={hasPartner ? <Link href="/privacy/visibility" className="flex min-h-11 items-center text-sm font-medium">Visibilidade</Link> : undefined} />
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {accounts.map((a) => (
              <li key={a.id} className="flex min-h-16 items-center gap-3 px-4 py-3">
                <InstitutionMark name={a.institution ?? a.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{a.name}{a.card_last4 ? ` •• ${a.card_last4}` : ""}</span>
                  {hasPartner ? <span className="mt-1 block"><VisibilityBadge kind={a.visibility} /></span> : null}
                </span>
                {a.balance_cents !== null ? <Amount cents={Math.abs(a.balance_cents)} className="text-[15px]" /> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {hasPartner && recentMine.length > 0 ? (
        <section className="grid gap-2">
          <SectionHeader title="Seus lançamentos" action={<Link href={`/monthly/${month}`} className="flex min-h-11 items-center text-sm font-medium">Ver todos</Link>} />
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {recentMine.map((t) => (
              <li key={t.id}>
                <Link href={`/transactions/${t.id}`} className="flex min-h-14 items-center gap-3 px-4 py-3 text-foreground no-underline hover:text-foreground">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{transactionLabel(t)}</span>
                    <span className="mt-1 block"><PrivacyBadge tx={t} today={today} partnerName={household!.partner!.name} /></span>
                  </span>
                  <Amount cents={t.amount_cents} type={t.type} className="text-[15px]" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {pending.length > 0 ? (
        <Link href="/couple/approvals" className="flex min-h-14 items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-foreground no-underline hover:text-foreground">
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium">Combinados do casal</span>
            <span className="block text-[13px] text-muted-foreground">{pending.length === 1 ? "1 compra esperando sua resposta" : `${pending.length} compras esperando sua resposta`}</span>
          </span>
          <ChevronRightIcon className="size-4 text-muted-foreground" />
        </Link>
      ) : null}

      <HomeAnalytics
        month={month}
        today={today}
        history={myHistory}
        tags={tags}
        bills={bills.filter(mine)}
        subscriptions={subscriptions.filter(mine)}
        balanceCents={withBalance.reduce((s, a) => s + (a.balance_cents ?? 0), 0)}
        hasBalance={withBalance.length > 0}
      />
    </>
  );
}

function PrivacyBadge({ tx, today, partnerName }: { tx: Transaction; today: string; partnerName: string }) {
  if (tx.surprise_until && tx.surprise_until >= today) return <VisibilityBadge kind="surprise" until={formatDayShort(tx.surprise_until)} />;
  if (tx.free_money) return <span className="text-[12px] text-muted-foreground">Dinheiro livre · só total</span>;
  if (tx.privacy === "hidden") return <VisibilityBadge kind="hidden" partnerName={partnerName} />;
  if (tx.privacy === "category_only") return <VisibilityBadge kind="category_only" partnerName={partnerName} />;
  return <span className="text-[12px] text-muted-foreground">{formatDayShort(tx.transaction_date)}</span>;
}

async function NossoHome({ userId, ctx, today, month, lowerMonth, historyStart }: { userId: string; ctx: Ctx; today: string; month: string; lowerMonth: string; historyStart: string }) {
  const household = ctx.household!;
  const partner = household.partner!;
  const [budget, invoices, goals, pending, history, plans] = await Promise.all([
    budgetOverview(household.id, ctx.facts, ctx.categories),
    cardInvoices(household, ctx.accounts, today),
    goalsOverview(household.id, today),
    pendingApprovalsFor(household.id, userId),
    loadSharedHistory(ctx.memberIds, historyStart, monthBounds(month).end),
    loadSharedPlans(ctx.memberIds),
  ]);
  const shared = [
    ...ctx.accounts.filter((a) => a.user_id === userId && a.visibility !== "private").map((a) => ({ id: a.id, name: a.name, owner: household.me.name, visibility: a.visibility as "totals" | "details", balance: a.balance_cents })),
    ...partnerView(household, ctx.accounts, ctx.facts, today).map((v) => ({ id: v.id, name: v.name, owner: partner.name, visibility: v.visibility, balance: v.balanceCents })),
  ];
  const invoice = invoices.find((i) => i.items.length > 0) ?? invoices[0];
  const activeGoals = goals.filter((g) => g.status === "active").slice(0, 2);
  const people = household.me.color === "blue" ? [household.me, partner] : [partner, household.me];
  const previousMonth = addMonths(`${month}-01`, -1).slice(0, 7);
  const sharedBalance = shared.reduce((s, a) => s + (a.balance ?? 0), 0);

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-medium tracking-[-0.02em]">Nosso {lowerMonth}</h1>
        <UpdatedAt at={ctx.syncedAt} />
      </header>

      {budget.lines.length > 0 ? (
        <Link href="/couple/budget" className="block rounded-2xl border border-border bg-card p-5 text-foreground no-underline hover:text-foreground">
          <span className="label-mono">Livre no orçamento do lar</span>
          <p className={`tabular mt-2 text-[32px] font-medium tracking-[-0.03em] ${budget.freeCents < 0 ? "text-danger" : ""}`}>{formatBRL(budget.freeCents)}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">{formatBRL(budget.usedCents)} de {formatBRL(budget.limitCents)} usados · {daysLeftInMonth(today)} dias pela frente</p>
        </Link>
      ) : (
        <Link href="/couple/budget/setup" className="flex min-h-14 items-center gap-3 rounded-2xl border border-dashed border-[#cdd0ca] bg-card/60 px-4 py-3 text-foreground no-underline hover:text-foreground">
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium">Combinar o orçamento do lar</span>
            <span className="block text-[13px] text-muted-foreground">Quanto vocês querem gastar juntos por mês</span>
          </span>
          <ChevronRightIcon className="size-4 text-muted-foreground" />
        </Link>
      )}

      {pending[0] ? (
        <Link href={`/couple/approvals/${pending[0].id}`} className="block rounded-2xl border border-border bg-card p-5 text-foreground no-underline hover:text-foreground">
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-medium">{partner.name} quer combinar uma compra</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Pendente</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {pending[0].title} · {formatBRL(pending[0].amount_cents)}{pending[0].installments > 1 ? ` em ${pending[0].installments}x` : ""}.
            {household.approvalThresholdCents ? ` Acima do combinado de ${formatBRL(household.approvalThresholdCents)}.` : ""}
          </p>
          <span className="mt-3 inline-flex text-sm font-medium text-primary">Ver e responder</span>
        </Link>
      ) : null}

      {invoice ? (
        <Link href={`/cards?card=${invoice.card.id}`} className="block rounded-2xl border border-border bg-card p-5 text-foreground no-underline hover:text-foreground">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[15px] font-medium">Fatura {invoice.card.name}{invoice.card.card_last4 ? ` •• ${invoice.card.card_last4}` : ""}</span>
            <Amount cents={Math.max(0, invoice.settlement.totalCents)} className="text-[15px]" />
          </div>
          <p className="text-[13px] text-muted-foreground">Vence {formatDayShort(invoice.period.due)}</p>
          <div className="mt-3">
            <SegmentBar
              total={Math.max(1, invoice.settlement.totalCents)}
              label="Fatura dividida entre Nosso, você e seu par"
              segments={[
                { value: invoice.settlement.oursCents, color: "var(--primary)" },
                { value: invoice.holderIsMe ? invoice.settlement.holderCents : invoice.settlement.partnerCents, color: PERSON_BG[household.me.color] },
                { value: invoice.holderIsMe ? invoice.settlement.partnerCents : invoice.settlement.holderCents, color: PERSON_BG[partner.color] },
              ]}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-primary" />Nosso</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: PERSON_BG[household.me.color] }} />{household.me.name}</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: PERSON_BG[partner.color] }} />{partner.name}</span>
          </div>
          {invoice.settlement.partnerOwesCents > 0 ? (
            <p className="mt-3 text-sm">
              Acerto: {invoice.holderIsMe ? partner.name : household.me.name} → {invoice.holderIsMe ? household.me.name : partner.name} <span className="tabular font-medium">{formatBRL(invoice.settlement.partnerOwesCents)}</span>
            </p>
          ) : null}
        </Link>
      ) : null}

      <section className="grid gap-2">
        <SectionHeader title="Metas" action={<Link href="/couple/goals" className="flex min-h-11 items-center text-sm font-medium">{activeGoals.length ? "Ver todas" : "Criar"}</Link>} />
        {activeGoals.length > 0 ? (
          <div className="grid gap-3">
            {activeGoals.map((g) => (
              <Link key={g.id} href={`/couple/goals/${g.id}`} className="block rounded-2xl border border-border bg-card p-4 text-foreground no-underline hover:text-foreground">
                <div className="flex items-center justify-between text-[15px] font-medium"><span>{g.name}</span><span className="tabular">{g.progress.percent}%</span></div>
                <div className="mt-2">
                  <SegmentBar total={g.targetCents} label={`${formatBRL(g.savedCents)} de ${formatBRL(g.targetCents)}`} segments={people.map((p) => ({ value: g.byUser[p.userId] ?? 0, color: PERSON_BG[p.color] }))} />
                </div>
                <p className="mt-2 text-[13px] text-muted-foreground">
                  {formatBRL(g.savedCents)} de {formatBRL(g.targetCents)}
                  {g.progress.reachMonth ? ` · no ritmo, chegam em ${formatMonthLong(g.progress.reachMonth).toLowerCase()}` : g.deadline ? "" : " · sem prazo"}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState title="Nenhuma meta ainda">Viagem, reserva, reforma: <Link href="/couple/goals/new">crie a primeira</Link>.</EmptyState>
        )}
      </section>

      <Link href={`/couple/retro/${previousMonth}`} className="flex min-h-14 items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-foreground no-underline hover:text-foreground">
        <CoupleAvatars people={people} size={28} />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium">Retrospectiva de {monthName.format(new Date(`${previousMonth}-01T00:00:00Z`))}</span>
          <span className="block text-[13px] text-muted-foreground">O mês de vocês, sem placar</span>
        </span>
        <ChevronRightIcon className="size-4 text-muted-foreground" />
      </Link>

      <section className="grid gap-2">
        <SectionHeader title="Contas que vocês dividem" action={<Link href="/privacy/visibility" className="flex min-h-11 items-center text-sm font-medium">Visibilidade</Link>} />
        {shared.length > 0 ? (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {shared.map((a) => (
              <li key={a.id}>
                <Link href={`/accounts/${a.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 text-foreground no-underline hover:text-foreground">
                <InstitutionMark name={a.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{a.name} · {a.owner}</span>
                  <span className="mt-1 block"><VisibilityBadge kind={a.visibility} /></span>
                </span>
                {a.balance !== null ? <Amount cents={Math.abs(a.balance)} className="text-[15px]" /> : null}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="px-1 text-[13px] text-muted-foreground">Contas marcadas como “Só eu vejo” não aparecem aqui.</p>
      </section>

      <HomeAnalytics
        month={month}
        today={today}
        history={history}
        tags={plans.tags}
        bills={plans.bills}
        subscriptions={plans.subscriptions}
        balanceCents={sharedBalance}
        hasBalance={shared.some((a) => a.balance !== null)}
      />
    </>
  );
}
