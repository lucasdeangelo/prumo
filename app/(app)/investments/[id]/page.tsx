import Link from "next/link";
import { notFound } from "next/navigation";

import { investmentPreferenceAction } from "@/app/(app)/investments/actions";
import { PERSON_BG, PERSON_TINT } from "@/components/app/couple";
import { AssetTile, GainPill, GainText, HeroAmount, PeriodTabs, describeAsset } from "@/components/app/investments";
import { Money } from "@/components/app/money";
import { InvestmentEvolution } from "@/components/charts/investment-evolution";
import { goalsOverview, type GoalOverview } from "@/lib/application/couple-data";
import { loadAssetGoals, type AssetGoal } from "@/lib/application/goal-links";
import { getHousehold } from "@/lib/application/household";
import { valuation } from "@/lib/application/manual-investments";
import { ratesSnapshot } from "@/lib/application/market-rates";
import { deleteManualAction } from "@/app/(app)/investments/manual-actions";
import { estimateAtMaturity, ratesFromSnapshot, termsFromRow, type RatesSnapshot } from "@/lib/domain/fixed-income";
import { investmentForViewer, loadMovements, loadSnapshots, type InvestmentRow } from "@/lib/application/investments";
import { requireUser } from "@/lib/auth/session";
import { todayIn } from "@/lib/domain/dates";
import { assetClass, averageMonthlyGain, costBasis, evolution, gain, heldSince, incomeLast12Months, netIfWithdrawn, type MovementType } from "@/lib/domain/investments";
import { formatBRL } from "@/lib/domain/money";
import { cn } from "@/lib/utils";

export const metadata = { title: "Investimento · Prumo" };

type Period = "6m" | "1a" | "tudo";
const PERIODS: Array<[Period, string]> = [["6m", "6M"], ["1a", "1A"], ["tudo", "Tudo"]];

const dateBR = (iso: string) => iso.split("-").reverse().join("/");
const syncedFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

function movementLabel(type: MovementType, fixed: boolean): string {
  const labels: Record<MovementType, string> = {
    BUY: fixed ? "Aplicação" : "Compra",
    SELL: fixed ? "Resgate" : "Venda",
    INTEREST: fixed ? "Juros" : "Proventos",
    TAX: "Imposto",
    TRANSFER: "Transferência",
    AMORTIZATION: "Amortização",
    OTHER: "Outro",
  };
  return labels[type];
}

