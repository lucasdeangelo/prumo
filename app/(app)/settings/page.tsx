import Link from "next/link";

import { PageHeader } from "@/components/app/bits";
import { CoupleAvatars } from "@/components/app/couple";
import { ChevronRightIcon, SignOutIcon } from "@/components/app/icons";
import { Money } from "@/components/app/money";
import { requireUser } from "@/lib/auth/session";
import { listConnections } from "@/lib/application/connections";
import { loadAccounts, loadBudgets, loadSplitRules } from "@/lib/application/couple-data";
import { freeMoneyAllowance, getHousehold, listProposals } from "@/lib/application/household";
import { listPrivacyRules } from "@/lib/application/privacy";
import { sharePercentLabel } from "@/lib/domain/couple";
import { todayIn } from "@/lib/domain/dates";
import { getWhatsappLink } from "@/lib/repositories/reads";

export const metadata = { title: "Ajustes · Prumo" };

const since = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "America/Sao_Paulo" });

function Row({ href, title, detail, alert }: { href: string; title: string; detail?: React.ReactNode; alert?: boolean }) {
  return (
    <li>
      <Link href={href} className="flex min-h-14 items-center gap-3 px-4 py-3 text-foreground no-underline hover:bg-[#fafaf8] hover:text-foreground">
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium">{title}</span>
          {detail ? <span className={alert ? "block text-[13px] font-medium text-danger" : "block text-[13px] text-muted-foreground"}>{detail}</span> : null}
        </span>
        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2">
      <p className="label-mono px-1">{label}</p>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">{children}</ul>
    </section>
  );
}

export default async function SettingsPage() {
  const { user, db } = await requireUser();
  // What depends only on me starts together with the household lookup.
  const mine = Promise.all([loadAccounts([user.id]), listPrivacyRules(user.id), listConnections(user.id), getWhatsappLink(db, user.id)]);
  mine.catch(() => {});
  const household = await getHousehold(user.id);
  const partner = household?.partner ?? null;
  const [[accounts, rules, connections, link], budgets, proposals, splitRules, freeMine] = await Promise.all([
    mine,
    household ? loadBudgets(household.id) : Promise.resolve([]),
    household ? listProposals(household.id) : Promise.resolve([]),
    household ? loadSplitRules(household.id) : Promise.resolve(new Map()),
    household ? freeMoneyAllowance(household.id, user.id, todayIn()) : Promise.resolve(null),
  ]);
  const shared = accounts.filter((a) => a.visibility !== "private").length;
  const onlyMine = accounts.length - shared;
  const banks = new Set(connections.map((c) => c.institution));
  const failing = connections.filter((c) => c.state !== "ok").map((c) => c.institution);
  const manual = accounts.filter((a) => a.is_manual);
  const freeProposal = proposals.find((p) => p.kind === "free_money");
  const budgetTotal = budgets.reduce((s, b) => s + b.limitCents, 0);
  const equalIn = [...splitRules.entries()].filter(([, r]) => r.method === "equal").map(([c]) => c);
  const people = household && partner ? (household.me.color === "blue" ? [household.me, partner] : [partner, household.me]) : [];

  return (
    <div className="grid gap-5">
      <PageHeader title="Ajustes" subtitle={user.email ?? undefined} />

      {partner && household ? (
        <Link href="/couple" className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 text-foreground no-underline hover:text-foreground">
          <CoupleAvatars people={people} size={40} />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium">{people.map((p) => p.name).join(" e ")}</span>
            <span className="block text-[13px] text-muted-foreground">Perfil do casal · juntos no Prumo desde {since.format(new Date(household.createdAt))}</span>
          </span>
          <ChevronRightIcon className="size-4 text-muted-foreground" />
        </Link>
      ) : (
        <Link href="/couple" className="flex min-h-14 items-center gap-3 rounded-2xl border border-dashed border-[#cdd0ca] bg-card/60 px-4 py-3 text-foreground no-underline hover:text-foreground">
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium">Convidar seu par</span>
            <span className="block text-[13px] text-muted-foreground">Ou entrar com o código que você recebeu</span>
          </span>
          <ChevronRightIcon className="size-4 text-muted-foreground" />
        </Link>
      )}

      {partner ? (
        <Group label="Privacidade · só você">
          <Row href="/privacy/visibility" title={`O que ${partner.name} vê`} detail={`${shared} ${shared === 1 ? "conta compartilhada" : "contas compartilhadas"} · ${onlyMine} só sua${onlyMine === 1 ? "" : "s"}`} />
          <Row href="/privacy/rules" title="Regras de privacidade" detail={rules.length ? `${rules.length} ${rules.length === 1 ? "ativa" : "ativas"}` : "Nenhuma"} />
        </Group>
      ) : null}

      {partner && household ? (
        <Group label="Combinados do casal">
          <Row href="/couple/budget" title="Orçamento do lar" detail={budgetTotal ? <><Money cents={budgetTotal} /> por mês{household.budgetAlerts ? " · avisos em 80% e 100%" : ""}</> : "Ainda não combinado"} />
          <Row href="/couple/free-money" title="Dinheiro livre" detail={<>{freeMine !== null ? <><Money cents={freeMine} /> cada</> : "Ainda não combinado"}{freeProposal ? " · proposta aguardando" : ""}</>} />
          <Row href="/couple/approvals" title="Compras grandes" detail={household.approvalThresholdCents ? <>Conversar antes acima de <Money cents={household.approvalThresholdCents} /></> : "Sem limite combinado"} />
          <Row href="/couple" title="Divisão das contas" detail={`${household.defaultSplit === "income" ? `Pela renda (${sharePercentLabel(people[0] === household.me ? household.myShare : 1 - household.myShare)})` : "50/50"}${equalIn.length ? ` · 50/50 em ${equalIn.join(", ")}` : ""}`} />
          <Row href="/couple/goals" title="Metas" />
        </Group>
      ) : null}

      <Group label="Bancos e registro">
        <Row
          href="/settings/connections"
          title="Conexões (Open Finance)"
          detail={banks.size ? `${banks.size} ${banks.size === 1 ? "banco" : "bancos"}${failing.length ? ` · ${failing.join(", ")} ${failing.length === 1 ? "precisa de atenção" : "precisam de atenção"}` : ""}` : "Nenhum banco conectado"}
          alert={failing.length > 0}
        />
        <Row href="/settings/accounts" title="Contas manuais" detail={manual.length ? manual.slice(0, 2).map((a, i) => <span key={a.id}>{i > 0 ? " · " : ""}{a.name}{a.balance_cents !== null ? <> · <Money cents={a.balance_cents} /></> : null}</span>) : "Carteira, dinheiro guardado…"} />
        <Row href="/settings/whatsapp" title="WhatsApp" detail={link?.verified_at ? `Vinculado${link.phone_normalized && !link.chat_id?.endsWith("@lid") ? ` · ${link.phone_normalized}` : ""}` : "Registrar gastos e receber avisos"} />
        <Row href="/settings/tags" title="Tags e regras de categoria" detail={partner ? "Valem para os dois" : undefined} />
      </Group>

      <form action="/auth/signout" method="post">
        <button type="submit" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-medium text-muted-foreground hover:bg-muted">
          <SignOutIcon className="size-4" /> Sair
        </button>
      </form>
    </div>
  );
}
