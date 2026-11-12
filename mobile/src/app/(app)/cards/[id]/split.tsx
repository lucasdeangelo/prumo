import { formatDayLabel, formatDayShort } from "@domain/dates";
import { formatBRL } from "@domain/money";
import { useLocalSearchParams } from "expo-router";
import { Pressable, View } from "react-native";

import { useAction } from "@/lib/query";
import { Amount, Avatar, SegmentBar, SpaceChip, UpdatedAt } from "@/ui/finance";
import { Card, Flex, ListGroup, PageHeader, Pill, Press, Row, SectionHeader, TextLink, Txt } from "@/ui/kit";
import { Screen } from "@/ui/screen";
import { colors, PERSON_BG, PERSON_TINT, radius, type Person } from "@/ui/theme";

type Owner = "ours" | "holder" | "partner";
type SplitLine = { id: string; title: string; remaining: number; date: string; freeMoney: boolean; category: string; categoryOnlyMine: boolean; cents: number; credit: boolean; who: Person | null; canChange: boolean; next: Owner; nextName: string };
type Data = {
  cardId: string;
  offset: number;
  me: Person;
  partner: Person;
  holder: Person;
  other: Person;
  title: string;
  syncedAt: string | null;
  dueIn: number;
  due: string;
  closed: boolean;
  closeEstimated: boolean;
  end: string;
  settlementTotalCents: number;
  totalCents: number;
  carriedCents: number;
  pendingCount: number;
  holderTotals: { ours: number; holder: number; partner: number };
  partnerOwesCents: number;
  settled: boolean;
  month: string;
  installmentsAhead: number[];
  installmentPurchases: number;
  groups: { owner: Owner; title: string; total: number; lines: SplitLine[] }[];
};

const monthShort = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });
const shift = (month: string, delta: number) => {
  const [y, mo] = month.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1 + delta, 1)).toISOString().slice(0, 7);
};
const short = (month: string) => monthShort.format(new Date(`${month}-01T00:00:00Z`)).replace(".", "");

export default function SplitInvoice() {
  const { id, m } = useLocalSearchParams<{ id: string; m?: string }>();
  return <Screen<Data> path={`cards/${id}/split?m=${m ?? 0}`} gap={16}>{(d) => <SplitView d={d} />}</Screen>;
}

