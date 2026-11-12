import { formatBRL } from "@domain/money";
import Slider from "@react-native-community/slider";
import { useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";

import { useAction } from "@/lib/query";
import { CheckIcon } from "@/ui/icons";
import { Button, Checkbox, Flex, FormMessage, ListGroup, PageHeader, RadioCard, Row, Segmented, TextLink, Txt } from "@/ui/kit";
import { Screen } from "@/ui/screen";
import { colors, radius } from "@/ui/theme";

type Item = { id: string; label: string; detail: string; amountCents: number; category: string };
type Data = { cardId: string; offset: number; holder: string; other: string; incomeShare: number; items: Item[] };

export default function BatchScreen() {
  const { id, m } = useLocalSearchParams<{ id: string; m?: string }>();
  return (
    <Screen<Data> path={`cards/${id}/batch?m=${m ?? 0}`} gap={16}>
      {(d) => (
        <>
          <PageHeader title="Marcar compras" back={`/cards/${d.cardId}/split?m=${d.offset}`} />
          <BatchForm d={d} />
        </>
      )}
    </Screen>
  );
}

/** "Marcar em lote + rateio": choose purchases, whose they are and how to split them. */
function BatchForm({ d }: { d: Data }) {
  const { run, pending, state } = useAction("batchOwner");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [owner, setOwner] = useState<"ours" | "holder" | "partner">("ours");
  const [method, setMethod] = useState<"equal" | "income" | "fixed">("income");
  const [fixed, setFixed] = useState(50);
  const [always, setAlways] = useState(false);

  const chosen = useMemo(() => d.items.filter((i) => selected.has(i.id)), [d.items, selected]);
  const total = chosen.reduce((s, i) => s + i.amountCents, 0);
  const share = method === "equal" ? 0.5 : method === "income" ? d.incomeShare : fixed / 100;
  const first = Math.round(total * share);
  const categories = [...new Set(chosen.map((c) => c.category))];
  const oneCategory = categories.length === 1 ? categories[0] : null;
  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const incomePct = Math.round(d.incomeShare * 100);

  return (
    <>
      <Row style={{ justifyContent: "space-between", paddingHorizontal: 4 }}>
        <Txt size={15} weight="medium">{selected.size} {selected.size === 1 ? "selecionada" : "selecionadas"}</Txt>
        <TextLink onPress={() => setSelected(selected.size === d.items.length ? new Set() : new Set(d.items.map((i) => i.id)))}>{selected.size === d.items.length ? "Nenhuma" : "Todas"}</TextLink>
      </Row>
      <ListGroup>
        {d.items.map((item) => {
          const on = selected.has(item.id);
          return (
            <Pressable key={item.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => toggle(item.id)} style={{ minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
              <View style={{ width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: on ? colors.primary : colors.radioOff, backgroundColor: on ? colors.primary : "transparent", alignItems: "center", justifyContent: "center" }}>
                {on ? <CheckIcon size={14} color="#fff" strokeWidth={2.4} /> : null}
              </View>
              <Flex>
                <Txt size={15} weight="medium" numberOfLines={1}>{item.label}</Txt>
                <Txt size={13} color={colors.mutedForeground}>{item.detail}</Txt>
              </Flex>
              <Txt size={15} weight="medium" tabular>{formatBRL(item.amountCents)}</Txt>
            </Pressable>
          );
        })}
      </ListGroup>

      <View style={{ gap: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 16 }}>
        <Row style={{ justifyContent: "space-between" }}>
          <Txt size={15} weight="medium">Marcar {selected.size} {selected.size === 1 ? "compra" : "compras"} como</Txt>
          <Txt size={14} weight="medium" tabular>{formatBRL(total)}</Txt>
        </Row>
        <Segmented small label="De quem é" value={owner} onChange={setOwner} options={[{ value: "ours", label: "Nosso" }, { value: "holder", label: `De ${d.holder}` }, { value: "partner", label: `De ${d.other}` }]} />
        {owner === "ours" ? (
          <>
            <Txt size={14} weight="medium">Como dividir</Txt>
            <View style={{ gap: 8 }}>
              <RadioCard selected={method === "equal"} onPress={() => setMethod("equal")} title="50/50" right={`${formatBRL(Math.round(total / 2))} cada`} />
              <RadioCard selected={method === "income"} onPress={() => setMethod("income")} title="Pela renda" right={`${incomePct}% · ${100 - incomePct}%`} />
              <RadioCard selected={method === "fixed"} onPress={() => setMethod("fixed")} title="Valor fixo" right="definir" />
            </View>
            {method === "fixed" ? (
              <View style={{ gap: 6 }}>
                <Txt size={14}>Parte de {d.holder}: {fixed}%</Txt>
                <Slider minimumValue={0} maximumValue={100} step={5} value={fixed} onValueChange={(v) => setFixed(Math.round(v))} minimumTrackTintColor={colors.primary} thumbTintColor={colors.primary} />
              </View>
            ) : null}
            <Txt size={13} color={colors.mutedForeground}>
              {d.holder} {formatBRL(first)} · {d.other} {formatBRL(total - first)}.{method === "income" ? " A proporção vem das rendas que vocês informaram." : ""}
            </Txt>
            {oneCategory ? (
              <Checkbox checked={always} onChange={setAlways}>
                <Txt size={14} weight="medium">Usar sempre para {oneCategory}</Txt>
                <Txt size={14} color={colors.mutedForeground}>Compras futuras já entram como Nosso, {method === "equal" ? "50/50" : method === "income" ? "pela renda" : "com este valor"}</Txt>
              </Checkbox>
            ) : null}
          </>
        ) : null}
      </View>
      <FormMessage state={state} />
      <Button
        pending={pending}
        onPress={() =>
          run({
            ids: [...selected],
            owner,
            method,
            share: method === "fixed" ? String(fixed) : undefined,
            always: owner === "ours" && always && oneCategory ? oneCategory : undefined,
            returnTo: `/cards/${d.cardId}/split?m=${d.offset}`,
          })
        }
      >
        {`Aplicar ${selected.size === 1 ? "à compra" : `às ${selected.size} compras`}`}
      </Button>
    </>
  );
}
