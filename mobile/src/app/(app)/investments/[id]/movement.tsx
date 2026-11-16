import { formatBRL } from "@domain/money";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { useAction } from "@/lib/query";
import { Button, DateInput, Field, FormMessage, Input, PageHeader, Row, Txt } from "@/ui/kit";
import { Screen } from "@/ui/screen";
import { colors } from "@/ui/theme";

type Kind = "aporte" | "resgate" | "compra" | "venda" | "cotacao" | "valor";
type Data = {
  asset: { id: string; name: string; amountCents: number; quantity: number | null };
  kind: Kind;
  today: string;
  currentPrice: string;
  currentAmount: string;
};

const TITLE: Record<Kind, string> = { aporte: "Novo aporte", resgate: "Resgate", compra: "Compra", venda: "Venda", cotacao: "Atualizar cotação", valor: "Atualizar valor" };
const SUBMIT: Record<Kind, string> = { aporte: "Registrar aporte", resgate: "Registrar resgate", compra: "Registrar compra", venda: "Registrar venda", cotacao: "Atualizar cotação", valor: "Atualizar valor" };

export default function MovementScreen() {
  const { id, tipo } = useLocalSearchParams<{ id: string; tipo?: string }>();
  return (
    <Screen<Data> path={`investments/${id}/movement${tipo ? `?tipo=${tipo}` : ""}`} keyboard gap={16}>
      {(d) => <MovementView d={d} />}
    </Screen>
  );
}

/** Movements only on assets typed by hand. The Prumo records them: no money moves. */
function MovementView({ d }: { d: Data }) {
  const save = useAction("recordMovement");
  const [amount, setAmount] = useState(d.kind === "valor" ? d.currentAmount : "");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState(d.currentPrice);
  const [date, setDate] = useState(d.today);
  const dated = d.kind !== "cotacao" && d.kind !== "valor";
  return (
    <>
      <PageHeader title={TITLE[d.kind]} back={`/investments/${d.asset.id}`} />
      <View style={{ gap: 2 }}>
        <Txt size={15} weight="medium">{d.asset.name}</Txt>
        <Txt size={13} color={colors.mutedForeground} tabular>{`${formatBRL(d.asset.amountCents)}${d.asset.quantity !== null ? ` · ${d.asset.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 8 })} unidades` : ""}`}</Txt>
      </View>
      {d.kind === "aporte" || d.kind === "resgate" || d.kind === "valor" ? (
        <Field label={d.kind === "valor" ? "Valor atual do investimento" : "Valor"}><Input value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="1.000,00" /></Field>
      ) : null}
      {d.kind === "compra" || d.kind === "venda" ? (
        <Row gap={10}>
          <View style={{ flex: 1 }}><Field label="Quantidade"><Input value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" placeholder="10" /></Field></View>
          <View style={{ flex: 1 }}><Field label="Preço (cada)"><Input value={price} onChangeText={setPrice} keyboardType="decimal-pad" /></Field></View>
        </Row>
      ) : null}
      {d.kind === "cotacao" ? <Field label="Cotação de hoje (cada)"><Input value={price} onChangeText={setPrice} keyboardType="decimal-pad" /></Field> : null}
      {dated ? <Field label="Data"><DateInput value={date} onChange={setDate} /></Field> : null}
      <FormMessage state={save.state} />
      <Button pending={save.pending} onPress={() => save.run({ id: d.asset.id, kind: d.kind, amount, quantity, price, date })}>{SUBMIT[d.kind]}</Button>
      <Txt size={13} color={colors.mutedForeground} center>O Prumo só registra: nada é movido no banco ou na corretora.</Txt>
    </>
  );
}
