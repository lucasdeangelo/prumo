import { Pressable, View } from "react-native";

import { useAction } from "@/lib/query";
import { tagOptions, useFields } from "@/ui/forms";
import { TrashIcon } from "@/ui/icons";
import { TagDot } from "@/ui/finance";
import { Button, Card, CardTitle, Checkbox, Field, FormMessage, Input, PageHeader, Row, Select, Stack, Txt, go } from "@/ui/kit";
import { Screen } from "@/ui/screen";
import { colors, radius } from "@/ui/theme";

type Data = { partnerName: string | null; tags: { id: string; name: string; color: string | null; excluded: boolean }[]; rules: { id: string; pattern: string; pattern_type: keyof typeof TYPE_LABEL; tag_id: string }[] };

const TYPE_LABEL = { contains: "contém", description: "começa com", exact: "é igual a", merchant: "estabelecimento" } as const;
// The web offers a free color picker; on the phone, the design system's palette.
const PALETTE = ["#2a78d6", "#1d4d3f", "#2b7350", "#b4582a", "#a8352a", "#8a6100", "#3a5ba0", "#7a4fb5", "#c2417a", "#5e625c"];

export default function Tags() {
  return <Screen<Data> path="settings/tags" keyboard gap={16}>{(d) => <TagsView d={d} />}</Screen>;
}

function TagsView({ d }: { d: Data }) {
  const remove = useAction("deleteRule");
  const tagById = new Map(d.tags.map((t) => [t.id, t]));
  return (
    <>
      <PageHeader title="Tags e regras" subtitle={d.partnerName ? "Valem para os dois" : undefined} back="/settings" />
      {d.partnerName ? (
        <Txt size={14} color={colors.mutedForeground}>
          Tags e regras de categoria são do casal. Para decidir o que {d.partnerName} vê, use as <Txt size={14} color={colors.primary} onPress={() => go("/privacy/rules")}>regras de privacidade</Txt>, que são só suas.
        </Txt>
      ) : null}
      <Card>
        <CardTitle>Como a tag é escolhida</CardTitle>
        {["Suas regras (abaixo) — sempre ganham.", "Nome do estabelecimento (iFood, Uber, Netflix…).", "Categoria informada pelo banco.", "Se nada bater: “Outros”. Corrija e marque “usar sempre” para criar uma regra."].map((text, i) => (
          <Txt key={i} size={14} color={colors.mutedForeground} style={{ marginBottom: 4 }}>{i + 1}. {text}</Txt>
        ))}
      </Card>

      <Card>
        <CardTitle>Regras ({d.rules.length})</CardTitle>
        {d.rules.length > 0 ? (
          <View style={{ marginBottom: 16 }}>
            {d.rules.map((rule, i) => {
              const tag = tagById.get(rule.tag_id);
              return (
                <Row key={rule.id} gap={8} style={{ paddingVertical: 4, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                  <Txt size={14} numberOfLines={1} style={{ flex: 1 }}><Txt size={14} color={colors.mutedForeground}>{TYPE_LABEL[rule.pattern_type]}</Txt> “{rule.pattern}”</Txt>
                  <Row gap={6}><TagDot color={tag?.color} /><Txt size={14}>{tag?.name}</Txt></Row>
                  <Pressable accessibilityLabel={`Remover regra ${rule.pattern}`} disabled={remove.pending} onPress={() => remove.run({ id: rule.id })} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? colors.muted : "transparent" })}>
                    <TrashIcon size={16} color={colors.mutedForeground} />
                  </Pressable>
                </Row>
              );
            })}
          </View>
        ) : null}
        <RuleForm tags={d.tags} />
      </Card>

      <Card>
        <CardTitle>Tags ({d.tags.length})</CardTitle>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          {d.tags.map((tag) => (
            <Row key={tag.id} gap={6} style={{ borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 4 }}>
              <TagDot color={tag.color} />
              <Txt size={14}>{tag.name}</Txt>
              {tag.excluded ? <Txt size={12} color={colors.mutedForeground}>(fora dos totais)</Txt> : null}
            </Row>
          ))}
        </View>
        <TagForm />
      </Card>
    </>
  );
}

function TagForm() {
  const { run, pending, state } = useAction("createTag");
  const [f, set, setAll] = useFields({ name: "", color: "#2a78d6", excluded: false });
  return (
    <Stack gap={12}>
      <Field label="Nova tag"><Input value={f.name} onChangeText={set("name")} maxLength={30} placeholder="Ex.: Pets" /></Field>
      <Field label="Cor">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {PALETTE.map((c) => (
            <Pressable key={c} accessibilityLabel={`Cor ${c}`} accessibilityState={{ selected: f.color === c }} onPress={() => set("color")(c)} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c, borderWidth: f.color === c ? 3 : 0, borderColor: colors.foreground }} />
          ))}
        </View>
      </Field>
      <Checkbox checked={f.excluded} onChange={set("excluded")}>Não contar nos totais (ex.: transferências)</Checkbox>
      <FormMessage state={state} />
      <Button variant="secondary" pending={pending} onPress={async () => { const r = await run(f); if (r && !r.error) setAll({ name: "", color: "#2a78d6", excluded: false }); }}>Criar tag</Button>
    </Stack>
  );
}

function RuleForm({ tags }: { tags: { id: string; name: string }[] }) {
  const { run, pending, state } = useAction("createRule");
  const [f, set] = useFields({ patternType: "contains", pattern: "", tagId: "" });
  return (
    <Stack gap={12}>
      <Field label="Quando a descrição" hint="Ex.: “posto shell” → Transporte">
        <Row gap={8}>
          <View style={{ width: 132 }}><Select label="Tipo" value={f.patternType} onChange={set("patternType")} options={[{ value: "contains", label: "contém" }, { value: "description", label: "começa com" }, { value: "exact", label: "é igual a" }]} /></View>
          <View style={{ flex: 1 }}><Input value={f.pattern} onChangeText={set("pattern")} maxLength={60} placeholder="texto" /></View>
        </Row>
      </Field>
      <Field label="Aplicar a tag"><Select label="Aplicar a tag" value={f.tagId} onChange={set("tagId")} options={tagOptions(tags, "Escolha…")} /></Field>
      <FormMessage state={state} />
      <Button variant="secondary" pending={pending} onPress={async () => { const r = await run(f); if (r && !r.error) set("pattern")(""); }}>Criar regra</Button>
    </Stack>
  );
}
