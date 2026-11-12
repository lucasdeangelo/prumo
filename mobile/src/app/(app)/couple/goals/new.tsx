import { formatBRL, parseBRL } from "@domain/money";
import { useMemo, useState } from "react";
import { View } from "react-native";

import { useAction } from "@/lib/query";
import { Pair } from "@/ui/forms";
import { Button, Field, FormMessage, Input, PageHeader, Segmented, Select, Stack, TextLink, Txt } from "@/ui/kit";
import { Screen } from "@/ui/screen";
import { colors, radius } from "@/ui/theme";

type Data = { meName: string; partnerName: string | null; incomeShare: number | null };

const monthYear = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

export default function NewGoal() {
  return (
    <Screen<Data> path="couple/goals/new" keyboard gap={16}>
      {(d) => (
        <>
          <PageHeader title={d.partnerName ? "Nova meta do casal" : "Nova meta"} back="/couple/goals" />
          <GoalForm d={d} />
        </>
      )}
    </Screen>
  );
}

function monthsUntil(month: string): number {
  const now = new Date();
  const [y, m] = month.split("-").map(Number);
  return (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth());
}

/** <input type="month">: the next five years, month by month. */
function deadlineOptions() {
  const now = new Date();
  const list = [{ value: "", label: "Sem prazo" }];
  for (let i = 1; i <= 60; i++) {
    const date = new Date(Date.UTC(now.getFullYear(), now.getMonth() + i, 1));
    const label = monthYear.format(date);
    list.push({ value: date.toISOString().slice(0, 7), label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  return list;
}

function GoalForm({ d }: { d: Data }) {
  const { run, pending, state } = useAction("createGoal");
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [method, setMethod] = useState<"percent" | "fixed">("percent");
  const [mine, setMine] = useState("50");
  const [theirs, setTheirs] = useState("50");
  const [target, setTarget] = useState("");
  const [deadline, setDeadline] = useState("");
  const options = useMemo(() => deadlineOptions(), []);
  const targetCents = parseBRL(target) ?? 0;
  const months = deadline ? monthsUntil(deadline) : null;
  const monthly = months && months > 0 && targetCents ? Math.ceil(targetCents / months) : null;
  const mineShare = Number(mine) / 100;
  const incomePct = d.incomeShare !== null ? Math.round(d.incomeShare * 100) : null;

  return (
    <Stack>
      <Field label="Nome"><Input value={name} onChangeText={setName} maxLength={60} placeholder="Viagem de aniversário" /></Field>
      <Field label="Ícone (opcional)"><Input value={icon} onChangeText={setIcon} maxLength={4} placeholder="✈️" /></Field>
      <Pair>
        <Field label="Valor-alvo"><Input value={target} onChangeText={setTarget} keyboardType="decimal-pad" placeholder="10.000,00" /></Field>
        <Field label="Prazo (opcional)"><Select label="Prazo" value={deadline} onChange={setDeadline} options={options} /></Field>
      </Pair>
      {d.partnerName ? (
        <View style={{ gap: 12 }}>
          <Txt size={14} weight="medium" style={{ marginBottom: 4 }}>Como cada um contribui</Txt>
          <Segmented value={method} onChange={setMethod} options={[{ value: "percent", label: "Percentual" }, { value: "fixed", label: "Valor fixo por mês" }]} />
          <Pair>
            <Field label={d.meName}><Input value={mine} onChangeText={(v) => { setMine(v); if (method === "percent") setTheirs(String(Math.max(0, 100 - Number(v || 0)))); }} keyboardType="decimal-pad" /></Field>
            <Field label={d.partnerName}><Input value={theirs} onChangeText={setTheirs} keyboardType="decimal-pad" /></Field>
          </Pair>
          {method === "percent" && incomePct !== null ? (
            <TextLink onPress={() => { setMine(String(incomePct)); setTheirs(String(100 - incomePct)); }}>Usar a proporção da renda ({incomePct}/{100 - incomePct})</TextLink>
          ) : null}
        </View>
      ) : null}
      {monthly ? (
        <View style={{ borderRadius: radius.lg, backgroundColor: colors.secondary, paddingHorizontal: 16, paddingVertical: 12 }}>
          <Txt size={13} color={colors.secondaryForeground}>Para chegar em {monthYear.format(new Date(`${deadline}-01T00:00:00Z`))}</Txt>
          <Txt size={18} weight="medium" tabular color={colors.secondaryForeground}>{formatBRL(monthly)} por mês{d.partnerName ? " juntos" : ""}</Txt>
          {d.partnerName && method === "percent" ? <Txt size={13} color={colors.secondaryForeground}>{d.meName} {formatBRL(Math.round(monthly * mineShare))} · {d.partnerName} {formatBRL(monthly - Math.round(monthly * mineShare))}</Txt> : null}
        </View>
      ) : null}
      <FormMessage state={state} />
      <Button pending={pending} onPress={() => run({ name, icon, target, deadline, method: d.partnerName ? method : "percent", ...(d.partnerName ? { mine, theirs } : {}) })}>
        {d.partnerName ? `Criar e convidar ${d.partnerName}` : "Criar meta"}
      </Button>
      {d.partnerName ? <Txt size={13} color={colors.mutedForeground} center>{d.partnerName} confirma a parte dele antes de a meta começar.</Txt> : null}
    </Stack>
  );
}
