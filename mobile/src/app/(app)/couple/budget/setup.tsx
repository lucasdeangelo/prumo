import { centsToInput, formatBRL, parseBRL } from "@domain/money";
import { useState } from "react";
import { View } from "react-native";

import { useAction } from "@/lib/query";
import { Button, FormMessage, Input, PageHeader, Row, TextLink, Txt } from "@/ui/kit";
import { Screen } from "@/ui/screen";
import { colors, radius } from "@/ui/theme";

type Data = { partnerName: string; rows: { category: string; amountCents: number; hint: string }[]; hasSuggestion: boolean; range: string; totalCents: number };

export default function BudgetSetup() {
  return (
    <Screen<Data> path="couple/budget/setup" keyboard gap={16}>
      {(d) => (
        <>
          <PageHeader back="/couple/budget" />
          <Txt size={24} weight="medium" tracking={-0.48} lh={30}>Quanto vocês querem gastar juntos por mês?</Txt>
          <Txt size={14} color={colors.mutedForeground}>
            {d.hasSuggestion ? `Sugerimos valores pela média do que foi marcado como Nosso de ${d.range}. Ajustem à vontade.` : "Ainda não há gastos marcados como Nosso para sugerir valores. Comecem pelas categorias principais."}
          </Txt>
          <BudgetSetupForm initial={d.rows} partnerName={d.partnerName} />
          {d.totalCents ? <Txt size={13} color={colors.mutedForeground} center>Média dos últimos 3 meses: {formatBRL(d.totalCents)}</Txt> : null}
        </>
      )}
    </Screen>
  );
}

function BudgetSetupForm({ initial, partnerName }: { initial: Data["rows"]; partnerName: string }) {
  const { run, pending, state } = useAction("proposeBudget");
  const [rows, setRows] = useState(initial.length ? initial.map((r) => ({ ...r, value: centsToInput(r.amountCents) })) : [{ category: "", amountCents: 0, hint: "", value: "" }]);
  const total = rows.reduce((s, r) => s + (parseBRL(r.value) ?? 0), 0);
  const update = (i: number, patch: Partial<(typeof rows)[number]>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 12 }}>
        {rows.map((row, i) => (
          <View key={i} style={{ gap: 6, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 16 }}>
            <Row gap={8}>
              <View style={{ flex: 1 }}><Input accessibilityLabel="Categoria" value={row.category} onChangeText={(v) => update(i, { category: v })} placeholder="Categoria" /></View>
              <View style={{ width: 120 }}><Input accessibilityLabel={`Valor para ${row.category || "a categoria"}`} value={row.value} onChangeText={(v) => update(i, { value: v })} keyboardType="decimal-pad" placeholder="0,00" style={{ textAlign: "right", fontVariant: ["tabular-nums"] }} /></View>
            </Row>
            {row.hint ? <Txt size={13} color={colors.mutedForeground}>{row.hint}</Txt> : null}
          </View>
        ))}
      </View>
      <TextLink onPress={() => setRows([...rows, { category: "", amountCents: 0, hint: "", value: "" }])}>+ Adicionar categoria</TextLink>
      <Row style={{ justifyContent: "space-between", borderRadius: radius.lg, backgroundColor: colors.secondary, paddingHorizontal: 16, paddingVertical: 12 }}>
        <Txt size={15} weight="medium" color={colors.secondaryForeground}>Total do lar por mês</Txt>
        <Txt size={18} weight="medium" tabular color={colors.secondaryForeground}>{formatBRL(total)}</Txt>
      </Row>
      <FormMessage state={state} />
      <Button pending={pending} onPress={() => run({ category: rows.map((r) => r.category), amount: rows.map((r) => r.value) })}>{`Enviar para ${partnerName} revisar`}</Button>
      <Txt size={13} color={colors.mutedForeground} center>O orçamento começa quando os dois confirmarem.</Txt>
    </View>
  );
}
