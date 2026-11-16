import Link from "next/link";

import { PlusIcon } from "@/components/app/icons";
import { SpaceSwitcher, UpdatedAt, PERSON_BG, PERSON_TINT } from "@/components/app/couple";
import { AssetRow, ClassBreakdown, GainPill, GoalChip, HeroAmount, PeriodTabs } from "@/components/app/investments";
import { Money } from "@/components/app/money";
import { InvestmentEvolution } from "@/components/charts/investment-evolution";
import { Card, EmptyState } from "@/components/ui/card";
import { goalsOverview, lastSyncAt, type GoalOverview } from "@/lib/application/couple-data";
import { loadAssetGoals } from "@/lib/application/goal-links";
import { getHousehold } from "@/lib/application/household";
import { loadIncome, loadInvestments, loadSnapshots, toPortfolioItem, type InvestmentRow } from "@/lib/application/investments";
import { requireUser } from "@/lib/auth/session";
import { addDays, formatMonthShort, monthOf, todayIn } from "@/lib/domain/dates";
import { assetClass, evolution, gainSince, isOpen, partnerInvestmentsView, portfolioSummary } from "@/lib/domain/investments";
import { formatBRL } from "@/lib/domain/money";
import { currentSpace } from "@/lib/space";
import { cn } from "@/lib/utils";

export const metadata = { title: "Investimentos · Prumo" };

type Period = "6m" | "1a" | "tudo";
type Filter = "todos" | "fixa" | "variavel";

const PERIODS: Array<[Period, string]> = [["6m", "6M"], ["1a", "1A"], ["tudo", "Tudo"]];
const FILTERS: Array<[Filter, string]> = [["todos", "Todos"], ["fixa", "Renda fixa"], ["variavel", "Variável"]];

function href(period: Period, filter: Filter) {
  const q = new URLSearchParams();
  if (period !== "6m") q.set("periodo", period);
  if (filter !== "todos") q.set("filtro", filter);
  const s = q.toString();
  return s ? `/investments?${s}` : "/investments";
}

