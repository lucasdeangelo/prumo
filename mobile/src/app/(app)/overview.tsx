import { formatDayShort, formatMonthLong } from "@domain/dates";
import { formatBRL } from "@domain/money";
import { View } from "react-native";

import { ChevronRightIcon } from "@/ui/icons";
import { Amount, BalanceCard, CoupleAvatars, InstitutionMark, SegmentBar, SpaceSwitcher, UpdatedAt, VisibilityBadge } from "@/ui/finance";
import { HomeAnalytics, type HomeAnalyticsView } from "@/ui/home";
import { Button, Card, EmptyState, Flex, Label, ListGroup, Pill, Press, Row, SectionHeader, TextLink, Title, Txt, go } from "@/ui/kit";
import { Screen } from "@/ui/screen";
import { colors, PERSON_BG, radius, type Person } from "@/ui/theme";

type Data = {
  space: "meu" | "nosso";
  me: Person;
  partner: Person | null;
  lowerMonth: string;
  month: string;
  today: string;
  mode: "meu" | "nosso" | "invite";
  meu?: MeuData;
  nosso?: NossoData;
};

type MeuData = {
  syncedAt: string | null;
  hasPartner: boolean;
  partnerName: string;
  freeMoney: { allowanceCents: number; usedCents: number; remainingCents: number; renewsMonth: string } | null;
  balanceCents: number;
  hasBalance: boolean;
  accounts: { id: string; name: string; institution: string | null; type: string | null; card_last4: string | null; visibility: "private" | "totals" | "details"; balance_cents: number | null }[];
  recentMine: { id: string; label: string; cents: number; type: "credit" | "debit"; date: string; surprise_until: string | null; free_money: boolean; privacy: string }[];
  pendingCount: number;
  analytics: HomeAnalyticsView;
};

type NossoData = {
  syncedAt: string | null;
  budget: { freeCents: number; usedCents: number; limitCents: number; daysLeft: number } | null;
  pending: { id: string; title: string; amount_cents: number; installments: number } | null;
  approvalThresholdCents: number | null;
  invoice: { cardId: string; title: string; totalCents: number; due: string; holderIsMe: boolean; settlement: { totalCents: number; oursCents: number; holderCents: number; partnerCents: number; partnerOwesCents: number } } | null;
  goals: { id: string; name: string; percent: number; reachMonth: string | null; deadline: string | null; savedCents: number; targetCents: number; byUser: Record<string, number> }[];
  previousMonth: string;
  previousMonthName: string;
  shared: { id: string; name: string; institution: string | null; owner: string; visibility: "totals" | "details"; balance: number | null }[];
  analytics: HomeAnalyticsView;
};

const VISIBILITY_SHORT = { private: "só eu vejo", totals: "só totais", details: "com detalhes" } as const;
const cardStyle = { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 20 } as const;
const rowCard = { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 16, paddingVertical: 12 } as const;

export default function Overview() {
  return (
    <Screen<Data> path="overview">
      {(d) => (
        <>
          <SpaceSwitcher me={d.me} partner={d.partner} hideValues />
          {d.mode === "invite" ? <InviteCard /> : d.mode === "nosso" ? <NossoHome d={d} n={d.nosso!} /> : <MeuHome d={d} m={d.meu!} />}
        </>
      )}
    </Screen>
  );
}

function InviteCard() {
  return (
    <Card style={{ gap: 12 }}>
      <Label>Espaço Nosso</Label>
      <Title>Finanças a dois, no prumo</Title>
      <Txt size={14} color={colors.mutedForeground}>
        Convide seu par para ver juntos o que é dos dois: orçamento do lar, fatura compartilhada, metas e combinados. Cada um continua dono do que é seu.
      </Txt>
      <Button href="/couple">Convidar meu par</Button>
    </Card>
  );
}

function PrivacyBadge({ tx, today, partnerName }: { tx: MeuData["recentMine"][number]; today: string; partnerName: string }) {
  if (tx.surprise_until && tx.surprise_until >= today) return <VisibilityBadge kind="surprise" until={formatDayShort(tx.surprise_until)} />;
  if (tx.free_money) return <Txt size={12} color={colors.mutedForeground}>Dinheiro livre · só total</Txt>;
  if (tx.privacy === "hidden") return <VisibilityBadge kind="hidden" partnerName={partnerName} />;
  if (tx.privacy === "category_only") return <VisibilityBadge kind="category_only" partnerName={partnerName} />;
  return <Txt size={12} color={colors.mutedForeground}>{formatDayShort(tx.date)}</Txt>;
}

