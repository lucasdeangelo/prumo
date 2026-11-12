import { formatDayShort, formatMonthLong } from "@domain/dates";
import { formatBRL } from "@domain/money";
import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";

import { Amount, InstitutionMark, UpdatedAt, VisibilityBadge } from "@/ui/finance";
import { Card, EmptyState, Flex, ListGroup, PageHeader, Press, Txt } from "@/ui/kit";
import { OverdraftCards, type OverdraftItem } from "@/ui/overdraft";
import { Screen } from "@/ui/screen";
import { colors } from "@/ui/theme";

type Line =
  | { kind: "detail" | "category_only"; id: string; label?: string; tagId: string | null; category: string; amountCents: number; type: "credit" | "debit"; date: string; scope: string }
  | { kind: "reserved"; id: string; until: string; amountCents: number; date: string };

type Data = {
  mine: boolean;
  today: string;
  ownerName: string;
  account: { id: string; name: string; institution: string | null; balance_cents: number | null; visibility: "private" | "totals" | "details" };
  overdraft: { limitCents: number; usedCents: number; availableCents: number } | null;
  overdraftMonth: OverdraftItem[];
  syncedAt: string | null;
  monthOutCents: number;
  lines: Line[];
};

/** One account: mine in full, or the partner's through the same projection their preview shows. */
export default function AccountScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen<Data> path={`accounts/${id}`} gap={16}>
      {(d) => (
        <>
          <PageHeader title={d.account.name} subtitle={d.mine ? "Sua conta" : `Conta de ${d.ownerName}`} back="/overview" />
          <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <InstitutionMark name={d.account.institution ?? d.account.name} />
            <Flex>
              <Txt size={13} color={colors.mutedForeground}>Saldo</Txt>
              <Txt size={24} weight="medium" tabular>{d.account.balance_cents !== null ? formatBRL(d.account.balance_cents) : "—"}</Txt>
            </Flex>
            <VisibilityBadge kind={d.account.visibility} />
          </Card>
          {d.overdraft ? (
            <Card style={{ flexDirection: "row", gap: 8 }}>
              {[["Cheque especial", d.overdraft.limitCents], ["Em uso", d.overdraft.usedCents], ["Disponível com limite", d.overdraft.availableCents]].map(([label, cents]) => (
                <View key={label as string} style={{ flex: 1 }}>
                  <Txt size={13} color={colors.mutedForeground}>{label as string}</Txt>
                  <Txt size={13} weight="medium" tabular>{formatBRL(cents as number)}</Txt>
                </View>
              ))}
            </Card>
          ) : null}
          <OverdraftCards items={d.overdraftMonth} monthLabel={formatMonthLong(d.today.slice(0, 7)).split(" ")[0].toLowerCase()} />
          <UpdatedAt at={d.syncedAt} />
          <Txt size={14} color={colors.mutedForeground}>Saiu {formatBRL(d.monthOutCents)} neste mês.</Txt>

          {d.account.visibility === "totals" && !d.mine ? (
            <EmptyState title="Só totais">{d.ownerName} compartilha o saldo e quanto saiu no mês, sem os lançamentos.</EmptyState>
          ) : d.lines.length > 0 ? (
            <ListGroup>
              {d.lines.map((line) => (
                <Press key={line.id} href={`/transactions/${line.id}`} style={{ minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 }} pressedStyle={{ backgroundColor: colors.rowPress }}>
                  <Flex>
                    {line.kind === "reserved" ? (
                      <>
                        <Txt size={15} weight="medium" numberOfLines={1}>Compra reservada por {d.ownerName}</Txt>
                        <Txt size={13} color={colors.mutedForeground}>Detalhes liberados em {formatDayShort(line.until)}</Txt>
                      </>
                    ) : (
                      <>
                        <Txt size={15} weight="medium" numberOfLines={1}>{line.kind === "detail" ? line.label : line.category}</Txt>
                        <Txt size={13} color={colors.mutedForeground}>
                          {formatDayShort(line.date)}
                          {line.kind === "detail" ? ` · ${line.category}` : ""}
                          {line.scope === "ours" ? " · Nosso" : ""}
                        </Txt>
                      </>
                    )}
                  </Flex>
                  <Amount cents={line.amountCents} type={line.kind === "reserved" ? "out" : line.type} />
                </Press>
              ))}
            </ListGroup>
          ) : (
            <EmptyState title="Nenhum lançamento neste mês" />
          )}
        </>
      )}
    </Screen>
  );
}