export default async function InvestmentsPage({ searchParams }: { searchParams: Promise<{ periodo?: string; filtro?: string }> }) {
  const params = await searchParams;
  const period: Period = params.periodo === "1a" || params.periodo === "tudo" ? params.periodo : "6m";
  const filter: Filter = params.filtro === "fixa" || params.filtro === "variavel" ? params.filtro : "todos";
  const { user } = await requireUser();
  const [household, space] = await Promise.all([getHousehold(user.id), currentSpace()]);
  const me = household?.me ?? { userId: user.id, name: user.name?.split(" ")[0] ?? "Você", initial: (user.name ?? "V").charAt(0).toUpperCase(), color: "blue" as const, incomeCents: null, pixKey: null };
  const partner = household?.partner ?? null;
  const shown = space === "nosso" ? "nosso" : "meu";
  const memberIds = [user.id, partner?.userId].filter(Boolean) as string[];
  const today = todayIn();
  const [rows, syncedAt, ourGoals, myGoals] = await Promise.all([
    loadInvestments(memberIds),
    lastSyncAt(memberIds),
    household ? goalsOverview(household.id, today) : Promise.resolve([]),
    household ? goalsOverview(household.id, today, { ownerId: user.id }) : Promise.resolve([]),
  ]);
  const assetGoals = await loadAssetGoals(rows.map((r) => r.id));
  // An asset counting for a couple goal is shared with both on purpose.
  const inCoupleGoals = new Set([...assetGoals].filter(([, list]) => list.some((g) => g.scope === "ours")).map(([id]) => id));
  const chip: ChipFor = (r) => <GoalChip goals={assetGoals.get(r.id) ?? []} viewerId={user.id} ownerId={r.user_id} open={isOpen(r)} />;

  // Meu: what is mine and not shared. Nosso: what either of us marked as the couple's.
  const mine = rows.filter((r) => r.user_id === user.id && (!partner || r.scope === "mine"));
  const ours = partner ? rows.filter((r) => r.scope === "ours") : [];
  const partnerMine = partner ? rows.filter((r) => r.user_id === partner.userId && r.scope === "mine") : [];

  return (
    <div className="grid gap-4">
      <SpaceSwitcher
        space={shown}
        me={me}
        partner={partner}
        returnTo={href(period, filter)}
        hideValues
        trailing={
          <Link href="/investments/new" aria-label="Novo investimento" className="-my-1 -mr-3 flex size-11 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-muted hover:text-foreground">
            <PlusIcon className="size-[22px]" strokeWidth={1.8} />
          </Link>
        }
      />
      {shown === "nosso" ? (
        partner ? (
          <NossoView
            rows={ours}
            meName={me.name}
            partnerName={partner.name}
            myTotal={portfolioSummary(mine.map(toPortfolioItem)).totalCents}
            partnerView={partnerInvestmentsView(partnerMine.map(toPortfolioItem), inCoupleGoals)}
            goals={ourGoals}
            chip={chip}
            partnerRows={partnerMine}
            partnerId={partner.userId}
            period={period}
            filter={filter}
            today={today}
            syncedAt={syncedAt}
          />
        ) : (
          <Card className="grid gap-3">
            <p className="label-mono">Espaço Nosso</p>
            <p className="text-sm text-muted-foreground">Com seu par no Prumo, os investimentos que vocês marcarem como Nosso aparecem aqui para os dois.</p>
            <Link href="/couple" className="inline-flex min-h-12 items-center justify-center rounded-full bg-primary px-6 text-[15px] font-medium text-primary-foreground hover:bg-primary-press hover:text-primary-foreground">Convidar meu par</Link>
          </Card>
        )
      ) : (
        <MeuView rows={mine} color={me.color} partnerName={partner?.name ?? null} period={period} filter={filter} today={today} syncedAt={syncedAt} goals={myGoals} inCoupleGoals={inCoupleGoals} chip={chip} />
      )}
    </div>
  );
}

type ChipFor = (row: InvestmentRow) => React.ReactNode;

async function MeuView({ rows, color, partnerName, period, filter, today, syncedAt, goals, inCoupleGoals, chip }: { rows: InvestmentRow[]; color: "blue" | "terracotta"; partnerName: string | null; period: Period; filter: Filter; today: string; syncedAt: string | null; goals: GoalOverview[]; inCoupleGoals: Set<string>; chip: ChipFor }) {
  const open = rows.filter(isOpen);
  const summary = portfolioSummary(rows.map(toPortfolioItem));
  const snapshots = await loadSnapshots(open.map((r) => r.id));
  const points = evolution(snapshots, today, period);
  const seen = partnerInvestmentsView(rows.map(toPortfolioItem), inCoupleGoals);
  const seenText = !partnerName
    ? null
    : seen.totalCents === null
      ? `Só eu vejo · ${partnerName} não vê seus investimentos`
      : seen.assets.length > 0
        ? `${partnerName} vê ${formatBRL(seen.totalCents)} e ${seen.assets.length === 1 ? "1 ativo" : `${seen.assets.length} ativos`} com detalhes`
        : `Só totais · ${partnerName} vê ${formatBRL(seen.totalCents)}, não os ativos`;

  return (
    <>
      <div className="grid gap-1.5">
        <h1 className="text-2xl font-medium tracking-[-0.02em]">Meus investimentos</h1>
        {seenText ? (
          <span className="inline-flex items-center gap-1 justify-self-start rounded-full px-2 py-[3px] text-[11px] font-medium" style={{ background: PERSON_TINT[color], color: PERSON_BG[color] }}>
            <span className="money"><span className="money-value">{seenText}</span><span className="money-mask">{partnerName} vê só o que você compartilha</span></span>
          </span>
        ) : null}
      </div>
      {open.length === 0 ? (
        <>
          <Empty withdrawn={rows.length - open.length} />
          <MyGoals goals={goals} color={color} />
          {rows.length > 0 ? <AssetList rows={rows} filter="todos" period={period} showFilter={false} chip={chip} /> : null}
        </>
      ) : (
        <>
          <section className="grid gap-4 rounded-2xl border border-border bg-card p-[18px]">
            <div className="grid gap-1.5">
              <span className="label-mono">Meu patrimônio</span>
              <HeroAmount cents={summary.totalCents} />
              <span className="flex flex-wrap items-center gap-2 text-[13px]">
                <GainPill cents={summary.gainCents} ratio={summary.gainRatio} />
                <span className="text-muted-foreground">desde o início</span>
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 border-t border-border pt-3.5">
              <Figure label="Aplicado"><Money cents={summary.investedCents} /></Figure>
              <Figure label="Ganhos" className="text-[#2B7350]">+<Money cents={summary.gainsCents} /></Figure>
              <Figure label="Perdas" className={summary.lossesCents < 0 ? "text-[#A8352A]" : undefined}>{summary.lossesCents < 0 ? "−" : ""}<Money cents={Math.abs(summary.lossesCents)} /></Figure>
            </div>
          </section>
          <Evolution points={points} period={period} filter={filter} valueLabel="Patrimônio" />
          <ClassBreakdown classes={summary.classes} />
          <MyGoals goals={goals} color={color} />
          <AssetList rows={rows} filter={filter} period={period} showFilter={false} chip={chip} />
        </>
      )}
      <Footer syncedAt={syncedAt} />
    </>
  );
}

