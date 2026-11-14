import { formatDayLabel, formatDayShort, formatMonthLong } from "@domain/dates";
import { formatBRL } from "@domain/money";
import { FlashList } from "@shopify/flash-list";
import { File, Paths } from "expo-file-system";
import { router, useLocalSearchParams } from "expo-router";
import * as Sharing from "expo-sharing";
import { useEffect, useMemo, useState } from "react";
import { Alert, RefreshControl, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { authHeader } from "@/lib/api";
import { config } from "@/lib/config";
import { prefetchScreen, useScreen } from "@/lib/query";
import { useSession } from "@/lib/session";
import { DownloadIcon, XIcon } from "@/ui/icons";
import { Amount, CategoryBars, CumulativeLine, SpaceSwitcher, TransactionRow, UpdatedAt, type CategoryRow, type CumulativePoint, type ListTx, type TagView } from "@/ui/finance";
import { Card, CardTitle, Chip, EmptyState, Flex, HideValuesButton, IconButton, Label, ListGroup, MonthSwitcher, PageHeader, Press, Row, SectionHeader, TextLink, Txt } from "@/ui/kit";
import { BOTTOM_SPACE, Page, Skeleton } from "@/ui/screen";
import { colors, radius, type Person } from "@/ui/theme";

type Data = {
  month: string;
  current: string;
  today: string;
  prev: string;
  next: string;
  household: { me: Person; partner: Person | null } | null;
  nosso: boolean;
  syncedAt: string | null;
  incomeCents: number;
  expenseCents: number;
  netCents: number;
  projectedCents: number;
  toPayCents: number;
  deltaPct: number | null;
  overdraft: { accountId: string; institution: string | null; name: string; negativeDays: number; lowestCents: number; lowestDate: string | null; chargesCents: number }[];
  categoryRows: CategoryRow[];
  bills: { id: string; description: string; due_date: string; amount_cents: number; type: "payable" | "receivable" }[];
  line: CumulativePoint[];
  transactions: ListTx[];
  tags: TagView[];
};

type Item = { kind: "day"; date: string } | { kind: "tx"; tx: ListTx; first: boolean; last: boolean };

export default function Month() {
  const params = useLocalSearchParams<{ month: string; tag?: string; type?: string }>();
  const month = params.month;
  const { space } = useSession();
  const query = useScreen<Data>(`monthly/${month}`);
  const insets = useSafeAreaInsets();
  const [pulled, setPulled] = useState(false);
  // Filters start from the URL (a tap on "Gastos por tag" in Início) and then change locally,
  // without a round trip. A new month or new URL params start over.
  const urlKey = `${month}|${params.tag ?? ""}|${params.type ?? ""}`;
  const [local, setLocal] = useState<{ key: string; tag?: string; type?: string }>({ key: urlKey, tag: params.tag, type: params.type });
  const filter = local.key === urlKey ? local : { key: urlKey, tag: params.tag, type: params.type };
  const { tag, type } = filter;
  const setTag = (value: string | undefined) => setLocal((prev) => ({ ...(prev.key === urlKey ? prev : filter), tag: value }));
  const setType = (value: string | undefined) => setLocal((prev) => ({ ...(prev.key === urlKey ? prev : filter), type: value }));

  const d = query.data;
  // The month before is one swipe away: load it now.
  useEffect(() => {
    if (d?.prev) prefetchScreen(`monthly/${d.prev}`, space).catch(() => {});
  }, [d?.prev, space]);

  const tagById = useMemo(() => new Map((d?.tags ?? []).map((t) => [t.id, t])), [d?.tags]);
  const filterTag = tag === "none" ? null : tag && tagById.has(tag) ? tag : undefined;
  const filterType = type === "credit" || type === "debit" ? type : undefined;
  const filtered = useMemo(() => (d?.transactions ?? []).filter((t) => (filterTag === undefined || t.tagId === filterTag) && (!filterType || t.type === filterType)), [d?.transactions, filterTag, filterType]);
  const items = useMemo(() => {
    const out: Item[] = [];
    filtered.forEach((tx, i) => {
      const first = i === 0 || filtered[i - 1].date !== tx.date;
      const last = i === filtered.length - 1 || filtered[i + 1].date !== tx.date;
      if (first) out.push({ kind: "day", date: tx.date });
      out.push({ kind: "tx", tx, first, last });
    });
    return out;
  }, [filtered]);

  if (!d) {
    return (
      <Page>
        <PageHeader title="Mês" />
        {query.error ? <EmptyState title="Não foi possível carregar">{query.error.message}</EmptyState> : <Skeleton />}
      </Page>
    );
  }

  const activeFilter = filterTag !== undefined || filterType;
  const goMonth = (m: string) => router.setParams({ month: m, tag: undefined as never, type: undefined as never });

  const header = (
    <View style={{ gap: 20, paddingBottom: 12 }}>
      <PageHeader title="Mês" action={<Row gap={0}><HideValuesButton /><IconButton label="Exportar CSV" onPress={() => exportCsv(d.month)}><DownloadIcon size={20} /></IconButton></Row>} />
      {d.household ? <SpaceSwitcher me={d.household.me} partner={d.household.partner} /> : null}
      <MonthSwitcher label={formatMonthLong(d.month)} onPrev={() => goMonth(d.prev)} onNext={d.month < d.current ? () => goMonth(d.next) : undefined} />
      {d.month === d.current ? <UpdatedAt at={d.syncedAt} /> : null}

      <View style={styles.result}>
        <View style={{ gap: 6 }}>
          <Label color={colors.onPrimaryMuted}>{d.month >= d.current ? "Deve sobrar no fim do mês" : "Sobrou no mês"}</Label>
          <Txt size={40} weight="medium" tabular tracking={-1.2} lh={44} color="#ffffff" numberOfLines={1} adjustsFontSizeToFit>{formatBRL(d.month >= d.current ? d.projectedCents : d.netCents)}</Txt>
        </View>
        <View style={styles.resultGrid}>
          <ResultCell label="Entrou" value={formatBRL(d.incomeCents)} />
          <ResultCell label="Saiu" value={formatBRL(d.expenseCents)} />
          {d.month >= d.current ? <ResultCell label="Falta pagar" value={formatBRL(d.toPayCents)} /> : <ResultCell label="vs. anterior" value={d.deltaPct === null ? "—" : `${d.deltaPct > 0 ? "+" : ""}${d.deltaPct}%`} />}
        </View>
        {d.overdraft.some((o) => o.negativeDays > 0 || o.chargesCents > 0) ? (
          <View style={{ borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.2)", paddingTop: 12 }}>
            {d.overdraft.map((o) => (
              <Txt key={o.accountId} size={14} color={colors.onPrimaryMuted}>
                Cheque especial {o.institution ?? o.name}: {o.negativeDays} {o.negativeDays === 1 ? "dia" : "dias"} no negativo
                {o.lowestDate ? <>, chegando a <Txt size={14} weight="medium" tabular color="#fff">{formatBRL(o.lowestCents)}</Txt> em {formatDayShort(o.lowestDate)}</> : null}
                {o.chargesCents > 0 ? <>{" · "}juros e IOF <Txt size={14} weight="medium" tabular color="#fff">{formatBRL(o.chargesCents)}</Txt>, já nas saídas</> : null}
              </Txt>
            ))}
          </View>
        ) : null}
      </View>

      <View style={{ gap: 10 }}>
        <SectionHeader title="Para onde foi" action={d.nosso ? <TextLink href="/couple/budget">Orçamento</TextLink> : undefined} />
        <Card>
          {d.categoryRows.length > 0 ? (
            <CategoryBars rows={d.categoryRows} totalCents={d.expenseCents} limit={8} onPress={(row) => { setTag(row.tagId ?? "none"); setType(undefined); }} />
          ) : (
            <EmptyState title="Sem gastos neste mês" />
          )}
        </Card>
      </View>

      {d.month >= d.current ? (
        <View style={{ gap: 10 }}>
          <SectionHeader title="Próximas contas" action={<TextLink href="/upcoming/new">Nova conta</TextLink>} />
          {d.bills.length > 0 ? (
            <ListGroup>
              {d.bills.map((bill) => {
                const late = bill.due_date < d.today;
                return (
                  <Press key={bill.id} href={`/upcoming/${bill.id}`} style={[styles.billRow, late && { backgroundColor: colors.dangerBg }]} pressedStyle={{ backgroundColor: late ? colors.dangerBg : colors.rowPress }}>
                    <Flex style={{ gap: 2 }}>
                      <Txt size={15} weight="medium" numberOfLines={1}>{bill.description}</Txt>
                      <Txt size={13} color={late ? colors.danger : colors.mutedForeground}>{late ? `Venceu ${formatDayShort(bill.due_date)}` : formatDayShort(bill.due_date)}</Txt>
                    </Flex>
                    <Amount cents={bill.amount_cents} type={bill.type === "payable" ? undefined : "in"} />
                  </Press>
                );
              })}
            </ListGroup>
          ) : (
            <EmptyState title="Nenhuma conta em aberto neste mês" />
          )}
          <View style={{ alignItems: "center" }}><TextLink href="/upcoming">Ver contas futuras</TextLink></View>
        </View>
      ) : null}

      <Card>
        <CardTitle>Gasto acumulado</CardTitle>
        <CumulativeLine data={d.line} />
      </Card>

      <View style={{ gap: 12 }}>
        <SectionHeader title="Movimentações" action={<Txt size={12} color={colors.mutedForeground}>{filtered.length} no mês</Txt>} />
        <Row gap={8} style={{ flexWrap: "wrap" }}>
          <Chip label="Tudo" active={!activeFilter} onPress={() => { setTag(undefined); setType(undefined); }} />
          <Chip label="Saídas" active={filterType === "debit" && filterTag === undefined} onPress={() => { setTag(undefined); setType("debit"); }} />
          <Chip label="Entradas" active={filterType === "credit" && filterTag === undefined} onPress={() => { setTag(undefined); setType("credit"); }} />
          {filterTag !== undefined ? (
            <Chip label={filterTag ? tagById.get(filterTag)?.name ?? "" : "Sem tag"} active onPress={() => setTag(undefined)}>
              <XIcon size={16} color="#ffffff" />
            </Chip>
          ) : null}
        </Row>
        {filtered.length === 0 ? <EmptyState title="Nada por aqui" /> : null}
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlashList
        data={items}
        keyExtractor={(item) => (item.kind === "day" ? `d${item.date}` : item.tx.id)}
        getItemType={(item) => item.kind}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: Math.max(28, insets.top + 12), paddingBottom: BOTTOM_SPACE + insets.bottom }}
        refreshControl={<RefreshControl refreshing={pulled && query.isFetching} onRefresh={async () => { setPulled(true); await query.refetch(); setPulled(false); }} tintColor={colors.primary} colors={[colors.primary]} />}
        renderItem={({ item }) =>
          item.kind === "day" ? (
            <Label style={{ paddingHorizontal: 4, marginBottom: 8, marginTop: 16 }}>{formatDayLabel(item.date)}</Label>
          ) : (
            <View style={[styles.groupRow, item.first && styles.groupFirst, item.last && styles.groupLast, !item.first && styles.groupDivider]}>
              <TransactionRow tx={item.tx} tag={item.tx.tagId ? tagById.get(item.tx.tagId) : undefined} />
            </View>
          )
        }
      />
    </View>
  );
}

function ResultCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Txt size={12} color={colors.onPrimaryMuted}>{label}</Txt>
      <Txt size={15} weight="medium" color="#ffffff" tabular numberOfLines={1} adjustsFontSizeToFit>{value}</Txt>
    </View>
  );
}

/** Downloads the month as CSV with the same export the web uses, then opens the share sheet. */
async function exportCsv(month: string) {
  try {
    const file = new File(Paths.cache, `prumo-${month}.csv`);
    const saved = await File.downloadFileAsync(`${config.apiUrl}/api/export/${month}`, file, { headers: await authHeader(), idempotent: true });
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(saved.uri, { mimeType: "text/csv", dialogTitle: `Prumo · ${formatMonthLong(month)}`, UTI: "public.comma-separated-values-text" });
  } catch {
    Alert.alert("Exportar CSV", "Não foi possível exportar agora. Tente de novo.");
  }
}

const styles = StyleSheet.create({
  result: { gap: 16, borderRadius: radius.lg, backgroundColor: colors.primary, padding: 20 },
  resultGrid: { flexDirection: "row", gap: 8, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.2)", paddingTop: 14 },
  billRow: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  groupRow: { backgroundColor: colors.card, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border, overflow: "hidden" },
  groupFirst: { borderTopWidth: 1, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  groupLast: { borderBottomWidth: 1, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  groupDivider: { borderTopWidth: 1, borderTopColor: colors.border },
});
