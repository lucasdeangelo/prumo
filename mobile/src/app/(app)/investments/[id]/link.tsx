import { formatBRL } from "@domain/money";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { follow, useAction } from "@/lib/query";
import { EyeIcon, TargetIcon } from "@/ui/icons";
import { AssetTile, type AssetClass } from "@/ui/investments";
import { Button, Field, FormMessage, Input, Label, ListGroup, PageHeader, Press, Row, Segmented, Txt } from "@/ui/kit";
import { Screen } from "@/ui/screen";
import { colors, radius } from "@/ui/theme";

type Choice = { id: string; name: string; caption: string; scope: "mine" | "ours" };
type Data = {
  asset: { id: string; name: string; badge: string; cls: AssetClass; amountCents: number };
  current: { goalId: string; name: string; scope: "mine" | "ours"; mode: "all" | "part"; partCents: number | null }[];
  mine: Choice[];
  ours: Choice[];
  preselected: string | null;
  shareNote: string | null;
  fromGoal: string | null;
};

export default function LinkScreen() {
  const { id, meta, voltar } = useLocalSearchParams<{ id: string; meta?: string; voltar?: string }>();
  const query = [meta ? `meta=${meta}` : null, voltar ? `voltar=${voltar}` : null].filter(Boolean).join("&");
  return (
    <Screen<Data> path={`investments/${id}/link${query ? `?${query}` : ""}`} keyboard gap={16}>
      {(d) => <LinkView d={d} />}
    </Screen>
  );
}

function LinkView({ d }: { d: Data }) {
  const all = [...d.mine, ...d.ours];
  const [goalId, setGoalId] = useState<string | null>(d.preselected && all.some((g) => g.id === d.preselected) ? d.preselected : all[0]?.id ?? null);
  const [mode, setMode] = useState<"all" | "part">("all");
  const [part, setPart] = useState("");
  const back = d.fromGoal ? `/couple/goals/${d.fromGoal}` : `/investments/${d.asset.id}`;
  const link = useAction("linkInvestment", { onRedirect: (to) => follow(to, back) });
  const unlink = useAction("unlinkInvestment");
  const chosen = all.find((g) => g.id === goalId);

  const option = (g: Choice) => (
    <Press key={g.id} onPress={() => setGoalId(g.id)} style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 12, borderWidth: goalId === g.id ? 1.5 : 1, borderColor: goalId === g.id ? colors.primary : colors.border, backgroundColor: goalId === g.id ? "#F2F6F4" : colors.card, paddingHorizontal: 14, paddingVertical: 12 }}>
      <View style={{ width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: g.scope === "ours" ? "#E3EDE8" : "#E6ECF6" }}>
        <TargetIcon size={16} color={g.scope === "ours" ? colors.primary : "#2B4579"} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Txt size={14} weight="medium">{g.name}</Txt>
        <Txt size={12} color={colors.mutedForeground} tabular>{g.caption}</Txt>
      </View>
      <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: goalId === g.id ? 6 : 1.5, borderColor: goalId === g.id ? colors.primary : "#C9CCC6" }} />
    </Press>
  );

  return (
    <>
      <PageHeader title="Vincular a uma meta" back={back} />
      <Row gap={12}>
        <AssetTile badge={d.asset.badge} cls={d.asset.cls} />
        <View style={{ flex: 1 }}>
          <Txt size={15} weight="medium" numberOfLines={1}>{d.asset.name}</Txt>
          <Txt size={13} color={colors.mutedForeground} tabular>{formatBRL(d.asset.amountCents)}</Txt>
        </View>
      </Row>
      <Txt size={14} color={colors.mutedForeground}>O valor do investimento passa a contar no progresso da meta, com o que ele render.</Txt>

      {d.current.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Label>Já conta para</Label>
          <ListGroup>
            {d.current.map((g) => (
              <Row key={g.goalId} style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt size={14} weight="medium" numberOfLines={1}>{g.name}</Txt>
                  <Txt size={12} color={colors.mutedForeground}>{`${g.scope === "ours" ? "Meta do casal" : "Minha meta"} · ${g.mode === "all" ? "o valor todo" : `uma parte: ${formatBRL(g.partCents ?? 0)}`}`}</Txt>
                </View>
                <Button variant="ghost" size="sm" full={false} pending={unlink.pending} onPress={() => unlink.run({ id: d.asset.id, goalId: g.goalId, returnTo: `/investments/${d.asset.id}/link` })}>Tirar da meta</Button>
              </Row>
            ))}
          </ListGroup>
        </View>
      ) : null}

      {all.length === 0 ? (
        <View style={{ gap: 12, borderRadius: radius.lg, borderWidth: 1, borderStyle: "dashed", borderColor: colors.dashed, padding: 20 }}>
          <Txt size={15} weight="medium" center>Nenhuma meta ainda</Txt>
          <Txt size={14} color={colors.mutedForeground} center>Crie uma meta e volte aqui para fazer este investimento contar para ela.</Txt>
          <Button href="/couple/goals/new?de=meu">Criar meta</Button>
        </View>
      ) : (
        <>
          <View style={{ gap: 8 }}>
            {d.mine.length ? <Label>Minhas metas</Label> : null}
            {d.mine.map(option)}
            {d.ours.length ? <Label style={{ paddingTop: 4 }}>{d.mine.length ? "Metas do casal" : "Metas"}</Label> : null}
            {d.ours.map(option)}
          </View>
          {chosen?.scope === "ours" && d.shareNote ? (
            <Row gap={10} style={{ alignItems: "flex-start", borderRadius: radius.md, backgroundColor: colors.background, paddingHorizontal: 14, paddingVertical: 12 }}>
              <EyeIcon size={18} color={colors.mutedForeground} />
              <Txt size={13} color={colors.mutedForeground} style={{ flex: 1 }}>{d.shareNote}</Txt>
            </Row>
          ) : null}
          <View style={{ gap: 8 }}>
            <Txt size={14} weight="medium">Quanto conta para a meta</Txt>
            <Segmented small value={mode} onChange={setMode} options={[{ value: "all", label: `Tudo · ${formatBRL(d.asset.amountCents)}` }, { value: "part", label: "Uma parte" }]} label="Quanto conta" />
            {mode === "part" ? <Field label="Valor da parte"><Input value={part} onChangeText={setPart} keyboardType="decimal-pad" placeholder="1.000,00" /></Field> : null}
          </View>
          <FormMessage state={link.state} />
          <Button pending={link.pending} pendingText="Vinculando…" onPress={() => link.run({ id: d.asset.id, goalId: goalId ?? "", mode, part, returnTo: back })}>{chosen ? `Vincular a “${chosen.name}”` : "Vincular"}</Button>
        </>
      )}
    </>
  );
}
