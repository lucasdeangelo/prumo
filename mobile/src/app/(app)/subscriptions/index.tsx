import { formatDayShort } from "@domain/dates";
import { formatBRL } from "@domain/money";
import { FREQUENCY_LABEL, type RecurrenceType } from "@domain/recurrence";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { useAction } from "@/lib/query";
import { ChevronRightIcon, PlusIcon, SparkIcon } from "@/ui/icons";
import { Amount, StatTile, UpdatedAt } from "@/ui/finance";
import { Button, EmptyState, Flex, FormMessage, HideValuesButton, IconButton, ListGroup, PageHeader, Row, Segmented, StateBadge, Txt } from "@/ui/kit";
import { Screen } from "@/ui/screen";
import { colors, radius } from "@/ui/theme";

type Sub = { id: string; name: string; amount_cents: number; frequency: RecurrenceType; next_charge_date: string | null; status: string; detection_confidence: number | null; editable: boolean };
type Data = { ours: boolean; hasPartner: boolean; meName: string | null; partnerName: string | null; syncedAt: string | null; monthlyCents: number; activeCount: number; candidates: Sub[]; active: Sub[]; past: Sub[] };

export default function Subscriptions() {
  const { aba } = useLocalSearchParams<{ aba?: string }>();
  return (
    <Screen<Data> path={`subscriptions${aba === "nossas" ? "?aba=nossas" : ""}`} gap={16}>
      {(d) => <SubscriptionsView d={d} />}
    </Screen>
  );
}

function SubscriptionsView({ d }: { d: Data }) {
  const status = useAction("subscriptionStatus");
  const detect = useAction("detectSubscriptions");
  const [showPast, setShowPast] = useState(false);
  const set = (id: string, value: string) => status.run({ id, status: value });

  return (
    <>
      <PageHeader title="Assinaturas" action={<Row gap={4}><HideValuesButton /><IconButton href="/subscriptions/new" label="Nova assinatura" tone="tint"><PlusIcon size={20} color={colors.primary} strokeWidth={1.8} /></IconButton></Row>} />
      {d.hasPartner ? (
        <View style={{ gap: 8 }}>
          <Segmented label="De quem" value={d.ours ? "nossas" : "minhas"} onChange={(v) => router.setParams({ aba: v })} options={[{ value: "minhas", label: "Minhas" }, { value: "nossas", label: "Nossas" }]} />
          {d.ours ? <Txt size={13} color={colors.mutedForeground} style={{ paddingHorizontal: 4 }}>{d.meName} e {d.partnerName} veem</Txt> : null}
        </View>
      ) : null}
      <UpdatedAt at={d.syncedAt} />
      <Row>
        <StatTile label="Por mês" cents={d.monthlyCents} tone="out" />
        <StatTile label="Por ano" cents={d.monthlyCents * 12} hint={`${d.activeCount} ativa(s)`} />
      </Row>

      {d.candidates.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Row gap={6} style={{ paddingHorizontal: 4 }}><SparkIcon size={16} /><Txt size={14} weight="semibold">Parecem assinaturas</Txt></Row>
          <ListGroup>
            {d.candidates.map((sub) => (
              <SubRow key={sub.id} sub={sub}>
                <Txt size={12} color={colors.mutedForeground}>Detectada pelas cobranças repetidas{sub.detection_confidence ? ` · confiança ${Math.round(sub.detection_confidence * 100)}%` : ""}.</Txt>
                {sub.editable ? (
                  <Row gap={8}>
                    <Button style={{ flex: 1 }} pending={status.pending} pendingText="…" onPress={() => set(sub.id, "active")}>É assinatura</Button>
                    <Button style={{ flex: 1 }} variant="outline" pending={status.pending} pendingText="…" onPress={() => set(sub.id, "rejected")}>Não é</Button>
                  </Row>
                ) : null}
              </SubRow>
            ))}
          </ListGroup>
        </View>
      ) : null}

      <View style={{ gap: 8 }}>
        <Txt size={14} weight="semibold" style={{ paddingHorizontal: 4 }}>Ativas</Txt>
        {d.active.length > 0 ? (
          <ListGroup>
            {d.active.map((sub) => (
              <SubRow key={sub.id} sub={sub}>
                {sub.editable ? (
                  <Row gap={8}>
                    {sub.status === "active" ? (
                      <Button style={{ flex: 1 }} variant="ghost" pending={status.pending} pendingText="…" onPress={() => set(sub.id, "paused")}>Pausar</Button>
                    ) : (
                      <Button style={{ flex: 1 }} variant="ghost" pending={status.pending} pendingText="…" onPress={() => set(sub.id, "active")}>Reativar</Button>
                    )}
                    <Button style={{ flex: 1 }} variant="ghost" pending={status.pending} pendingText="…" onPress={() => set(sub.id, "cancelled")}>Cancelei</Button>
                  </Row>
                ) : null}
              </SubRow>
            ))}
          </ListGroup>
        ) : (
          <EmptyState title="Nenhuma assinatura ativa">Adicione com o + ou deixe o Prumo encontrar nas suas movimentações.</EmptyState>
        )}
      </View>

      <View style={{ gap: 8 }}>
        <Button variant="outline" pending={detect.pending} pendingText="Procurando…" onPress={() => detect.run()}>Procurar assinaturas nas movimentações</Button>
        <FormMessage state={detect.state} />
      </View>

      {d.past.length > 0 ? (
        <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.card, padding: 12 }}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: showPast }} onPress={() => setShowPast((v) => !v)} style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 28 }}>
            <View style={{ transform: [{ rotate: showPast ? "90deg" : "0deg" }] }}><ChevronRightIcon size={14} /></View>
            <Txt size={14} weight="medium">Canceladas ({d.past.length})</Txt>
          </Pressable>
          {showPast ? (
            <View style={{ marginTop: 8, gap: 4 }}>
              {d.past.map((s) => (
                <Row key={s.id} style={{ justifyContent: "space-between" }}>
                  <Txt size={14} color={colors.mutedForeground}>{s.name}</Txt>
                  <Txt size={14} color={colors.mutedForeground} tabular>{formatBRL(s.amount_cents)}</Txt>
                </Row>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </>
  );
}

function SubRow({ sub, children }: { sub: Sub; children?: React.ReactNode }) {
  return (
    <View style={{ gap: 12, padding: 12 }}>
      <Row>
        <Flex>
          <Txt size={14} weight="medium" numberOfLines={1}>{sub.name}</Txt>
          <Row gap={8} style={{ marginTop: 2, flexWrap: "wrap" }}>
            <Txt size={12} color={colors.mutedForeground}>{FREQUENCY_LABEL[sub.frequency]}</Txt>
            {sub.next_charge_date && sub.status === "active" ? <Txt size={12} color={colors.mutedForeground}>· próxima {formatDayShort(sub.next_charge_date)}</Txt> : null}
            <StateBadge state={sub.status} />
          </Row>
        </Flex>
        <Amount cents={sub.amount_cents} size={14} />
      </Row>
      {children}
    </View>
  );
}
