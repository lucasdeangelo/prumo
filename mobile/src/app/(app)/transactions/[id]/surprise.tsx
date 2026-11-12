import { formatDayLabel } from "@domain/dates";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { useAction } from "@/lib/query";
import { Amount } from "@/ui/finance";
import { Button, Card, Checkbox, DateInput, FormMessage, Label, PageHeader, RadioCard, Row, Stack, Txt } from "@/ui/kit";
import { Screen } from "@/ui/screen";
import { colors, radius } from "@/ui/theme";

type Data = { id: string; amount_cents: number; label: string; date: string; partnerName: string; meName: string; amountText: string; presets: { value: string; label: string }[] };

export default function SurpriseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen<Data> path={`transactions/${id}/surprise`} gap={16}>
      {(d) => (
        <>
          <PageHeader title="Guardar como surpresa" back={`/transactions/${id}`} />
          <Card style={{ alignItems: "center" }}>
            <Amount cents={d.amount_cents} type="out" size={30} />
            <Txt weight="medium" center style={{ marginTop: 8 }}>{d.label}</Txt>
            <Txt size={14} color={colors.mutedForeground}>{formatDayLabel(d.date)}</Txt>
          </Card>
          <Txt size={14} color={colors.mutedForeground}>{d.partnerName} não vê a loja nem a categoria até a data que você escolher. Depois, o lançamento aparece normalmente.</Txt>
          <Card><SurpriseForm d={d} /></Card>
        </>
      )}
    </Screen>
  );
}

function SurpriseForm({ d }: { d: Data }) {
  const { run, pending, state } = useAction("surprise");
  const [preset, setPreset] = useState(d.presets[0]?.value ?? "custom");
  const [until, setUntil] = useState("");
  const [hide, setHide] = useState(false);
  return (
    <Stack>
      <View style={{ gap: 8 }}>
        <Txt size={14} weight="medium" style={{ marginBottom: 4 }}>Revelar em</Txt>
        {[...d.presets, { value: "custom", label: "Outra data" }].map((p) => <RadioCard key={p.value} selected={preset === p.value} onPress={() => setPreset(p.value)} title={p.label} />)}
        {preset === "custom" ? <DateInput value={until} onChange={setUntil} label="Data para revelar" /> : null}
      </View>
      <View style={{ backgroundColor: colors.muted, borderRadius: radius.md, padding: 14 }}>
        <Label>Até lá, {d.partnerName} vê</Label>
        <Row style={{ justifyContent: "space-between", marginTop: 8 }}>
          <Txt size={15} weight="medium" style={{ flex: 1 }}>Compra reservada por {d.meName}</Txt>
          <Txt size={15} weight="medium" tabular>{hide ? "—" : `− R$ ${d.amountText}`}</Txt>
        </Row>
      </View>
      <Checkbox checked={hide} onChange={setHide}>
        <Txt size={14} weight="medium">Esconder também o valor</Txt>
        <Txt size={14} color={colors.mutedForeground}>Entra só no total do mês, sem linha própria</Txt>
      </Checkbox>
      <FormMessage state={state} />
      <Button pending={pending} onPress={() => run({ id: d.id, preset, until: preset === "custom" ? until : "", hideAmount: hide })}>Guardar como surpresa</Button>
    </Stack>
  );
}
