import { formatDayLabel, formatDayShort, formatMonthLong } from "@domain/dates";
import { formatBRL } from "@domain/money";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { Amount, Avatar, InstitutionMark, SegmentBar, UpdatedAt } from "@/ui/finance";
import { Button, Card, EmptyState, Flex, HideValuesButton, ListGroup, PageHeader, Pill, Press, Row, SectionHeader, TextLink, Txt, go } from "@/ui/kit";
import { Screen } from "@/ui/screen";
import { colors, radius, segmentShadow, type Person } from "@/ui/theme";

type InvoiceRow = { kind: "fact" | "pending"; key: string; id: string; date: string; title: string; category: string; installment: string | null; cents: number; credit: boolean };
type Data =
  | { empty: true }
  | {
      empty: false;
      hasPartner: boolean;
      syncedAt: string | null;
      openTotalCents: number;
      limitCents: number;
      availableCents: number;
      selectedCardId: string;
      offset: number;
      cards: { id: string; name: string; owner: Person | null; caption: string; amountCents: number }[];
      tabs: { offset: number; month: string }[];
      invoice: {
        month: string;
        status: "open" | "future" | "closed";
        amountCents: number;
        carriedCents: number;
        paymentsCents: number;
        purchasesCents: number;
        closeEstimated: boolean;
        end: string;
        due: string;
        usedRatio: number | null;
        cardAvailableCents: number;
        cardId: string;
        rows: InvoiceRow[];
        cancelled: { id: string; description: string; amount_cents: number }[];
        pendingCount: number;
      };
      upcoming: { offset: number; month: string; cents: number }[];
      previous: { offset: number; month: string; due: string; settled: boolean; amountCents: number }[];
    };

const monthOnly = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" });
const monthYear = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const asDate = (month: string) => new Date(`${month}-01T00:00:00Z`);

export default function Cards() {
  const { card, m } = useLocalSearchParams<{ card?: string; m?: string }>();
  const query = new URLSearchParams();
  if (card) query.set("card", card);
  if (m) query.set("m", m);
  const qs = query.toString();
  return <Screen<Data> path={`cards${qs ? `?${qs}` : ""}`} gap={16}>{(d) => <CardsView d={d} />}</Screen>;
}

