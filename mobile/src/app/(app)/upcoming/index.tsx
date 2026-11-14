import { formatDayLabel, formatMonthLong } from "@domain/dates";
import { formatBRL } from "@domain/money";
import { router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";

import { PlusIcon, RepeatIcon } from "@/ui/icons";
import { Amount, StatTile } from "@/ui/finance";
import { Chip, EmptyState, Flex, HideValuesButton, IconButton, ListGroup, PageHeader, Press, Row, StateBadge, Txt, go } from "@/ui/kit";
import { Screen } from "@/ui/screen";
import { colors } from "@/ui/theme";

type Item = { key: string; kind: "bill" | "subscription"; sourceId: string; description: string; amountCents: number; direction: "in" | "out"; date: string; state: "overdue" | "confirmed" | "predicted" };
type Data = { range: number; outCents: number; inCents: number; groups: { key: string; outCents: number; inCents: number; items: Item[] }[] };

const RANGES = [30, 90, 180] as const;

export default function Upcoming() {
  const { dias } = useLocalSearchParams<{ dias?: string }>();
  const range = RANGES.find((r) => String(r) === dias) ?? 90;
  return (
    <Screen<Data> path={`upcoming?dias=${range}`} gap={16}>
      {(d) => (
        <>
          <PageHeader title="Contas futuras" subtitle={`Próximos ${d.range} dias`} back="/monthly" action={<Row gap={4}><HideValuesButton /><IconButton href="/upcoming/new" label="Nova conta" tone="tint"><PlusIcon size={20} color={colors.primary} strokeWidth={1.8} /></IconButton></Row>} />
          <Row gap={8}>{RANGES.map((r) => <Chip key={r} label={`${r} dias`} active={r === d.range} onPress={() => router.setParams({ dias: String(r) })} />)}</Row>
          <Row>
            <StatTile label="A pagar" cents={d.outCents} tone="out" />
            <StatTile label="A receber" cents={d.inCents} tone="in" />
          </Row>

          {d.groups.length === 0 ? (
            <EmptyState title="Nenhuma conta prevista"><Txt size={14} weight="medium" color={colors.primary} onPress={() => go("/upcoming/new")}>Cadastre aluguel, luz, fatura…</Txt></EmptyState>
          ) : (
            d.groups.map((g) => (
              <View key={g.key} style={{ gap: 8 }}>
                <Row style={{ justifyContent: "space-between", alignItems: "baseline", paddingHorizontal: 4 }}>
                  <Txt size={14} weight="semibold" color={g.key === "overdue" ? colors.danger : colors.foreground}>{g.key === "overdue" ? "Vencidas" : formatMonthLong(g.key)}</Txt>
                  <Txt size={12} color={colors.mutedForeground} tabular>{[g.outCents ? `− ${formatBRL(g.outCents)}` : null, g.inCents ? `+ ${formatBRL(g.inCents)}` : null].filter(Boolean).join(" · ")}</Txt>
                </Row>
                <ListGroup>
                  {g.items.map((item) => {
                    const href = item.kind === "bill" && item.state !== "predicted" ? `/upcoming/${item.sourceId}` : item.kind === "subscription" ? "/subscriptions" : undefined;
                    return (
                      <Press key={item.key} href={href} disabled={!href} style={{ minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 10 }} pressedStyle={{ backgroundColor: colors.rowPress }}>
                        <Flex>
                          <Row gap={6}>
                            {item.kind === "subscription" ? <RepeatIcon size={14} color={colors.mutedForeground} /> : null}
                            <Txt size={14} weight="medium" numberOfLines={1} style={{ flexShrink: 1 }}>{item.description}</Txt>
                          </Row>
                          <Row gap={8} style={{ marginTop: 2 }}>
                            <Txt size={12} color={colors.mutedForeground}>{formatDayLabel(item.date)}</Txt>
                            <StateBadge state={item.state} />
                          </Row>
                        </Flex>
                        <Amount cents={item.amountCents} type={item.direction} size={14} />
                      </Press>
                    );
                  })}
                </ListGroup>
              </View>
            ))
          )}
          <Txt size={12} color={colors.mutedForeground} style={{ paddingHorizontal: 4 }}>
            <Txt size={12} weight="semibold" color={colors.mutedForeground}>Registrada</Txt>: conta cadastrada por você. <Txt size={12} weight="semibold" color={colors.mutedForeground}>Prevista</Txt>: repetição de conta recorrente ou cobrança de assinatura, calculada.
          </Txt>
        </>
      )}
    </Screen>
  );
}

