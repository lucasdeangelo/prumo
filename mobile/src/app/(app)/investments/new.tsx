import { estimateAtMaturity, ratesFromSnapshot, type RateIndex, type RatesSnapshot } from "@domain/fixed-income";
import { formatBRL, parseBRL } from "@domain/money";
import { useState } from "react";
import { View } from "react-native";

import { useAction } from "@/lib/query";
import { BankIcon, ChevronRightIcon } from "@/ui/icons";
import { AssetTile, type AssetClass } from "@/ui/investments";
import { Button, DateInput, Field, FormMessage, Input, Label, PageHeader, Press, Row, Segmented, Select, Txt } from "@/ui/kit";
import { Screen } from "@/ui/screen";
import { colors, radius } from "@/ui/theme";

type Kind = "cdb" | "tesouro" | "lci" | "acao" | "fii" | "etf" | "fundo" | "cripto";
type Data = { partnerName: string | null; goals: { mine: { id: string; label: string }[]; ours: { id: string; label: string }[] }; rates: RatesSnapshot; today: string };

const KINDS: { kind: Kind; label: string; badge: string; cls: AssetClass; type: string; subtype: string | null }[] = [
  { kind: "cdb", label: "CDB", badge: "CDB", cls: "fixed", type: "FIXED_INCOME", subtype: "CDB" },
  { kind: "tesouro", label: "Tesouro", badge: "TD", cls: "fixed", type: "FIXED_INCOME", subtype: "TREASURY" },
  { kind: "lci", label: "LCI/LCA", badge: "LCI", cls: "fixed", type: "FIXED_INCOME", subtype: "LCI" },
  { kind: "acao", label: "Ações", badge: "AÇÃO", cls: "equity", type: "EQUITY", subtype: "STOCK" },
  { kind: "fii", label: "FIIs", badge: "FII", cls: "real_estate", type: "EQUITY", subtype: "REAL_ESTATE_FUND" },
  { kind: "etf", label: "ETFs", badge: "ETF", cls: "equity", type: "ETF", subtype: "ETF" },
  { kind: "fundo", label: "Fundos", badge: "FUND", cls: "funds", type: "MUTUAL_FUND", subtype: null },
  { kind: "cripto", label: "Cripto", badge: "CRIP", cls: "crypto", type: "CRYPTO", subtype: null },
];
const FIXED: Kind[] = ["cdb", "tesouro", "lci"];
const QUOTED: Kind[] = ["acao", "fii", "etf", "cripto"];
const PLACEHOLDER: Partial<Record<Kind, string>> = { acao: "WEGE3", fii: "HGLG11", etf: "BOVA11", cripto: "BTC" };
const INDEX_LABEL: Record<RateIndex, string> = { cdi: "% do CDI", selic: "Selic", pre: "Prefixado", ipca: "IPCA +" };
const SUFFIX: Record<RateIndex, string> = { cdi: "% do CDI", selic: "", pre: "% ao ano", ipca: "% + IPCA" };
const monthYear = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

export default function NewInvestmentScreen() {
  return <Screen<Data> path="investments/new" keyboard gap={16}>{(d) => <NewInvestment d={d} />}</Screen>;
}