async function NossoView({
  rows,
  meName,
  partnerName,
  myTotal,
  partnerView,
  partnerRows,
  partnerId,
  period,
  filter,
  today,
  syncedAt,
  goals,
  chip,
}: {
  rows: InvestmentRow[];
  meName: string;
  partnerName: string;
  partnerId: string;
  myTotal: number;
  partnerView: ReturnType<typeof partnerInvestmentsView>;
  partnerRows: InvestmentRow[];
  period: Period;
  filter: Filter;
  today: string;
  syncedAt: string | null;
  goals: GoalOverview[];
  chip: ChipFor;
}) {
  const open = rows.filter(isOpen);
  const summary = portfolioSummary(rows.map(toPortfolioItem));
  const monthStart = `${monthOf(today)}-01`;
  const [snapshots, income] = await Promise.all([loadSnapshots(open.map((r) => r.id)), loadIncome(open.map((r) => r.id), addDays(today, -365))]);
  const points = evolution(snapshots, today, period);
  const monthGain = gainSince(snapshots, rows.map(toPortfolioItem), monthStart);
  const sharedDetails = partnerRows.filter((r) => partnerView.assets.some((a) => a.id === r.id));

  return (
    <>
      <div className="grid gap-1">
        <h1 className="text-2xl font-medium tracking-[-0.02em]">Investimentos</h1>
        <p className="text-xs text-muted-foreground">Do casal · {meName} e {partnerName} veem tudo</p>
      </div>
      {open.length === 0 ? (
        <EmptyState title="Nenhum investimento no Nosso">Abra um investimento seu e escolha “Nosso” para que ele conte para os dois.</EmptyState>
      ) : (
        <>
          <section className="grid gap-4 rounded-2xl bg-primary p-5 text-white">
            <div className="grid gap-1.5">
              <span className="label-mono text-[#CFE0D8]">Patrimônio do casal</span>
              <HeroAmount cents={summary.totalCents} />
              <span className="flex flex-wrap items-center gap-2 text-[13px]">
                <GainPill cents={summary.gainCents} ratio={summary.gainRatio} tone="onPrimary" />
                <span className="text-[#CFE0D8]">desde o início</span>
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 border-t border-white/20 pt-3.5 text-[#CFE0D8]">
              <Figure label="Aplicado" valueClass="text-white"><Money cents={summary.investedCents} /></Figure>
              <Figure label={`Rendeu em ${formatMonthShort(monthOf(today))}`} valueClass="text-white">
                {monthGain === null ? "—" : <>{monthGain >= 0 ? "+" : "−"}<Money cents={Math.abs(monthGain)} /></>}
              </Figure>
              <Figure label="Proventos" valueClass="text-white"><Money cents={income} /></Figure>
            </div>
          </section>
          <Evolution points={points} period={period} filter={filter} valueLabel="Patrimônio" />
          <ClassBreakdown classes={summary.classes} note={open.length === 1 ? "1 investimento" : `${open.length} investimentos`} />
          <ByGoal goals={goals} rows={rows} />
          <AssetList rows={rows} filter={filter} period={period} showFilter partnerId={partnerId} partnerName={partnerName} meName={meName} chip={chip} />
        </>
      )}
      <section className="grid gap-2">
        <h2 className="px-1 text-base font-semibold">Fora do Nosso</h2>
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          <li className="flex items-center justify-between gap-3 px-4 py-3.5 text-[13px]">
            <span><span className="font-medium">Você</span><span className="block text-xs text-muted-foreground">Seus investimentos no Meu</span></span>
            <span className="tabular font-medium"><Money cents={myTotal} /></span>
          </li>
          <li className="flex items-center justify-between gap-3 px-4 py-3.5 text-[13px]">
            <span>
              <span className="font-medium">{partnerName}</span>
              <span className="block text-xs text-muted-foreground">{partnerView.totalCents === null ? "Não compartilha os investimentos do Meu" : sharedDetails.length > 0 ? "Total e os ativos que compartilha" : "Só o total"}</span>
            </span>
            <span className="tabular font-medium">{partnerView.totalCents === null ? "—" : <Money cents={partnerView.totalCents} />}</span>
          </li>
        </ul>
        {sharedDetails.length > 0 ? (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {sharedDetails.map((r) => <AssetRow key={r.id} row={r} footnote={<><span className="text-xs text-muted-foreground">De {partnerName}</span>{chip(r)}</>} />)}
          </ul>
        ) : null}
      </section>
      <Footer syncedAt={syncedAt} />
    </>
  );
}

function Figure({ label, children, className, valueClass }: { label: string; children: React.ReactNode; className?: string; valueClass?: string }) {
  return (
    <span className="flex flex-col gap-0.5 text-xs">
      <span className={valueClass ? undefined : "text-muted-foreground"}>{label}</span>
      <span className={cn("tabular text-[15px] font-medium", valueClass ?? "text-foreground", className)}>{children}</span>
    </span>
  );
}

function Evolution({ points, period, filter, valueLabel }: { points: ReturnType<typeof evolution>; period: Period; filter: Filter; valueLabel: string }) {
  const first = points[0];
  const last = points.at(-1);
  return (
    <section className="grid gap-2.5 rounded-2xl border border-border bg-card p-[18px]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Evolução</h2>
        <PeriodTabs value={period} options={PERIODS} hrefFor={(v) => href(v as Period, filter)} />
      </div>
      {points.length >= 2 && first && last ? (
        <InvestmentEvolution
          data={points}
          valueLabel={valueLabel}
          ariaLabel={`${valueLabel} de ${formatBRL(first.amountCents)} para ${formatBRL(last.amountCents)}; aplicado de ${formatBRL(first.investedCents)} para ${formatBRL(last.investedCents)}`}
        />
      ) : (
        <p className="text-[13px] text-muted-foreground">A evolução aparece conforme o Prumo acompanha seus investimentos: um ponto a cada atualização do banco.</p>
      )}
    </section>
  );
}

function AssetList({
  rows,
  filter,
  period,
  showFilter,
  partnerId,
  partnerName,
  meName,
  chip,
}: {
  rows: InvestmentRow[];
  filter: Filter;
  period: Period;
  showFilter: boolean;
  partnerId?: string;
  partnerName?: string;
  meName?: string;
  chip: ChipFor;
}) {
  const open = rows.filter(isOpen);
  const visible = open.filter((r) => {
    if (filter === "todos" || !showFilter) return true;
    const cls = assetClass(r.type, r.subtype);
    return filter === "fixa" ? cls === "fixed" : cls !== "fixed";
  });
  const withdrawn = rows.filter((r) => !isOpen(r));
  const owner = (r: InvestmentRow) => (partnerName && meName ? (r.user_id === partnerId ? partnerName : meName) : null);
  return (
    <section className="grid gap-2.5">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-base font-semibold">Investimentos</h2>
        <span className="text-xs text-muted-foreground">{open.length === 1 ? "1 ativo" : `${open.length} ativos`}</span>
      </div>
      {showFilter ? (
        <nav aria-label="Filtrar" className="grid grid-cols-3 gap-1 rounded-full bg-muted p-1">
          {FILTERS.map(([v, label]) => (
            <Link
              key={v}
              href={href(period, v)}
              scroll={false}
              aria-current={v === filter ? "page" : undefined}
              className={cn(
                "flex min-h-[34px] items-center justify-center rounded-full text-[13px] no-underline",
                v === filter ? "bg-card font-semibold text-foreground shadow-[0_1px_3px_rgba(18,21,18,0.1)] hover:text-foreground" : "font-medium text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
      ) : null}
      {visible.length > 0 ? (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {visible.map((r) => <AssetRow key={r.id} row={r} footnote={<>{owner(r) ? <span className="text-xs text-muted-foreground">De {owner(r)}</span> : null}{chip(r)}</>} />)}
        </ul>
      ) : open.length > 0 ? (
        <EmptyState title={filter === "fixa" ? "Nenhum investimento de renda fixa" : "Nenhum investimento de renda variável"} />
      ) : null}
      {withdrawn.length > 0 ? (
        <details className="rounded-2xl border border-border bg-card">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Resgatados ({withdrawn.length})</summary>
          <ul className="divide-y divide-border border-t border-border">
            {withdrawn.map((r) => <AssetRow key={r.id} row={r} />)}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function Empty({ withdrawn }: { withdrawn: number }) {
  return (
    <EmptyState title="Nenhum investimento aberto">
      <p>
        Os investimentos chegam pelo Open Finance, junto com suas contas.{withdrawn > 0 ? ` Por enquanto o banco mandou ${withdrawn === 1 ? "1 investimento já resgatado" : `${withdrawn} investimentos já resgatados`}.` : ""} Se você tem
        investimentos que não aparecem, confira no MeuPluggy se eles foram autorizados para o banco onde estão.
      </p>
      <span className="mt-3 flex flex-wrap justify-center gap-2">
        <Link href="/settings/connections" className="inline-flex min-h-11 items-center justify-center rounded-full border border-foreground px-5 text-[14px] font-medium text-foreground hover:text-foreground">
          Ver conexões
        </Link>
        <Link href="/investments/new" className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 text-[14px] font-medium text-primary-foreground hover:bg-primary-press hover:text-primary-foreground">
          Cadastrar à mão
        </Link>
      </span>
    </EmptyState>
  );
}

function Footer({ syncedAt }: { syncedAt: string | null }) {
  return (
    <div className="grid justify-items-center gap-1 py-1 text-center">
      <UpdatedAt at={syncedAt} />
      <p className="text-xs text-muted-foreground">Valores brutos, antes do IR. Ações e fundos mudam todo dia.</p>
    </div>
  );
}

const monthYearShort = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric", timeZone: "UTC" });
const shortMonth = (deadline: string) => monthYearShort.format(new Date(`${deadline}T00:00:00Z`)).replace(". de ", "/").replace(" de ", "/");

/** "Minhas metas" (InvMeu): personal goals, only ever shown to their owner. */
function MyGoals({ goals, color }: { goals: GoalOverview[]; color: "blue" | "terracotta" }) {
  const open = goals.filter((g) => g.status === "active");
  return (
    <section className="grid gap-2.5">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-base font-semibold">Minhas metas</h2>
        <Link href="/couple/goals/new?de=meu" className="text-[15px] font-medium text-primary hover:text-primary-press">Nova meta</Link>
      </div>
      {open.length === 0 ? (
        <p className="px-1 text-[13px] text-muted-foreground">Aposentadoria, curso, um sonho só seu: crie uma meta e faça seus investimentos contarem para ela.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {open.map((g) => (
            <Link key={g.id} href={`/couple/goals/${g.id}`} className="grid content-start gap-2 rounded-2xl border border-border bg-card p-3.5 text-foreground no-underline hover:text-foreground">
              <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: color === "blue" ? "#2B4579" : "#8A4320" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.5" /></svg>
                <span className="truncate">{g.name}</span>
              </span>
              <span className="tabular text-lg font-medium"><Money cents={g.savedCents} /></span>
              <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-border"><span className="block h-full rounded-full" style={{ width: `${Math.min(100, g.progress.percent)}%`, background: PERSON_BG[color] }} /></span>
              <span className="tabular text-xs text-muted-foreground">{g.progress.percent}% de <Money cents={g.targetCents} />{g.deadline ? ` · ${shortMonth(g.deadline)}` : ""}</span>
              {g.earnedCents > 0 ? <span className="tabular text-xs text-[#2B7350]">+<Money cents={g.earnedCents} /> rendidos</span> : null}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

/** "Por meta" (InvNosso): couple goals with what counts for them, then what is free. */
function ByGoal({ goals, rows }: { goals: GoalOverview[]; rows: InvestmentRow[] }) {
  const open = goals.filter((g) => g.status === "active" || g.status === "pending");
  const linked = new Set(open.flatMap((g) => g.investmentIds));
  const free = rows.filter((r) => isOpen(r) && !linked.has(r.id));
  if (open.length === 0) return null;
  return (
    <section className="grid gap-2.5">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-base font-semibold">Por meta</h2>
        <Link href="/couple/goals" className="text-[15px] font-medium text-primary hover:text-primary-press">Metas</Link>
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {open.map((g) => (
          <li key={g.id}>
            <Link href={`/couple/goals/${g.id}`} className="grid gap-1.5 px-4 py-3.5 text-foreground no-underline hover:bg-[#F8F9F6] hover:text-foreground">
              <span className="flex items-center justify-between gap-3 text-[13px] font-medium"><span className="truncate">{g.name}</span><span className="tabular"><Money cents={g.savedCents} /></span></span>
              <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-border"><span className="block h-full rounded-full bg-primary" style={{ width: `${Math.min(100, g.progress.percent)}%` }} /></span>
              <span className="text-xs text-muted-foreground">
                {g.investmentIds.length === 0 ? "Sem investimentos" : g.investmentIds.length === 1 ? "1 investimento" : `${g.investmentIds.length} investimentos`} · {g.progress.percent}% de <Money cents={g.targetCents} />
                {g.earnedCents > 0 ? <> · <span className="text-[#2B7350]">+<Money cents={g.earnedCents} /> rendidos</span></> : null}
              </span>
            </Link>
          </li>
        ))}
        {free.length > 0 ? (
          <li className="grid gap-0.5 px-4 py-3.5">
            <span className="flex items-center justify-between gap-3 text-[13px] font-medium"><span>Sem meta</span><span className="tabular"><Money cents={free.reduce((s, r) => s + r.amount_cents, 0)} /></span></span>
            <span className="text-xs text-muted-foreground">{free.slice(0, 3).map((r) => r.name).join(", ")}{free.length > 3 ? "…" : ""} · livres para resgatar ou vincular</span>
          </li>
        ) : null}
      </ul>
    </section>
  );
}
