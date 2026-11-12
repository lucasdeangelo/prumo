import { formatBRL } from "@domain/money";
import { View } from "react-native";

import { ChevronRightIcon, SparkIcon } from "./icons";
import { BalanceCard, CategoryBars, ForecastLine, IncomeExpenseBars, StatTile, TransactionList, type CategoryRow, type ListTx, type MonthBar, type TagView } from "./finance";
import { Card, CardTitle, EmptyState, Press, Row, SectionHeader, TextLink, Txt, go } from "./kit";
import { colors, radius } from "./theme";

export type HomeAnalyticsView = {
  month: string;
  showBalance: boolean;
  balanceCents: number;
  hasBalance: boolean;
  incomeCents: number;
  expenseCents: number;
  overdueCount: number;
  overdueCents: number;
  candidateCount: number;
  series: MonthBar[];
  categoryRows: CategoryRow[];
  untagged: number;
  nextItems: { key: string; date: string; description: string; state: string; amountCents: number; direction: "in" | "out" }[];
  monthlySubs: number;
  recent: ListTx[];
  tags: TagView[];
};

/** Month result, the last 6 months, spending by tag, next 14 days and recent items, for one space. */
export function HomeAnalytics({ a }: { a: HomeAnalyticsView }) {
  return (
    <>
      {a.showBalance ? <BalanceCard balanceCents={a.balanceCents} hasBalance={a.hasBalance} /> : null}

      <Row>
        <StatTile label="Entradas" cents={a.incomeCents} tone="in" />
        <StatTile label="Saídas" cents={a.expenseCents} tone="out" />
      </Row>

      {a.overdueCount > 0 ? (
        <Press href="/upcoming" style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: radius.lg, backgroundColor: colors.dangerBg, paddingHorizontal: 16, paddingVertical: 12 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger }} />
          <Txt size={14} weight="medium" color={colors.danger} style={{ flex: 1 }}>
            {a.overdueCount === 1 ? "1 conta vencida" : `${a.overdueCount} contas vencidas`}: {formatBRL(a.overdueCents)}
          </Txt>
          <ChevronRightIcon size={16} color={colors.danger} strokeWidth={1.8} />
        </Press>
      ) : null}

      {a.candidateCount > 0 ? (
        <Press href="/subscriptions" style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 16, paddingVertical: 12 }}>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.warningBg, alignItems: "center", justifyContent: "center" }}><SparkIcon size={16} color={colors.warningFg} /></View>
          <Txt size={14} weight="medium" style={{ flex: 1 }}>Encontramos {a.candidateCount === 1 ? "1 possível assinatura" : `${a.candidateCount} possíveis assinaturas`}. Confirme?</Txt>
          <ChevronRightIcon size={16} color={colors.mutedForeground} strokeWidth={1.8} />
        </Press>
      ) : null}

      <Card>
        <CardTitle>Últimos 6 meses</CardTitle>
        <IncomeExpenseBars data={a.series} />
      </Card>

      <Card>
        <CardTitle action={<TextLink href={`/monthly/${a.month}`}>Ver mês</TextLink>}>Gastos por tag</CardTitle>
        {a.categoryRows.length > 0 ? (
          <CategoryBars rows={a.categoryRows} totalCents={a.expenseCents} onPress={(row) => go(`/monthly/${a.month}?tag=${row.tagId ?? "none"}`)} />
        ) : (
          <EmptyState title="Sem gastos neste mês ainda" />
        )}
        {a.untagged > 0 ? <Txt size={12} color={colors.mutedForeground} style={{ marginTop: 12 }}>{a.untagged === 1 ? "1 movimentação sem tag." : `${a.untagged} movimentações sem tag.`}</Txt> : null}
      </Card>

      <Card>
        <CardTitle action={<TextLink href="/upcoming">Todas</TextLink>}>Próximos 14 dias</CardTitle>
        {a.nextItems.length > 0 ? (
          <View style={{ gap: 10 }}>{a.nextItems.map(({ key, ...item }) => <ForecastLine key={key} {...item} />)}</View>
        ) : (
          <EmptyState title="Nada previsto"><Txt size={14} color={colors.primary} onPress={() => go("/upcoming/new")}>Cadastre uma conta futura</Txt>.</EmptyState>
        )}
        {a.monthlySubs > 0 ? <Txt size={12} color={colors.mutedForeground} style={{ marginTop: 12 }}>Assinaturas ativas custam {formatBRL(a.monthlySubs)} por mês.</Txt> : null}
      </Card>

      <View style={{ gap: 8 }}>
        <SectionHeader title="Recentes" action={<TextLink href={`/monthly/${a.month}`}>Ver tudo</TextLink>} />
        {a.recent.length > 0 ? (
          <TransactionList transactions={a.recent} tags={a.tags} />
        ) : (
          <EmptyState title="Nenhuma movimentação">Toque em + para registrar, conecte um banco ou mande uma mensagem no WhatsApp.</EmptyState>
        )}
      </View>
    </>
  );
}