function SplitView({ d }: { d: Data }) {
  const cycle = useAction("cycleOwner");
  const returnTo = `/cards/${d.cardId}/split?m=${d.offset}`;
  return (
    <>
      <Row gap={8}>
        <PageHeader back={`/cards?card=${d.cardId}&m=${d.offset}`} />
        <SpaceChip space="nosso" caption={`Nosso · ${d.me.name} e ${d.partner.name} veem`} me={d.me.color} />
      </Row>
      <View style={{ gap: 4 }}>
        <Txt size={24} weight="medium" tracking={-0.48} lh={30}>{d.title}</Txt>
        <UpdatedAt at={d.syncedAt} />
      </View>

      <Card style={{ gap: 12 }}>
        <Row align="flex-start" style={{ justifyContent: "space-between" }}>
          <Flex>
            <Txt size={15} weight="medium">{d.dueIn >= 0 ? `Vence em ${d.dueIn} ${d.dueIn === 1 ? "dia" : "dias"}` : "Venceu"}</Txt>
            <Txt size={13} color={colors.mutedForeground} style={{ textTransform: "capitalize" }}>{formatDayLabel(d.due)}</Txt>
          </Flex>
          <Pill bg={colors.secondary} color={colors.secondaryForeground}>{!d.closed ? `Aberta · fecha ${d.closeEstimated ? "por volta de " : ""}${formatDayShort(d.end)}` : "Fechada"}</Pill>
        </Row>
        <Txt size={32} weight="medium" tabular tracking={-0.96} lh={40}>{formatBRL(Math.max(0, d.settlementTotalCents))}</Txt>
        {d.pendingCount > 0 ? <Txt size={13} color={colors.mutedForeground}>{d.pendingCount} {d.pendingCount === 1 ? "lançamento ainda está" : "lançamentos ainda estão"} em processamento no banco e {d.pendingCount === 1 ? "entra" : "entram"} aqui quando for confirmado.</Txt> : null}
        {Math.abs(d.carriedCents) >= 100 ? <Txt size={13} color={colors.mutedForeground}>Compras desta fatura. A fatura do banco é {formatBRL(d.totalCents)} com saldo anterior, parcelamentos e encargos.</Txt> : null}
        <SegmentBar
          total={Math.max(1, d.settlementTotalCents)}
          label="Nosso, de cada um"
          segments={[{ value: d.holderTotals.ours, color: colors.primary }, { value: d.holderTotals.holder, color: PERSON_BG[d.holder.color] }, { value: d.holderTotals.partner, color: PERSON_BG[d.other.color] }]}
        />
        <Row gap={8} align="flex-start">
          {[["Nosso", d.holderTotals.ours], [`De ${d.holder.name}`, d.holderTotals.holder], [`De ${d.other.name}`, d.holderTotals.partner]].map(([label, cents]) => (
            <View key={label as string} style={{ flex: 1 }}>
              <Txt size={13} color={colors.mutedForeground}>{label as string}</Txt>
              <Txt size={13} weight="medium" tabular>{formatBRL(cents as number)}</Txt>
            </View>
          ))}
        </Row>
      </Card>

      {d.partnerOwesCents > 0 ? (
        <Press href={`/cards/${d.cardId}/settle?m=${d.offset}`} style={{ minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: radius.lg, backgroundColor: colors.secondary, paddingHorizontal: 16, paddingVertical: 12 }}>
          <Flex>
            <Txt size={13} color={colors.secondaryForeground}>Para fechar a fatura</Txt>
            <Txt size={15} weight="medium" color={colors.secondaryForeground}>{d.other.name} transfere {formatBRL(d.partnerOwesCents)} para {d.holder.name}{d.settled ? " · acertado" : ""}</Txt>
          </Flex>
          <Txt color={colors.secondaryForeground}>›</Txt>
        </Press>
      ) : null}

      <Row style={{ justifyContent: "space-between", paddingHorizontal: 4 }}>
        <Txt size={13} color={colors.mutedForeground} style={{ flex: 1 }}>Toque no círculo para mudar de quem é</Txt>
        <TextLink href={`/cards/${d.cardId}/batch?m=${d.offset}`}>Selecionar</TextLink>
      </Row>

      {d.groups.map((group) => (
        <View key={group.owner} style={{ gap: 8 }}>
          <SectionHeader title={group.title} action={<Txt size={14} weight="medium" tabular>{formatBRL(group.total)}</Txt>} />
          {group.lines.length > 0 ? (
            <ListGroup>
              {group.lines.map((line) => (
                <View key={line.id} style={{ minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12, paddingLeft: 16, paddingRight: 4, paddingVertical: 12 }}>
                  <Press href={`/transactions/${line.id}`} style={{ flex: 1, minWidth: 0 }}>
                    <Txt size={15} weight="medium" numberOfLines={1}>{line.title}</Txt>
                    <Txt size={13} color={colors.mutedForeground}>
                      {line.remaining > 0 ? `${formatBRL(line.cents)} por mês · faltam ${line.remaining} (${formatBRL(line.cents * line.remaining)})` : `${formatDayShort(line.date)} · ${line.freeMoney ? "Dinheiro livre" : line.category}`}
                      {line.categoryOnlyMine ? ` · ${d.other.name} vê só categoria` : ""}
                    </Txt>
                  </Press>
                  <Amount cents={line.cents} type={line.credit ? "in" : undefined} />
                  {line.canChange ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`De quem é: ${line.who ? line.who.name : "Nosso"}. Tocar muda para ${line.nextName}`}
                      disabled={cycle.pending}
                      onPress={() => cycle.run({ id: line.id, next: line.next, returnTo })}
                      style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", opacity: cycle.pending ? 0.5 : 1 }}
                    >
                      <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: line.who ? PERSON_TINT[line.who.color] : colors.secondary }}>
                        <Txt size={11} weight="semibold" color={line.who ? PERSON_BG[line.who.color] : colors.primary}>{line.who ? line.who.initial : "N"}</Txt>
                      </View>
                    </Pressable>
                  ) : line.who ? (
                    <View style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}><Avatar person={line.who} size={28} /></View>
                  ) : null}
                </View>
              ))}
            </ListGroup>
          ) : (
            <Txt size={13} color={colors.mutedForeground} style={{ paddingHorizontal: 4 }}>Nada aqui.</Txt>
          )}
        </View>
      ))}

      {d.installmentsAhead.length > 0 ? (
        <Card style={{ gap: 12 }}>
          <Row style={{ justifyContent: "space-between" }}>
            <Txt size={15} weight="medium">Parcelas nos próximos meses</Txt>
            <Txt size={13} color={colors.mutedForeground}>{d.installmentPurchases} compra(s)</Txt>
          </Row>
          <Row gap={8}>
            {d.installmentsAhead.slice(0, 3).map((cents, i) => (
              <View key={i} style={{ flex: 1, borderRadius: radius.md, backgroundColor: colors.muted, padding: 8, alignItems: "center" }}>
                <Txt size={12} color={colors.mutedForeground}>{short(shift(d.month, i + 1))}</Txt>
                <Txt size={13} weight="medium" tabular numberOfLines={1} adjustsFontSizeToFit>{formatBRL(cents)}</Txt>
              </View>
            ))}
            {d.installmentsAhead.length > 3 ? (
              <View style={{ flex: 1, borderRadius: radius.md, backgroundColor: colors.muted, padding: 8, alignItems: "center" }}>
                <Txt size={12} color={colors.mutedForeground}>+{d.installmentsAhead.length - 3}</Txt>
                <Txt size={13} weight="medium">até {short(shift(d.month, d.installmentsAhead.length))}</Txt>
              </View>
            ) : (
              Array.from({ length: Math.max(0, 4 - Math.min(3, d.installmentsAhead.length)) }, (_, i) => <View key={`s${i}`} style={{ flex: 1 }} />)
            )}
          </Row>
        </Card>
      ) : null}

      <TextLink href="/couple">Regras de rateio por categoria</TextLink>
    </>
  );
}