function CardsView({ d }: { d: Data }) {
  const [showAll, setShowAll] = useState(false);
  if (d.empty) {
    return (
      <>
        <PageHeader title="Cartões" />
        <EmptyState title="Nenhum cartão conectado">
          <Txt size={14} color={colors.primary} onPress={() => go("/connect")}>Conecte seus bancos</Txt> para ver faturas, parcelas e dividir compras.
        </EmptyState>
      </>
    );
  }
  const inv = d.invoice;
  const status = inv.status;
  const open = (cardId: string, m: number) => router.setParams({ card: cardId, m: String(m) });
  const shownRows = showAll ? inv.rows : inv.rows.slice(0, 12);

  return (
    <>
      <PageHeader title="Cartões" subtitle={d.hasPartner ? "Nosso · cartões compartilhados" : undefined} action={<HideValuesButton />} />
      <UpdatedAt at={d.syncedAt} />

      <Row>
        <Card style={{ flex: 1, padding: 16, gap: 4 }}>
          <Txt size={13} color={colors.mutedForeground}>Faturas abertas</Txt>
          <Txt size={18} weight="medium" tabular numberOfLines={1} adjustsFontSizeToFit>{formatBRL(d.openTotalCents)}</Txt>
        </Card>
        <Card style={{ flex: 1, padding: 16, gap: 4 }}>
          <Txt size={13} color={colors.mutedForeground}>Limite disponível</Txt>
          <Txt size={18} weight="medium" tabular numberOfLines={1} adjustsFontSizeToFit>{d.limitCents ? formatBRL(d.availableCents) : "—"}</Txt>
          {d.limitCents ? <Txt size={12} color={colors.mutedForeground}>de {formatBRL(d.limitCents)}</Txt> : null}
        </Card>
      </Row>

      <View style={{ gap: 8 }}>
        {d.cards.map((c) => {
          const active = c.id === d.selectedCardId;
          return (
            <Press key={c.id} onPress={() => { setShowAll(false); open(c.id, 0); }} style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: active ? colors.foreground : colors.border, backgroundColor: colors.card, paddingHorizontal: 16, paddingVertical: 12 }}>
              <InstitutionMark name={c.name} />
              <Flex>
                <Row gap={8}>
                  <Txt size={15} weight="medium" numberOfLines={1} style={{ flexShrink: 1 }}>{c.name}</Txt>
                  {c.owner ? <Avatar person={c.owner} size={20} /> : null}
                </Row>
                <Txt size={13} color={colors.mutedForeground}>{c.caption}</Txt>
              </Flex>
              <Amount cents={c.amountCents} />
            </Press>
          );
        })}
      </View>

      <View accessibilityLabel="Mês da fatura" style={{ flexDirection: "row", gap: 4, backgroundColor: colors.muted, borderRadius: radius.full, padding: 4 }}>
        {d.tabs.map((t) => {
          const active = t.offset === d.offset;
          return (
            <Pressable key={t.offset} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => { setShowAll(false); open(d.selectedCardId, t.offset); }} style={[{ flex: 1, minHeight: 40, borderRadius: radius.full, alignItems: "center", justifyContent: "center" }, active && { backgroundColor: colors.card, ...segmentShadow }]}>
              <Txt size={14} weight={active ? "semibold" : "medium"} color={active ? colors.foreground : colors.mutedForeground}>{cap(monthOnly.format(asDate(t.month)))}</Txt>
            </Pressable>
          );
        })}
      </View>

      <Card style={{ gap: 12 }}>
        <Row style={{ justifyContent: "space-between" }}>
          <Txt size={15} weight="medium">Fatura de {monthOnly.format(asDate(inv.month))}</Txt>
          <Pill bg={status === "open" ? colors.secondary : colors.muted} color={status === "open" ? colors.secondaryForeground : colors.mutedForeground}>{status === "open" ? "Aberta" : status === "future" ? "Próxima" : "Fechada"}</Pill>
        </Row>
        <Txt size={32} weight="medium" tabular tracking={-0.96} lh={40}>{formatBRL(inv.amountCents)}</Txt>
        {Math.abs(inv.carriedCents) >= 100 || inv.paymentsCents > 0 ? (
          <View style={{ gap: 4 }}>
            {Math.abs(inv.carriedCents) >= 100 ? (
              <>
                <Line label="Compras, parcelas e encargos" value={formatBRL(inv.purchasesCents)} />
                <Line label={status === "open" ? "Não pago da fatura anterior" : "Saldo anterior e ajustes do banco"} value={formatBRL(inv.carriedCents)} />
              </>
            ) : null}
            {inv.paymentsCents > 0 ? <Line label="Pagamentos lançados nesta fatura" value={formatBRL(inv.paymentsCents)} /> : null}
          </View>
        ) : null}
        {status === "open" ? <Txt size={13} color={colors.mutedForeground}>Fatura em aberto: o total muda até o fechamento.</Txt> : null}
        {status === "future" ? <Txt size={13} color={colors.mutedForeground}>Parcelas já agendadas pelo banco. Compras novas entram aqui depois.</Txt> : null}
        <Row gap={8} align="flex-start">
          <View style={{ flex: 1 }}>
            <Txt size={13} color={colors.mutedForeground}>{status !== "closed" ? (inv.closeEstimated ? "Fecha por volta de" : "Fecha em") : "Fechou"}</Txt>
            <Txt size={14}>{inv.closeEstimated && status === "closed" ? "—" : formatDayLabel(inv.end)}</Txt>
          </View>
          <View style={{ flex: 1 }}>
            <Txt size={13} color={colors.mutedForeground}>Vence em</Txt>
            <Txt size={14}>{formatDayLabel(inv.due)}</Txt>
          </View>
        </Row>
        {inv.usedRatio !== null ? (
          <View style={{ gap: 6 }}>
            <SegmentBar segments={[{ value: inv.usedRatio * 100, color: colors.primary }]} total={100} label={`Limite usado ${Math.round(inv.usedRatio * 100)}%`} />
            <Row style={{ justifyContent: "space-between" }}>
              <Txt size={13} color={colors.mutedForeground}>Limite usado {Math.round(inv.usedRatio * 100)}%</Txt>
              <Txt size={13} color={colors.mutedForeground}>Disponível {formatBRL(inv.cardAvailableCents)}</Txt>
            </Row>
          </View>
        ) : null}
        <Row gap={8}>
          <Txt size={13} color={colors.mutedForeground} center style={{ flex: 1 }}>O pagamento é feito no app do banco</Txt>
          <View style={{ flex: 1 }}>
            {d.hasPartner ? <Button size="sm" href={`/cards/${inv.cardId}/split?m=${d.offset}`}>Dividir fatura</Button> : <Button size="sm" variant="outline" href="/couple">Convidar par</Button>}
          </View>
        </Row>
      </Card>

      <View style={{ gap: 8 }}>
        <SectionHeader title="Lançamentos da fatura" action={<Txt size={13} color={colors.mutedForeground}>{inv.rows.length} itens</Txt>} />
        {inv.rows.length > 0 || inv.cancelled.length > 0 ? (
          <ListGroup>
            {shownRows.map((row) => <InvoiceLine key={row.key} row={row} future={status === "future"} />)}
            {inv.cancelled.map((item) => (
              <View key={`c-${item.id}`} style={{ minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
                <Flex>
                  <Txt size={15} color={colors.mutedForeground} numberOfLines={1} style={{ textDecorationLine: "line-through" }}>{item.description}</Txt>
                  <Txt size={13} color={colors.mutedForeground}>Compra estornada · o banco ainda lista esta parcela, mas ela não entra no total</Txt>
                </Flex>
                <Txt size={15} color={colors.mutedForeground} tabular style={{ textDecorationLine: "line-through" }}>{formatBRL(item.amount_cents)}</Txt>
              </View>
            ))}
          </ListGroup>
        ) : (
          <EmptyState title="Nenhuma compra nesta fatura" />
        )}
        {!showAll && inv.rows.length > shownRows.length ? <TextLink onPress={() => setShowAll(true)}>Ver todos os {inv.rows.length} lançamentos</TextLink> : null}
        {inv.pendingCount > 0 && status === "open" ? <Txt size={13} color={colors.mutedForeground} style={{ paddingHorizontal: 4 }}>Itens em processamento entram na divisão do casal quando o banco confirmar.</Txt> : null}
      </View>

      {d.upcoming.length > 0 ? (
        <View style={{ gap: 8 }}>
          <SectionHeader title="Próximas faturas" action={<Txt size={13} color={colors.mutedForeground}>parcelas agendadas</Txt>} />
          <ListGroup>
            {d.upcoming.map((u) => (
              <Press key={u.month} onPress={() => open(d.selectedCardId, u.offset)} style={{ minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 }} pressedStyle={{ backgroundColor: colors.rowPress }}>
                <Txt size={15} weight="medium" style={{ flex: 1 }}>{cap(monthYear.format(asDate(u.month)))}</Txt>
                <Amount cents={u.cents} />
              </Press>
            ))}
          </ListGroup>
        </View>
      ) : null}

      <View style={{ gap: 8 }}>
        <SectionHeader title="Faturas anteriores" />
        <ListGroup>
          {d.previous.map((p) => (
            <Press key={p.month} onPress={() => open(d.selectedCardId, p.offset)} style={{ minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 }} pressedStyle={{ backgroundColor: colors.rowPress }}>
              <Flex>
                <Txt size={15} weight="medium">{cap(formatMonthLong(p.month).split(" ")[0])}</Txt>
                <Txt size={13} color={colors.mutedForeground}>Venceu em {formatDayShort(p.due)}{p.settled ? " · acertada entre vocês" : ""}</Txt>
              </Flex>
              <Amount cents={p.amountCents} />
            </Press>
          ))}
        </ListGroup>
      </View>
    </>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <Row gap={12} style={{ justifyContent: "space-between" }}>
      <Txt size={13} color={colors.mutedForeground} style={{ flex: 1 }}>{label}</Txt>
      <Txt size={13} tabular>{value}</Txt>
    </Row>
  );
}

function InvoiceLine({ row, future }: { row: InvoiceRow; future: boolean }) {
  const body = (
    <>
      <Flex>
        <Txt size={15} weight="medium" numberOfLines={1}>{row.title}</Txt>
        <Txt size={13} color={colors.mutedForeground}>{row.category} · {formatDayShort(row.date)}{row.kind === "pending" ? (future ? " · agendada" : " · em processamento") : ""}</Txt>
      </Flex>
      {row.installment ? <Txt size={12} color={colors.mutedForeground}>{row.installment}</Txt> : null}
      <Amount cents={row.cents} type={row.credit ? "in" : undefined} />
    </>
  );
  const style = { minHeight: 56, flexDirection: "row" as const, alignItems: "center" as const, gap: 12, paddingHorizontal: 16, paddingVertical: 12 };
  return row.kind === "fact" ? <Press href={`/transactions/${row.id}`} style={style} pressedStyle={{ backgroundColor: colors.rowPress }}>{body}</Press> : <View style={style}>{body}</View>;
}