function MeuHome({ d, m }: { d: Data; m: MeuData }) {
  const partnerName = m.partnerName;
  return (
    <>
      <View style={{ gap: 4 }}>
        <Title>Seu {d.lowerMonth}, {d.me.name}</Title>
        <UpdatedAt at={m.syncedAt} />
      </View>

      {m.freeMoney ? (
        <Press href="/couple/free-money" style={cardStyle}>
          <Row style={{ justifyContent: "space-between" }}>
            <Label>Dinheiro livre</Label>
            <VisibilityBadge kind="totals" />
          </Row>
          <Txt size={32} weight="medium" tabular tracking={-0.96} lh={40} style={{ marginTop: 8 }}>
            {formatBRL(m.freeMoney.remainingCents)} <Txt size={16} color={colors.mutedForeground}>restam</Txt>
          </Txt>
          <View style={{ marginTop: 12 }}>
            <SegmentBar segments={[{ value: m.freeMoney.usedCents, color: PERSON_BG[d.me.color] }]} total={m.freeMoney.allowanceCents} label={`${formatBRL(m.freeMoney.usedCents)} de ${formatBRL(m.freeMoney.allowanceCents)}`} />
          </View>
          <Txt size={13} color={colors.mutedForeground} style={{ marginTop: 8 }}>
            {formatBRL(m.freeMoney.usedCents)} de {formatBRL(m.freeMoney.allowanceCents)} · renova em 1º de {m.freeMoney.renewsMonth}. {partnerName.charAt(0).toUpperCase() + partnerName.slice(1)} vê só o total.
          </Txt>
        </Press>
      ) : null}

      <BalanceCard balanceCents={m.balanceCents} hasBalance={m.hasBalance} />

      {m.accounts.length > 0 ? (
        <View style={{ gap: 6 }}>
          <SectionHeader title="Suas contas" action={m.hasPartner ? <TextLink href="/privacy/visibility">Visibilidade</TextLink> : undefined} />
          <ListGroup>
            {m.accounts.map((a) => (
              <Press key={a.id} href={`/accounts/${a.id}`} style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 6 }} pressedStyle={{ backgroundColor: colors.rowPress }}>
                <InstitutionMark name={a.institution ?? a.name} size="sm" />
                <Txt size={14} numberOfLines={1} style={{ flex: 1 }}>
                  <Txt size={14} weight="medium">{a.type === "CREDIT" ? `Cartão ${a.institution ?? a.name}` : a.institution ?? a.name}</Txt>
                  {a.card_last4 ? <Txt size={14} color={colors.mutedForeground}> •• {a.card_last4}</Txt> : null}
                  {m.hasPartner ? <Txt size={12} color={colors.mutedForeground}> · {VISIBILITY_SHORT[a.visibility]}</Txt> : null}
                </Txt>
                {a.balance_cents !== null ? <Amount cents={a.type === "CREDIT" ? Math.abs(a.balance_cents) : a.balance_cents} size={14} /> : null}
              </Press>
            ))}
          </ListGroup>
        </View>
      ) : null}

      {m.hasPartner && m.recentMine.length > 0 ? (
        <View style={{ gap: 8 }}>
          <SectionHeader title="Seus lançamentos" action={<TextLink href={`/monthly/${d.month}`}>Ver todos</TextLink>} />
          <ListGroup>
            {m.recentMine.map((t) => (
              <Press key={t.id} href={`/transactions/${t.id}`} style={{ minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 }} pressedStyle={{ backgroundColor: colors.rowPress }}>
                <Flex>
                  <Txt size={15} weight="medium" numberOfLines={1}>{t.label}</Txt>
                  <View style={{ marginTop: 4 }}><PrivacyBadge tx={t} today={d.today} partnerName={partnerName} /></View>
                </Flex>
                <Amount cents={t.cents} type={t.type} />
              </Press>
            ))}
          </ListGroup>
        </View>
      ) : null}

      {m.pendingCount > 0 ? (
        <Press href="/couple/approvals" style={rowCard}>
          <Flex>
            <Txt size={15} weight="medium">Combinados do casal</Txt>
            <Txt size={13} color={colors.mutedForeground}>{m.pendingCount === 1 ? "1 compra esperando sua resposta" : `${m.pendingCount} compras esperando sua resposta`}</Txt>
          </Flex>
          <ChevronRightIcon size={16} color={colors.mutedForeground} />
        </Press>
      ) : null}

      <HomeAnalytics a={m.analytics} />
    </>
  );
}

