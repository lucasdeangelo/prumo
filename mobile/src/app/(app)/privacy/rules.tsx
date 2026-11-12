import { Pressable, View } from "react-native";

import { useAction } from "@/lib/query";
import { useFields } from "@/ui/forms";
import { SpaceChip } from "@/ui/finance";
import { Button, Card, CardTitle, Checkbox, EmptyState, Field, Flex, FormMessage, Input, ListGroup, PageHeader, Row, SectionHeader, Select, Stack, Txt } from "@/ui/kit";
import { Screen } from "@/ui/screen";
import { colors, type PersonColor } from "@/ui/theme";

type Data = {
  partnerName: string;
  meColor: PersonColor;
  rules: { id: string; kind: string; target: string; action: string }[];
  tags: { id: string; name: string }[];
  accounts: { id: string; name: string }[];
};

export default function PrivacyRules() {
  return <Screen<Data> path="privacy/rules" keyboard gap={16}>{(d) => <RulesView d={d} />}</Screen>;
}

function RulesView({ d }: { d: Data }) {
  const remove = useAction("deletePrivacyRule");
  return (
    <>
      <Row gap={8}>
        <PageHeader back="/settings" />
        <SpaceChip space="meu" caption="Meu · só você vê" me={d.meColor} />
      </Row>
      <View style={{ gap: 4 }}>
        <Txt size={24} weight="medium" tracking={-0.48} lh={30}>Regras de privacidade</Txt>
        <Txt size={14} color={colors.mutedForeground}>Para não precisar decidir lançamento por lançamento. Valem para os seus gastos novos.</Txt>
      </View>

      <View style={{ gap: 8 }}>
        <SectionHeader title={`Regras (${d.rules.length})`} />
        {d.rules.length > 0 ? (
          <ListGroup>
            {d.rules.map((rule) => (
              <Row key={rule.id} style={{ minHeight: 56, paddingLeft: 16, paddingRight: 4, paddingVertical: 12 }}>
                <Flex>
                  <Txt size={13} color={colors.mutedForeground}>{rule.kind}</Txt>
                  <Txt size={15} weight="medium" numberOfLines={1}>{rule.target}</Txt>
                  <Txt size={13} color={colors.mutedForeground}>{rule.action}</Txt>
                </Flex>
                <Pressable accessibilityLabel="Remover regra" disabled={remove.pending} onPress={() => remove.run({ id: rule.id })} style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? colors.muted : "transparent" })}>
                  <Txt size={20} color={colors.mutedForeground}>×</Txt>
                </Pressable>
              </Row>
            ))}
          </ListGroup>
        ) : (
          <EmptyState title="Nenhuma regra ainda">Ex.: tudo de Saúde aparece só como categoria e valor.</EmptyState>
        )}
      </View>

      <Card style={{ gap: 12 }}>
        <CardTitle>Nova regra</CardTitle>
        <PrivacyRuleForm d={d} />
      </Card>
    </>
  );
}

function PrivacyRuleForm({ d }: { d: Data }) {
  const { run, pending, state } = useAction("createPrivacyRule");
  const [f, set] = useFields({ matchType: "tag" as "tag" | "merchant" | "account", tagId: "", pattern: "", accountId: "", action: "category_only", apply90: false });
  const submit = () => {
    const { tagId, pattern, accountId, ...rest } = f;
    run({ ...rest, ...(f.matchType === "tag" ? { tagId } : f.matchType === "merchant" ? { pattern } : { accountId }) });
  };
  return (
    <Stack gap={12}>
      <Field label="Quando">
        <Select label="Quando" value={f.matchType} onChange={(v) => set("matchType")(v as typeof f.matchType)} options={[{ value: "tag", label: "A categoria for…" }, { value: "merchant", label: "A loja contiver…" }, { value: "account", label: "A conta for…" }]} />
      </Field>
      {f.matchType === "tag" ? (
        <Field label="Categoria"><Select label="Categoria" value={f.tagId} onChange={set("tagId")} placeholder="Escolha…" options={d.tags.map((t) => ({ value: t.id, label: t.name }))} /></Field>
      ) : f.matchType === "merchant" ? (
        <Field label="Loja contém"><Input value={f.pattern} onChangeText={set("pattern")} placeholder="drogaria" maxLength={60} /></Field>
      ) : (
        <Field label="Conta"><Select label="Conta" value={f.accountId} onChange={set("accountId")} placeholder="Escolha…" options={d.accounts.map((a) => ({ value: a.id, label: a.name }))} /></Field>
      )}
      <Field label={`${d.partnerName} vê`}>
        <Select label={`${d.partnerName} vê`} value={f.action} onChange={set("action")} options={[{ value: "category_only", label: "Só categoria e valor" }, { value: "hidden", label: "Nada (ocultar)" }, { value: "ask_surprise", label: "Perguntar se é surpresa" }]} />
      </Field>
      <Checkbox checked={f.apply90} onChange={set("apply90")}>Aplicar também aos últimos 90 dias</Checkbox>
      <FormMessage state={state} />
      <Button variant="secondary" pending={pending} onPress={submit}>Criar regra</Button>
    </Stack>
  );
}