export default async function InvestmentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ periodo?: string }> }) {
  const [{ id }, { periodo }] = await Promise.all([params, searchParams]);
  const period: Period = periodo === "1a" || periodo === "tudo" ? periodo : "6m";
  const { user } = await requireUser();
  const household = await getHousehold(user.id);
  const found = /^[0-9a-f-]{36}$/i.test(id) ? await investmentForViewer(user.id, household, id) : null;
  if (!found) notFound();
  const { row, owner } = found;
  const today = todayIn();
  const [movements, snapshots, assetGoals, ourGoals, myGoals] = await Promise.all([
    loadMovements(row.id),
    loadSnapshots([row.id]),
    loadAssetGoals([row.id]).then((m) => m.get(row.id) ?? []),
    household ? goalsOverview(household.id, todayIn()) : Promise.resolve([]),
    household ? goalsOverview(household.id, todayIn(), { ownerId: user.id }) : Promise.resolve([]),
  ]);
  // The partner never learns about a personal goal; the owner sees all of theirs.
  const goalCards = assetGoals
    .filter((g) => g.scope === "ours" || g.ownerId === user.id)
    .map((g) => ({ link: g, goal: [...ourGoals, ...myGoals].find((o) => o.id === g.goalId) }))
    .filter((c): c is { link: AssetGoal; goal: GoalOverview } => Boolean(c.goal));

  const fixed = assetClass(row.type, row.subtype) === "fixed";
  // Today's rates, only to estimate the maturity of fixed income still open.
  const rates = fixed && row.due_date && row.status !== "withdrawn" ? await ratesSnapshot().catch(() => null) : null;
  const withdrawn = row.status === "withdrawn";
  const g = gain(row.amount_cents, row.invested_cents);
  const since = heldSince(movements, row.issue_date);
  const points = evolution(snapshots, today, period);
  const me = household?.me;
  const partner = household?.partner ?? null;
  const here = `/investments/${row.id}${period !== "6m" ? `?periodo=${period}` : ""}`;

  const chip =
    row.scope === "ours"
      ? { text: `Nosso · ${[me?.name, partner?.name].filter(Boolean).join(" e ")} veem`, bg: "#E3EDE8", fg: "#123329" }
      : !owner
        ? { text: `De ${partner?.name ?? "seu par"} · com detalhes`, bg: partner ? PERSON_TINT[partner.color] : "#ECEDE9", fg: partner ? PERSON_BG[partner.color] : "#5E625C" }
        : partner
          ? {
              text: row.visibility === "private" ? "Meu · só você vê" : row.visibility === "totals" ? `Meu · ${partner.name} vê só o total` : `Meu · ${partner.name} vê os detalhes`,
              bg: PERSON_TINT[me?.color ?? "blue"],
              fg: PERSON_BG[me?.color ?? "blue"],
            }
          : null;

  return (
    <div className="grid gap-4">
      <header className="flex items-center justify-between gap-2">
        <Link href="/investments" aria-label="Voltar" className="-ml-3 flex size-11 items-center justify-center rounded-full text-foreground hover:bg-muted hover:text-foreground">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        </Link>
        {chip ? <span className="inline-flex items-center rounded-full px-2 py-[3px] text-[11px] font-medium" style={{ background: chip.bg, color: chip.fg }}>{chip.text}</span> : null}
      </header>

      <div className="flex items-start gap-3 pt-1">
        <AssetTile type={row.type} subtype={row.subtype} size="lg" />
        <div className="grid min-w-0 gap-0.5">
          <h1 className="text-[22px] font-medium leading-tight tracking-[-0.02em]">{row.name}</h1>
          <p className="text-[13px] text-muted-foreground">{fixed ? "Renda fixa" : "Renda variável"} · {describeAsset(row)}</p>
        </div>
      </div>

      <div className="grid gap-2">
        <HeroAmount cents={row.amount_cents} />
        {g && !withdrawn ? (
          <span className="flex flex-wrap items-center gap-2 text-[13px]">
            <GainPill cents={g.cents} ratio={g.ratio} />
            <span className="text-muted-foreground">{fixed ? "rendimento bruto" : "desde a compra"}</span>
          </span>
        ) : withdrawn ? (
          <span className="text-[13px] text-muted-foreground">Resgatado. Os números abaixo são do último valor informado pelo banco.</span>
        ) : (
          <span className="text-[13px] text-muted-foreground">O banco não informou quanto foi aplicado.</span>
        )}
      </div>

      <section className="grid gap-2.5 rounded-2xl border border-border bg-card p-[18px]">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Evolução</h2>
          <PeriodTabs value={period} options={PERIODS} hrefFor={(v) => `/investments/${row.id}${v !== "6m" ? `?periodo=${v}` : ""}`} />
        </div>
        {points.length >= 2 ? (
          <InvestmentEvolution
            data={points}
            valueLabel="Valor bruto"
            investedLabel="Aplicado"
            color={g && g.cents < 0 && !withdrawn ? "#A8352A" : undefined}
            ariaLabel={`Valor de ${formatBRL(points[0].amountCents)} para ${formatBRL(points.at(-1)!.amountCents)}; aplicado de ${formatBRL(points[0].investedCents)} para ${formatBRL(points.at(-1)!.investedCents)}`}
          />
        ) : (
          <p className="text-[13px] text-muted-foreground">A evolução aparece conforme o Prumo acompanha este investimento: um ponto a cada atualização do banco.</p>
        )}
      </section>

      {fixed ? <FixedLines row={row} since={since} today={today} rates={rates} /> : <VariableLines row={row} movements={movements} today={today} />}

      <GoalCards cards={goalCards} owner={owner} open={!withdrawn} investmentId={row.id} dueDate={row.due_date} />

      {owner && row.source === "manual" && !withdrawn ? <ManualActions row={row} /> : null}

      {!fixed ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-border bg-card px-4 py-3.5 text-[13px] leading-[19px] text-muted-foreground">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" className="mt-px shrink-0"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
          <span>{g && g.cents < 0 ? "A perda só se realiza se você vender. " : ""}O Prumo mostra os números, não recomenda comprar ou vender.</span>
        </div>
      ) : null}

      <section className="grid gap-2.5">
        <h2 className="px-1 text-base font-semibold">Movimentações</h2>
        {movements.length > 0 ? (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {movements.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="text-[13px] font-medium">{movementLabel(m.type, fixed)}</span>
                  <span className="text-xs text-muted-foreground">{dateBR(m.date)}{m.quantity ? ` · ${m.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 8 })} ${row.subtype === "STOCK" ? "ações" : fixed ? "" : "cotas"}` : ""}</span>
                </span>
                <span className="tabular text-[13px] font-medium"><Money cents={m.amountCents} /></span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-2xl border border-border bg-card px-4 py-3.5 text-[13px]">
            {row.issue_date && row.invested_cents !== null ? (
              <p>Aplicado em <span className="tabular">{dateBR(row.issue_date)}</span>: <span className="tabular font-medium"><Money cents={row.invested_cents} /></span></p>
            ) : null}
            <p className="text-muted-foreground">O banco não enviou as movimentações deste investimento.</p>
          </div>
        )}
      </section>

      {owner ? <Preferences row={row} hasPartner={Boolean(partner)} partnerName={partner?.name ?? null} returnTo={here} /> : null}

      <div className="grid justify-items-center gap-1 py-1 text-center text-xs text-muted-foreground">
        {row.source === "pluggy" && row.synced_at ? <p>Atualizado pelo banco em {syncedFormat.format(new Date(row.synced_at)).replace(", ", " às ")}</p> : null}
        {row.source === "pluggy" && row.value_date ? <p>Valor informado pelo banco para {dateBR(row.value_date)}. Valores brutos, antes do IR.</p> : null}
        {row.source === "manual" ? (
          <p>
            Cadastrado por você.{" "}
            {fixed
              ? `Valor calculado pelo Prumo com as taxas do Banco Central${row.value_date ? ` até ${dateBR(row.value_date)}` : ""}.`
              : row.value_date
                ? `${row.type === "MUTUAL_FUND" ? "Valor" : "Cotação"} informado por você em ${dateBR(row.value_date)}.`
                : ""}{" "}
            Valores brutos, antes do IR.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Line({ label, children, strong, className }: { label: React.ReactNode; children: React.ReactNode; strong?: boolean; className?: string }) {
  return (
    <div className="flex justify-between gap-3 border-t border-border py-[11px] text-sm first:border-t-0">
      <span className={strong ? "font-medium" : "text-muted-foreground"}>{label}</span>
      <span className={cn("tabular text-right", strong && "font-medium", className)}>{children}</span>
    </div>
  );
}

function rateLabel(row: InvestmentRow): string | null {
  const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  if (row.rate_type && row.rate !== null) return row.rate_type === "IPCA" || row.rate_type === "IGPM" ? `${row.rate_type} + ${fmt(row.fixed_annual_rate ?? row.rate)}% a.a.` : `${fmt(row.rate)}% do ${row.rate_type}`;
  if (row.fixed_annual_rate !== null) return `${fmt(row.fixed_annual_rate)}% a.a.`;
  return null;
}

function FixedLines({ row, since, today, rates }: { row: InvestmentRow; since: string | null; today: string; rates: RatesSnapshot | null }) {
  const terms = termsFromRow(row);
  const atMaturity =
    rates && terms && row.due_date && row.due_date > today && row.status !== "withdrawn"
      ? estimateAtMaturity({ amountCents: row.amount_cents, investedCents: row.invested_cents ?? row.amount_cents, since: since ?? today, today, due: row.due_date, terms, rates: ratesFromSnapshot(rates), type: row.type, subtype: row.subtype })
      : null;
  const g = gain(row.amount_cents, row.invested_cents);
  const net = netIfWithdrawn({ type: row.type, subtype: row.subtype, amountCents: row.amount_cents, investedCents: row.invested_cents, taxesCents: row.taxes_cents, since, today });
  const monthly = g && since && g.cents > 0 ? averageMonthlyGain(g.cents, since, today) : null;
  const rate = rateLabel(row);
  const exempt = row.subtype === "LCI" || row.subtype === "LCA";
  return (
    <section className="rounded-2xl border border-border bg-card px-[18px] py-1.5">
      {row.invested_cents !== null ? <Line label="Valor aplicado"><Money cents={row.invested_cents} /></Line> : null}
      {g ? <Line label="Rendimento bruto"><GainText cents={g.cents} /></Line> : null}
      {exempt ? (
        <Line label="Imposto de renda">Isento</Line>
      ) : net.taxCents > 0 || !net.estimated ? (
        <Line label={net.estimated && net.rate !== null ? <>IR estimado <span className="text-xs">({(net.rate * 100).toLocaleString("pt-BR")}%)</span></> : "IR e IOF informados pelo banco"}>
          −<Money cents={net.taxCents} />
        </Line>
      ) : null}
      <Line label="Se resgatar hoje" strong><Money cents={net.netCents} /></Line>
      {monthly !== null ? <Line label="Rende por mês, em média">≈ <Money cents={monthly} /></Line> : null}
      {rate ? <Line label="Taxa contratada">{rate}</Line> : null}
      {row.due_date ? <Line label="Vencimento">{dateBR(row.due_date)}</Line> : null}
      {atMaturity ? (
        <Line label={<>No vencimento <span className="text-xs">(estimativa{atMaturity.taxRate > 0 ? ", já descontado o IR" : ""})</span></>}>≈ <Money cents={atMaturity.netCents} /></Line>
      ) : null}
    </section>
  );
}

function VariableLines({ row, movements, today }: { row: InvestmentRow; movements: Awaited<ReturnType<typeof loadMovements>>; today: string }) {
  const g = gain(row.amount_cents, row.invested_cents);
  const income = incomeLast12Months(movements, today);
  const basis = movements.length > 0 ? costBasis(movements) : null;
  const quantity = row.quantity ?? basis?.quantity ?? null;
  const average = row.invested_cents !== null && quantity ? Math.round(row.invested_cents / quantity) : null;
  return (
    <section className="rounded-2xl border border-border bg-card px-[18px] py-1.5">
      {row.invested_cents !== null ? <Line label="Total investido"><Money cents={row.invested_cents} /></Line> : null}
      {quantity ? <Line label="Quantidade">{quantity.toLocaleString("pt-BR", { maximumFractionDigits: 8 })}</Line> : null}
      {average !== null ? <Line label="Preço médio"><Money cents={average} /></Line> : null}
      {row.unit_value_cents !== null ? <Line label={`Cotação${row.value_date ? ` em ${dateBR(row.value_date).slice(0, 5)}` : ""}`}><Money cents={row.unit_value_cents} /></Line> : null}
      {g ? <Line label="Variação da cotação"><GainText cents={g.cents} /></Line> : null}
      {income > 0 ? <Line label="Dividendos e JCP (12 meses)"><GainText cents={income} /></Line> : null}
      {g ? (
        <Line label="Resultado com proventos" strong>
          <GainText cents={g.cents + income} ratio={row.invested_cents ? (g.cents + income) / row.invested_cents : null} />
        </Line>
      ) : null}
    </section>
  );
}

function Segment({ id, field, value, options, returnTo, label }: { id: string; field: "scope" | "visibility"; value: string; options: Array<[string, string]>; returnTo: string; label: string }) {
  return (
    <form action={investmentPreferenceAction} className="grid gap-1 rounded-full bg-muted p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} aria-label={label}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="field" value={field} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {options.map(([v, text]) => (
        <button
          key={v}
          type="submit"
          name="value"
          value={v}
          aria-pressed={v === value}
          className={cn("min-h-10 rounded-full text-[13px] font-medium transition", v === value ? "bg-card font-semibold text-foreground shadow-[0_1px_3px_rgba(18,21,18,0.1)]" : "text-muted-foreground hover:text-foreground")}
        >
          {text}
        </button>
      ))}
    </form>
  );
}

function Preferences({ row, hasPartner, partnerName, returnTo }: { row: InvestmentRow; hasPartner: boolean; partnerName: string | null; returnTo: string }) {
  return (
    <section className="grid gap-4 rounded-2xl border border-border bg-card p-[18px]">
      <h2 className="text-base font-semibold">Este investimento</h2>
      {hasPartner ? (
        <div className="grid gap-2">
          <p className="text-[13px] font-medium">De quem é</p>
          <Segment id={row.id} field="scope" value={row.scope} options={[["mine", "Meu"], ["ours", "Nosso"]]} returnTo={returnTo} label="De quem é" />
          <p className="text-xs text-muted-foreground">{row.scope === "ours" ? `Investimentos do Nosso aparecem para você e ${partnerName}, com os detalhes.` : "Só conta no seu espaço Meu."}</p>
        </div>
      ) : null}
      {hasPartner && row.scope === "mine" ? (
        <div className="grid gap-2">
          <p className="text-[13px] font-medium">O que {partnerName} vê</p>
          <Segment id={row.id} field="visibility" value={row.visibility} options={[["private", "Nada"], ["totals", "Só o total"], ["details", "Detalhes"]]} returnTo={returnTo} label={`O que ${partnerName} vê`} />
        </div>
      ) : null}
      {row.source === "manual" ? (
        <form action={deleteManualAction}>
          <input type="hidden" name="id" value={row.id} />
          <button type="submit" className="flex min-h-11 w-full items-center justify-center rounded-full px-2 text-[15px] font-medium text-primary hover:text-primary-press">
            Apagar este investimento
          </button>
          <p className="text-center text-xs text-muted-foreground">Some das telas, dos totais e das metas.</p>
        </form>
      ) : (
        <form action={investmentPreferenceAction}>
          <input type="hidden" name="id" value={row.id} />
          <input type="hidden" name="field" value="include" />
          <input type="hidden" name="value" value="false" />
          <input type="hidden" name="returnTo" value="/investments" />
          <button type="submit" className="flex min-h-11 w-full items-center justify-center rounded-full px-2 text-[15px] font-medium text-primary hover:text-primary-press">
            Não trazer este investimento
          </button>
          <p className="text-center text-xs text-muted-foreground">Some das telas e dos totais. Dá para trazer de volta em Ajustes → Conexões.</p>
        </form>
      )}
    </section>
  );
}

const monthYear = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

/** InvCDB / InvAcao: the goal this asset counts for, or the invitation to link one. */
function GoalCards({ cards, owner, open, investmentId, dueDate }: { cards: Array<{ link: AssetGoal; goal: GoalOverview }>; owner: boolean; open: boolean; investmentId: string; dueDate: string | null }) {
  const icon = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.5" /></svg>;
  if (cards.length === 0) {
    if (!owner || !open) return null;
    return (
      <Link href={`/investments/${investmentId}/link`} className="flex items-center gap-3 rounded-2xl border border-dashed border-[#C9CCC6] bg-card p-[18px] text-foreground no-underline hover:text-foreground">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-[10px] border border-dashed border-[#C9CCC6] text-muted-foreground">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>
        </span>
        <span className="grid min-w-0 flex-1 gap-0.5"><span className="text-[13px] font-medium">Sem meta</span><span className="text-xs text-muted-foreground">Vincule a uma meta sua ou do casal</span></span>
        <span className="text-[13px] font-medium text-primary">Vincular</span>
      </Link>
    );
  }
  return (
    <>
      {cards.map(({ link, goal }) => {
        const deadline = goal.deadline ? monthYear.format(new Date(`${goal.deadline}T00:00:00Z`)) : null;
        const beforeDeadline = dueDate && goal.deadline && dueDate <= goal.deadline;
        return (
          <section key={link.goalId} className={cn("grid gap-3.5 rounded-2xl border bg-card p-[18px]", link.scope === "ours" ? "border-[#C8DCD2]" : "border-border")}>
            <div className="flex items-center justify-between">
              <span className={cn("inline-flex items-center gap-[5px] rounded-full py-[3px] pl-1.5 pr-2 text-[11px] font-medium", link.scope === "ours" ? "bg-[#E3EDE8] text-[#123329]" : "bg-[#E6ECF6] text-[#2B4579]")}>
                {icon}{link.scope === "ours" ? "Meta do casal" : "Minha meta"}
              </span>
              {owner && open ? <Link href={`/investments/${investmentId}/link`} className="text-sm font-medium text-primary hover:text-primary-press">Trocar</Link> : null}
            </div>
            <Link href={`/couple/goals/${goal.id}`} className="grid gap-2 text-foreground no-underline hover:text-foreground">
              <span className="flex items-center justify-between gap-3"><span className="font-medium">{goal.name}</span><span className="tabular text-[13px] text-muted-foreground">{goal.progress.percent}%</span></span>
              <span aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-border"><span className="block h-full rounded-full bg-primary" style={{ width: `${Math.min(100, goal.progress.percent)}%` }} /></span>
              <span className="tabular text-xs text-muted-foreground">
                <Money cents={goal.savedCents} /> de <Money cents={goal.targetCents} />{deadline ? ` · prazo ${deadline}` : ""}
                {link.mode === "part" && link.partCents ? <> · este investimento conta <Money cents={link.partCents} /></> : null}
              </span>
            </Link>
            {beforeDeadline && open ? (
              <p className="flex items-start gap-2.5 rounded-xl bg-[#E3EDE8] px-3.5 py-3 text-[13px] leading-[19px] text-[#123329]">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-px shrink-0"><path d="M5 12l5 5 9-10" /></svg>
                <span>Vence em {dueDate!.split("-").reverse().join("/")}, antes do prazo da meta.</span>
              </p>
            ) : null}
          </section>
        );
      })}
    </>
  );
}

/** D4: movement buttons only on assets typed by hand; connected ones follow the bank. */
function ManualActions({ row }: { row: InvestmentRow }) {
  const how = valuation(row.type, row.subtype);
  const href = (tipo: string) => `/investments/${row.id}/movement?tipo=${tipo}`;
  const outline = "flex min-h-12 items-center justify-center rounded-full border border-foreground px-4 text-[15px] font-medium text-foreground no-underline hover:text-foreground";
  const solid = "flex min-h-12 items-center justify-center rounded-full bg-primary px-4 text-[15px] font-medium text-primary-foreground no-underline hover:bg-primary-press hover:text-primary-foreground";
  return (
    <div className="grid gap-2.5">
      <div className="grid grid-cols-2 gap-2.5">
        {how === "quote" ? (
          <>
            <Link href={href("venda")} className={outline}>Registrar venda</Link>
            <Link href={href("compra")} className={solid}>Registrar compra</Link>
          </>
        ) : (
          <>
            <Link href={href("resgate")} className={outline}>Resgatar</Link>
            <Link href={href("aporte")} className={solid}>Registrar aporte</Link>
          </>
        )}
      </div>
      {how === "quote" ? <Link href={href("cotacao")} className="flex min-h-11 items-center justify-center text-[15px] font-medium text-primary hover:text-primary-press">Atualizar cotação</Link> : null}
      {how === "total" ? <Link href={href("valor")} className="flex min-h-11 items-center justify-center text-[15px] font-medium text-primary hover:text-primary-press">Atualizar valor</Link> : null}
    </div>
  );
}