function NossoHome({ d, n }: { d: Data; n: NossoData }) {
  const partner = d.partner!;
  const me = d.me;
  const people = me.color === "blue" ? [me, partner] : [partner, me];
  return (
    <>
      <View style={{ gap: 4 }}>
        <Title>Nosso {d.lowerMonth}</Title>
        <UpdatedAt at={n.syncedAt} />
      </View>

      {n.budget ? (
        <Press href="/couple/budget" style={cardStyle}>
          <Label>Livre no orçamento do lar</Label>
          <Txt size={32} weight="medium" tabular tracking={-0.96} lh={40} color={n.budget.freeCents < 0 ? colors.danger : colors.foreground} style={{ marginTop: 8 }}>{formatBRL(n.budget.freeCents)}</Txt>
          <Txt size={13} color={colors.mutedForeground} style={{ marginTop: 4 }}>{formatBRL(n.budget.usedCents)} de {formatBRL(n.budget.limitCents)} usados · {n.budget.daysLeft} dias pela frente</Txt>
        </Press>
      ) : (
        <Press href="/couple/budget/setup" style={[rowCard, { borderStyle: "dashed", borderColor: colors.dashed, backgroundColor: "rgba(255,255,255,0.6)" }]}>
          <Flex>
            <Txt size={15} weight="medium">Combinar o orçamento do lar</Txt>
            <Txt size={13} color={colors.mutedForeground}>Quanto vocês querem gastar juntos por mês</Txt>
          </Flex>
          <ChevronRightIcon size={16} color={colors.mutedForeground} />
        </Press>
      )}

      {n.pending ? (
        <Press href={`/couple/approvals/${n.pending.id}`} style={cardStyle}>
          <Row style={{ justifyContent: "space-between" }}>
            <Txt size={15} weight="medium" style={{ flex: 1 }}>{partner.name} quer combinar uma compra</Txt>
            <Pill>Pendente</Pill>
          </Row>
          <Txt size={14} color={colors.mutedForeground} style={{ marginTop: 8 }}>
            {n.pending.title} · {formatBRL(n.pending.amount_cents)}{n.pending.installments > 1 ? ` em ${n.pending.installments}x` : ""}.
            {n.approvalThresholdCents ? ` Acima do combinado de ${formatBRL(n.approvalThresholdCents)}.` : ""}
          </Txt>
          <Txt size={14} weight="medium" color={colors.primary} style={{ marginTop: 12 }}>Ver e responder</Txt>
        </Press>
      ) : null}

      {n.invoice ? (
        <Press href={`/cards?card=${n.invoice.cardId}`} style={cardStyle}>
          <Row gap={8} style={{ justifyContent: "space-between" }}>
            <Txt size={15} weight="medium" numberOfLines={1} style={{ flex: 1 }}>{n.invoice.title}</Txt>
            <Amount cents={Math.max(0, n.invoice.totalCents)} />
          </Row>
          <Txt size={13} color={colors.mutedForeground}>Vence {formatDayShort(n.invoice.due)}</Txt>
          <View style={{ marginTop: 12 }}>
            <SegmentBar
              total={Math.max(1, n.invoice.settlement.totalCents)}
              label="Fatura dividida entre Nosso, você e seu par"
              segments={[
                { value: n.invoice.settlement.oursCents, color: colors.primary },
                { value: n.invoice.holderIsMe ? n.invoice.settlement.holderCents : n.invoice.settlement.partnerCents, color: PERSON_BG[me.color] },
                { value: n.invoice.holderIsMe ? n.invoice.settlement.partnerCents : n.invoice.settlement.holderCents, color: PERSON_BG[partner.color] },
              ]}
            />
          </View>
          <Row gap={16} style={{ marginTop: 8, flexWrap: "wrap" }}>
            {[["Nosso", colors.primary], [me.name, PERSON_BG[me.color]], [partner.name, PERSON_BG[partner.color]]].map(([label, color]) => (
              <Row key={label} gap={6}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} /><Txt size={12} color={colors.mutedForeground}>{label}</Txt></Row>
            ))}
          </Row>
          {n.invoice.settlement.partnerOwesCents > 0 ? (
            <Txt size={14} style={{ marginTop: 12 }}>
              Acerto: {n.invoice.holderIsMe ? partner.name : me.name} → {n.invoice.holderIsMe ? me.name : partner.name} <Txt size={14} weight="medium" tabular>{formatBRL(n.invoice.settlement.partnerOwesCents)}</Txt>
            </Txt>
          ) : null}
        </Press>
      ) : null}

      <View style={{ gap: 8 }}>
        <SectionHeader title="Metas" action={<TextLink href="/couple/goals">{n.goals.length ? "Ver todas" : "Criar"}</TextLink>} />
        {n.goals.length > 0 ? (
          <View style={{ gap: 12 }}>
            {n.goals.map((g) => (
              <Press key={g.id} href={`/couple/goals/${g.id}`} style={[cardStyle, { padding: 16 }]}>
                <Row style={{ justifyContent: "space-between" }}>
                  <Txt size={15} weight="medium" style={{ flex: 1 }}>{g.name}</Txt>
                  <Txt size={15} weight="medium" tabular>{g.percent}%</Txt>
                </Row>
                <View style={{ marginTop: 8 }}>
                  <SegmentBar total={g.targetCents} label={`${formatBRL(g.savedCents)} de ${formatBRL(g.targetCents)}`} segments={people.map((p) => ({ value: g.byUser[p.userId!] ?? 0, color: PERSON_BG[p.color] }))} />
                </View>
                <Txt size={13} color={colors.mutedForeground} style={{ marginTop: 8 }}>
                  {formatBRL(g.savedCents)} de {formatBRL(g.targetCents)}
                  {g.reachMonth ? ` · no ritmo, chegam em ${formatMonthLong(g.reachMonth).toLowerCase()}` : g.deadline ? "" : " · sem prazo"}
                </Txt>
              </Press>
            ))}
          </View>
        ) : (
          <EmptyState title="Nenhuma meta ainda">
            Viagem, reserva, reforma: <Txt size={14} color={colors.primary} onPress={() => go("/couple/goals/new")}>crie a primeira</Txt>.
          </EmptyState>
        )}
      </View>

      <Press href={`/couple/retro/${n.previousMonth}`} style={rowCard}>
        <CoupleAvatars people={people} size={28} />
        <Flex>
          <Txt size={15} weight="medium">Retrospectiva de {n.previousMonthName}</Txt>
          <Txt size={13} color={colors.mutedForeground}>O mês de vocês, sem placar</Txt>
        </Flex>
        <ChevronRightIcon size={16} color={colors.mutedForeground} />
      </Press>

      <View style={{ gap: 8 }}>
        <SectionHeader title="Contas que vocês dividem" action={<TextLink href="/privacy/visibility">Visibilidade</TextLink>} />
        {n.shared.length > 0 ? (
          <ListGroup>
            {n.shared.map((a) => (
              <Press key={a.id} href={`/accounts/${a.id}`} style={{ minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 }} pressedStyle={{ backgroundColor: colors.rowPress }}>
                <InstitutionMark name={a.institution ?? a.name} />
                <Flex>
                  <Txt size={15} weight="medium" numberOfLines={1}>{a.name} · {a.owner}</Txt>
                  <View style={{ marginTop: 4 }}><VisibilityBadge kind={a.visibility} /></View>
                </Flex>
                {a.balance !== null ? <Amount cents={Math.abs(a.balance)} /> : null}
              </Press>
            ))}
          </ListGroup>
        ) : null}
        <Txt size={13} color={colors.mutedForeground} style={{ paddingHorizontal: 4 }}>Contas marcadas como “Só eu vejo” não aparecem aqui.</Txt>
      </View>

      <HomeAnalytics a={n.analytics} />
    </>
  );
}
