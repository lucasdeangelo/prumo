import Link from "next/link";

import { SpaceSwitcher, UpdatedAt, PERSON_BG, PERSON_TINT } from "@/components/app/couple";
import { AssetRow, ClassBreakdown, GainPill, HeroAmount, PeriodTabs } from "@/components/app/investments";
import { Money } from "@/components/app/money";
import { InvestmentEvolution } from "@/components/charts/investment-evolution";
import { Card, EmptyState } from "@/components/ui/card";
import { lastSyncAt } from "@/lib/application/couple-data";
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
  const [rows, syncedAt] = await Promise.all([loadInvestments(memberIds), lastSyncAt(memberIds)]);
  const today = todayIn();

  // Meu: what is mine and not shared. Nosso: what either of us marked as the couple's.
  const mine = rows.filter((r) => r.user_id === user.id && (!partner || r.scope === "mine"));
  const ours = partner ? rows.filter((r) => r.scope === "ours") : [];
  const partnerMine = partner ? rows.filter((r) => r.user_id === partner.userId && r.scope === "mine") : [];

  return (
    <div className="grid gap-4">
      <SpaceSwitcher space={shown} me={me} partner={partner} returnTo={href(period, filter)} hideValues />
      {shown === "nosso" ? (
        partner ? (
          <NossoView
            rows={ours}
            meName={me.name}
            partnerName={partner.name}
            myTotal={portfolioSummary(mine.map(toPortfolioItem)).totalCents}
            partnerView={partnerInvestmentsView(partnerMine.map(toPortfolioItem))}
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
        <MeuView rows={mine} color={me.color} partnerName={partner?.name ?? null} period={period} filter={filter} today={today} syncedAt={syncedAt} />
      )}
    </div>
  );
}

async function MeuView({ rows, color, partnerName, period, filter, today, syncedAt }: { rows: InvestmentRow[]; color: "blue" | "terracotta"; partnerName: string | null; period: Period; filter: Filter; today: string; syncedAt: string | null }) {
  const open = rows.filter(isOpen);
  const summary = portfolioSummary(rows.map(toPortfolioItem));
  const snapshots = await loadSnapshots(open.map((r) => r.id));
  const points = evolution(snapshots, today, period);
  const seen = partnerInvestmentsView(rows.map(toPortfolioItem));
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
          {rows.length > 0 ? <AssetList rows={rows} filter="todos" period={period} showFilter={false} /> : null}
        </>
      ) : (
        <>
          <section className="grid gap-4 rounded-2xl border border-border border-t-[3px] bg-card p-[18px]" style={{ borderTopColor: PERSON_BG[color] }}>
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
          <AssetList rows={rows} filter={filter} period={period} showFilter={false} />
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
              <HeroAmount cents={summary.totalCents} dim="text-[#CFE0D8]" />
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
          <AssetList rows={rows} filter={filter} period={period} showFilter partnerId={partnerId} partnerName={partnerName} meName={meName} />
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
            {sharedDetails.map((r) => <AssetRow key={r.id} row={r} footnote={<span className="text-xs text-muted-foreground">De {partnerName} · com detalhes</span>} />)}
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
}: {
  rows: InvestmentRow[];
  filter: Filter;
  period: Period;
  showFilter: boolean;
  partnerId?: string;
  partnerName?: string;
  meName?: string;
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
          {visible.map((r) => <AssetRow key={r.id} row={r} footnote={owner(r) ? <span className="text-xs text-muted-foreground">De {owner(r)}</span> : undefined} />)}
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
      <Link href="/settings/connections" className="mt-3 inline-flex min-h-11 items-center justify-center rounded-full border border-foreground px-5 text-[14px] font-medium text-foreground hover:text-foreground">
        Ver conexões
      </Link>
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