/** InvNovo: type, whose, institution, amount and date, how it earns, and an optional goal. */
function NewInvestment({ d }: { d: Data }) {
  const save = useAction("createManualInvestment");
  const [kind, setKind] = useState<Kind>("cdb");
  const [scope, setScope] = useState<"mine" | "ours">("mine");
  const [index, setIndex] = useState<RateIndex>("cdi");
  const [name, setName] = useState("");
  const [institution, setInstitution] = useState("");
  const [amount, setAmount] = useState("");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState(d.today);
  const [rate, setRate] = useState("");
  const [due, setDue] = useState("");
  const [goalId, setGoalId] = useState("");
  const fixed = FIXED.includes(kind);
  const quoted = QUOTED.includes(kind);
  const indexes: RateIndex[] = kind === "tesouro" ? ["selic", "pre", "ipca"] : ["cdi", "pre", "ipca"];
  const chosenIndex = indexes.includes(index) ? index : indexes[0];
  const meta = KINDS.find((k) => k.kind === kind)!;

  const amountCents = parseBRL(amount) ?? 0;
  const rateValue = Number(rate.replace(",", "."));
  const estimate =
    fixed && amountCents > 0 && due > date && (chosenIndex === "selic" || rateValue > 0)
      ? estimateAtMaturity({
          amountCents,
          investedCents: amountCents,
          since: date,
          today: date,
          due,
          terms: { index: chosenIndex, pct: chosenIndex === "cdi" ? rateValue : chosenIndex === "selic" ? 100 : null, annual: chosenIndex === "pre" || chosenIndex === "ipca" ? rateValue : null },
          rates: ratesFromSnapshot(d.rates),
          type: meta.type,
          subtype: meta.subtype,
        })
      : null;
  const rateText = chosenIndex === "cdi" ? `${rate}% do CDI` : chosenIndex === "selic" ? "a Selic" : chosenIndex === "pre" ? `${rate}% ao ano` : `IPCA + ${rate}%`;
  const goalOptions = [{ value: "", label: "Sem meta" }, ...d.goals.mine.map((g) => ({ value: g.id, label: `Minha meta · ${g.label}` })), ...d.goals.ours.map((g) => ({ value: g.id, label: `${d.goals.mine.length ? "Do casal" : "Meta"} · ${g.label}` }))];

  return (
    <>
      <PageHeader title="Novo investimento" back="/investments" />
      <Press href="/connect" style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: radius.lg, backgroundColor: "#E3EDE8", paddingHorizontal: 16, paddingVertical: 14 }}>
        <BankIcon size={22} color="#123329" strokeWidth={1.8} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt size={13} weight="medium" color="#123329">Importar do banco ou da corretora</Txt>
          <Txt size={12} color="#123329">Conecte pelo Open Finance e os valores se atualizam sozinhos</Txt>
        </View>
        <ChevronRightIcon size={18} color="#123329" strokeWidth={1.8} />
      </Press>
      <Label style={{ textAlign: "center" }}>ou cadastre à mão</Label>

      <View style={{ gap: 8 }}>
        <Txt size={14} weight="medium">Tipo</Txt>
        <View accessibilityRole="radiogroup" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {KINDS.map((k) => (
            <Press key={k.kind} onPress={() => setKind(k.kind)} label={k.label} style={{ width: "23%", minHeight: 68, alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, borderWidth: kind === k.kind ? 1.5 : 1, borderColor: kind === k.kind ? colors.primary : colors.border, backgroundColor: kind === k.kind ? "#F2F6F4" : colors.card }}>
              <AssetTile badge={k.badge} cls={k.cls} size={30} />
              <Txt size={12} weight="medium">{k.label}</Txt>
            </Press>
          ))}
        </View>
      </View>

      {d.partnerName ? (
        <View style={{ gap: 8 }}>
          <Txt size={14} weight="medium">De quem é</Txt>
          <Segmented value={scope} onChange={setScope} options={[{ value: "mine", label: "Meu" }, { value: "ours", label: "Nosso" }]} label="De quem é" />
          <Txt size={12} color={colors.mutedForeground}>{scope === "ours" ? `Investimentos do Nosso aparecem para você e ${d.partnerName}, com os detalhes.` : `${d.partnerName} vê só o total dos seus investimentos, até você mudar.`}</Txt>
        </View>
      ) : null}

      {quoted ? (
        <>
          <Field label={kind === "cripto" ? "Moeda" : "Código"}><Input value={name} onChangeText={setName} autoCapitalize="characters" maxLength={20} placeholder={PLACEHOLDER[kind]} /></Field>
          <Row gap={10}>
            <View style={{ flex: 1 }}><Field label="Quantidade"><Input value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" placeholder={kind === "cripto" ? "0,0042" : "60"} /></Field></View>
            <View style={{ flex: 1 }}><Field label="Preço pago (cada)"><Input value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="42,50" /></Field></View>
          </Row>
          <Field label="Data da compra"><DateInput value={date} onChange={setDate} /></Field>
        </>
      ) : (
        <>
          {kind === "fundo" ? <Field label="Nome do fundo"><Input value={name} onChangeText={setName} maxLength={120} placeholder="Fundo multimercado" /></Field> : null}
          <Field label="Instituição"><Input value={institution} onChangeText={setInstitution} maxLength={80} placeholder="Nubank" /></Field>
          <Row gap={10}>
            <View style={{ flex: 1 }}><Field label="Valor aplicado"><Input value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="3.000,00" /></Field></View>
            <View style={{ flex: 1 }}><Field label="Data"><DateInput value={date} onChange={setDate} /></Field></View>
          </Row>
        </>
      )}

      {fixed ? (
        <View style={{ gap: 8 }}>
          <Txt size={14} weight="medium">Rentabilidade</Txt>
          <Segmented small value={chosenIndex} onChange={setIndex} options={indexes.map((i) => ({ value: i, label: INDEX_LABEL[i] }))} label="Tipo de rentabilidade" />
          <Row gap={10}>
            {chosenIndex === "selic" ? (
              <View style={{ flex: 1, minHeight: 48, justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 14 }}><Txt size={14} color={colors.mutedForeground}>Rende a Selic</Txt></View>
            ) : (
              <View style={{ flex: 1 }}><Field label={SUFFIX[chosenIndex]}><Input value={rate} onChangeText={setRate} keyboardType="decimal-pad" placeholder={chosenIndex === "cdi" ? "110" : "6,5"} /></Field></View>
            )}
            <View style={{ flex: 1 }}><Field label="Vencimento"><DateInput value={due} onChange={setDue} placeholder="Escolha" /></Field></View>
          </Row>
        </View>
      ) : null}

      {goalOptions.length > 1 ? <Field label="Meta (opcional)"><Select value={goalId} onChange={setGoalId} options={goalOptions} label="Meta" /></Field> : null}

      {estimate ? (
        <View style={{ borderRadius: 12, backgroundColor: colors.secondary, paddingHorizontal: 16, paddingVertical: 12 }}>
          <Txt size={13} color={colors.secondaryForeground}>
            {`Estimativa: com ${rateText}, este aporte vira ≈ ${formatBRL(estimate.netCents)} em ${monthYear.format(new Date(`${due}T00:00:00Z`))}${estimate.taxRate > 0 ? ", já descontado o IR" : ", sem IR"}. Usa as taxas de hoje.`}
          </Txt>
        </View>
      ) : quoted ? (
        <Txt size={12} color={colors.mutedForeground}>O Prumo não busca cotações: atualize o preço quando quiser, na tela do investimento.</Txt>
      ) : null}

      <FormMessage state={save.state} />
      <Button
        pending={save.pending}
        onPress={() =>
          save.run({
            kind,
            scope: d.partnerName ? scope : "mine",
            name,
            institution,
            amount,
            quantity,
            price,
            date,
            index: fixed ? chosenIndex : undefined,
            rate,
            due,
            goalId,
          })
        }
      >
        Salvar investimento
      </Button>
    </>
  );
}
