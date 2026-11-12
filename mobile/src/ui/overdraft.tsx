import { formatDayShort } from "@domain/dates";
import { formatBRL } from "@domain/money";
import { View } from "react-native";

import { Label, Pill, Press, Row, Txt } from "./kit";
import { colors, radius } from "./theme";

export type OverdraftItem = {
  accountId: string;
  institution: string | null;
  name: string;
  negativeDays: number;
  lowestCents: number;
  lowestDate: string | null;
  chargesCents: number;
  overdraftLimitCents: number | null;
  overdraftUsedCents: number | null;
};

/** "Cheque especial" in a month: days below zero, lowest point and what it cost. */
export function OverdraftCards({ items, monthLabel }: { items: OverdraftItem[]; monthLabel: string }) {
  if (items.length === 0) return null;
  return (
    <View style={{ gap: 8 }}>
      {items.map((o) => (
        <Press key={o.accountId} href={`/accounts/${o.accountId}`} style={{ gap: 8, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 20 }}>
          <Row gap={8} style={{ justifyContent: "space-between" }}>
            <Label>Cheque especial · {o.institution ?? o.name}</Label>
            {o.negativeDays > 0 ? <Pill color={colors.foreground}>{o.negativeDays} {o.negativeDays === 1 ? "dia" : "dias"}</Pill> : null}
          </Row>
          {o.negativeDays > 0 ? (
            <Txt>
              Em {monthLabel} a conta ficou negativa por {o.negativeDays} {o.negativeDays === 1 ? "dia" : "dias"}. Menor saldo: <Txt weight="medium" tabular>{formatBRL(o.lowestCents)}</Txt>
              {o.lowestDate ? ` em ${formatDayShort(o.lowestDate)}` : ""}.
            </Txt>
          ) : (
            <Txt>Em {monthLabel} a conta não fechou nenhum dia negativa.</Txt>
          )}
          <Row gap={8} align="flex-start">
            <View style={{ flex: 1 }}>
              <Txt size={13} color={colors.mutedForeground}>Juros e IOF no mês</Txt>
              <Txt size={13} weight="medium" tabular>{formatBRL(o.chargesCents)}</Txt>
            </View>
            {o.overdraftLimitCents !== null ? (
              <View style={{ flex: 1 }}>
                <Txt size={13} color={colors.mutedForeground}>Limite hoje</Txt>
                <Txt size={13} weight="medium" tabular>{formatBRL(o.overdraftUsedCents ?? 0)} usados de {formatBRL(o.overdraftLimitCents)}</Txt>
              </View>
            ) : null}
          </Row>
          <Txt size={12} color={colors.mutedForeground}>Saldo de cada dia calculado a partir do saldo de hoje e das movimentações do banco.</Txt>
        </Press>
      ))}
    </View>
  );
}
