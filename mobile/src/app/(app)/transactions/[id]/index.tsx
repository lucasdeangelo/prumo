import { formatDayLabel, formatDayShort } from "@domain/dates";
import { formatBRL } from "@domain/money";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { useAction } from "@/lib/query";
import { Amount, SpaceChip, UpdatedAt, VisibilityBadge } from "@/ui/finance";
import { Pair, tagOptions, useFields } from "@/ui/forms";
import { Button, Card, CardTitle, Checkbox, DateInput, Field, FormMessage, Input, Notice, PageHeader, Press, Row, Segmented, Select, Stack, TextLink, ToggleRow, Txt } from "@/ui/kit";
import { Screen } from "@/ui/screen";
import { colors, radius, segmentShadow, type PersonColor } from "@/ui/theme";

type Tx = {
  id: string;
  type: "credit" | "debit";
  amount_cents: number;
  label: string;
  transaction_date: string;
  source: string;
  category_source: string | null;
  provider_description: string | null;
  user_description: string | null;
  tag_id: string | null;
  scope: "mine" | "ours" | "partner";
  privacy: "account" | "category_only" | "hidden";
  surprise_until: string | null;
  free_money: boolean;
  merchant: string | null;
};

type Own = {
  kind: "own";
  today: string;
  erro: string | null;
  partnerName: string | null;
  meColor: PersonColor;
  accountVisibility: "private" | "totals" | "details" | null;
  accountName: string | null;
  tagName: string | null;
  tx: Tx;
  syncedAt: string | null;
  editableFacts: boolean;
  amountText: string;
  tags: { id: string; name: string }[];
};

type PartnerLine =
  | { kind: "detail"; label: string; tagId: string | null; amountCents: number; type: "credit" | "debit"; date: string }
  | { kind: "category_only"; tagId: string | null; amountCents: number; type: "credit" | "debit"; date: string }
  | { kind: "reserved"; until: string; amountCents: number; date: string };
type Partner = { kind: "partner"; partnerName: string; line: PartnerLine; category: string; ours: boolean };

const SOURCE_LABEL: Record<string, string> = { pluggy: "Importada do banco", whatsapp: "Registrada pelo WhatsApp", manual: "Registrada no app", upcoming_reconciliation: "Criada ao pagar uma conta futura" };
const CATEGORY_LABEL: Record<string, string> = { rule: "por uma regra sua", keyword: "pelo nome do estabelecimento", provider: "pela categoria do banco", fallback: "sem pista (Outros)", user: "por você" };

export default function TransactionScreen() {
  const { id, erro } = useLocalSearchParams<{ id: string; erro?: string }>();
  return (
    <Screen<Own | Partner> path={`transactions/${id}`} keyboard gap={16}>
      {(d) => (d.kind === "partner" ? <PartnerTransaction d={d} /> : <OwnTransaction d={d} erro={erro ?? d.erro} />)}
    </Screen>
  );
}

function OwnTransaction({ d, erro }: { d: Own; erro: string | null }) {
  const tx = d.tx;
  const remove = useAction("deleteTransaction", {
    onRedirect: (to) => (to.startsWith(`/transactions/${tx.id}`) ? router.setParams({ erro: new URLSearchParams(to.split("?")[1]).get("erro") ?? undefined }) : router.back()),
  });
  return (
    <>
      <PageHeader title="Movimentação" back={`/monthly/${tx.transaction_date.slice(0, 7)}`} />
      {d.partnerName ? <TxPrivacySection d={d} partnerName={d.partnerName} /> : null}
      <Card style={{ alignItems: "center" }}>
        <Amount cents={tx.amount_cents} type={tx.type} size={30} />
        <Txt weight="medium" center style={{ marginTop: 8 }}>{tx.label}</Txt>
        <Txt size={14} color={colors.mutedForeground} center>{formatDayLabel(tx.transaction_date)}{d.accountName ? ` · ${d.accountName}` : ""}</Txt>
        <Txt size={12} color={colors.mutedForeground} center style={{ marginTop: 8 }}>
          {SOURCE_LABEL[tx.source] ?? tx.source}
          {tx.category_source ? ` · tag definida ${CATEGORY_LABEL[tx.category_source] ?? tx.category_source}` : ""}
        </Txt>
        {tx.provider_description && tx.user_description ? <Txt size={12} color={colors.mutedForeground} center style={{ marginTop: 4 }}>No extrato: {tx.provider_description}</Txt> : null}
        {tx.source === "pluggy" ? <View style={{ marginTop: 8 }}><UpdatedAt at={d.syncedAt} /></View> : null}
        {!d.editableFacts ? <Txt size={12} color={colors.mutedForeground} center style={{ marginTop: 8 }}>Valor e data vêm do banco e não podem ser editados.</Txt> : null}
      </Card>
      <Card><EditTransactionForm d={d} /></Card>
      {erro ? <Notice tone="error">{erro.slice(0, 120)}</Notice> : null}
      <Button variant="ghost" color={colors.danger} pending={remove.pending} pendingText="Excluindo…" onPress={() => remove.run({ id: tx.id })}>
        {d.editableFacts ? "Excluir movimentação" : "Ocultar movimentação importada"}
      </Button>
    </>
  );
}

function EditTransactionForm({ d }: { d: Own }) {
  const tx = d.tx;
  const { run, pending, state } = useAction("updateTransaction");
  const [f, set] = useFields({ type: tx.type, amount: d.amountText, date: tx.transaction_date, description: tx.user_description ?? "", tagId: tx.tag_id ?? "", learn: true });
  const submit = () =>
    run({ id: tx.id, description: f.description, tagId: f.tagId, learn: tx.merchant ? f.learn : false, ...(d.editableFacts ? { type: f.type, amount: f.amount, date: f.date } : {}) });
  return (
    <Stack>
      {d.editableFacts ? (
        <>
          <Segmented value={f.type} onChange={set("type")} options={[{ value: "debit", label: "Saída" }, { value: "credit", label: "Entrada" }]} />
          <Pair>
            <Field label="Valor"><Input value={f.amount} onChangeText={set("amount")} keyboardType="decimal-pad" /></Field>
            <Field label="Data"><DateInput value={f.date} onChange={set("date")} label="Data" /></Field>
          </Pair>
        </>
      ) : null}
      <Field label="Descrição"><Input value={f.description} onChangeText={set("description")} maxLength={140} /></Field>
      <Field label="Tag"><Select label="Tag" value={f.tagId} onChange={set("tagId")} options={tagOptions(d.tags, "Sem tag")} /></Field>
      {tx.merchant ? (
        <Checkbox boxed checked={f.learn} onChange={set("learn")}>
          <Txt size={14}>Usar esta tag sempre para <Txt size={14} weight="semibold">{tx.merchant}</Txt> (cria uma regra e ajusta as anteriores automáticas)</Txt>
        </Checkbox>
      ) : null}
      <FormMessage state={state} />
      <Button pending={pending} onPress={submit}>Salvar</Button>
    </Stack>
  );
}

const ACCOUNT_DEFAULT: Record<string, string> = { private: "a conta é só sua, então nada aparece", totals: "a conta mostra só totais", details: "padrão da conta" };

/** "De quem é este gasto" + "O que o par vê" for the owner of a fact. */
function TxPrivacySection({ d, partnerName }: { d: Own; partnerName: string }) {
  const tx = d.tx;
  const privacy = useAction("txPrivacy");
  const clear = useAction("clearSurprise");
  const surpriseActive = Boolean(tx.surprise_until && tx.surprise_until >= d.today);
  const isShared = tx.scope === "ours";
  const returnTo = `/transactions/${tx.id}`;
  const set = (fields: Record<string, string>) => privacy.run({ id: tx.id, returnTo, ...fields });
  const accountDefault = d.accountVisibility ? ACCOUNT_DEFAULT[d.accountVisibility] : null;

  return (
    <>
      <Row gap={8} style={{ flexWrap: "wrap" }}>
        <SpaceChip space={isShared ? "nosso" : "meu"} caption={isShared ? "Nosso · os dois veem" : tx.scope === "partner" ? `De ${partnerName} · no seu cartão` : "Meu · lançamento seu"} me={d.meColor} />
        {surpriseActive ? <VisibilityBadge kind="surprise" until={formatDayShort(tx.surprise_until!)} /> : null}
      </Row>

      {tx.scope !== "partner" ? (
        <Card style={{ gap: 12 }}>
          <CardTitle>De quem é {tx.type === "debit" ? "este gasto" : "esta entrada"}</CardTitle>
          <View style={{ flexDirection: "row", gap: 4, backgroundColor: colors.muted, borderRadius: radius.full, padding: 4, marginTop: -12 }}>
            {(["mine", "ours"] as const).map((scope) => {
              const active = tx.scope === scope;
              return (
                <Pressable key={scope} accessibilityRole="button" accessibilityState={{ selected: active }} disabled={privacy.pending} onPress={() => !active && set({ scope })} style={[{ flex: 1, minHeight: 40, borderRadius: radius.full, alignItems: "center", justifyContent: "center" }, active && { backgroundColor: colors.card, ...segmentShadow }]}>
                  <Txt size={14} weight={active ? "semibold" : "medium"} color={active ? colors.primary : colors.mutedForeground}>{scope === "mine" ? "Meu" : "Nosso"}</Txt>
                </Pressable>
              );
            })}
          </View>
          {isShared ? <Txt size={13} color={colors.mutedForeground}>{partnerName} vê tudo, e entra no orçamento do lar e na divisão.</Txt> : null}
        </Card>
      ) : null}

      {tx.scope === "mine" ? (
        <Card style={{ gap: 12 }}>
          <CardTitle>O que {partnerName} vê</CardTitle>
          <View style={{ gap: 12, marginTop: -12 }}>
            <Choice active={tx.privacy === "account" && !tx.free_money} onPress={() => set({ privacy: "account" })} title="Tudo" body={`Loja, categoria, valor e data. ${accountDefault ? accountDefault.charAt(0).toUpperCase() + accountDefault.slice(1) : "Padrão da conta"}.`} />
            <Choice active={tx.privacy === "category_only"} onPress={() => set({ privacy: "category_only" })} title="Só categoria e valor" body={`${partnerName} vê “${d.tagName ?? "Outros"} · ${formatBRL(tx.amount_cents)}”, sem o nome da loja.`} />
            <Choice active={tx.privacy === "hidden"} onPress={() => set({ privacy: "hidden" })} title={`Ocultar de ${partnerName}`} body="Não aparece para ele. O saldo da conta continua o mesmo." />
            {tx.type === "debit" ? <ToggleRow title="Dinheiro livre" body={`${partnerName} vê só o total do mês, nunca onde foi.`} on={tx.free_money} disabled={privacy.pending} onPress={() => set({ freeMoney: tx.free_money ? "0" : "1" })} /> : null}
            {tx.type === "debit" ? (
              surpriseActive ? (
                <Row style={{ justifyContent: "space-between", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 4 }}>
                  <Txt size={14}>Surpresa até {formatDayShort(tx.surprise_until!)}</Txt>
                  <TextLink onPress={() => clear.run({ id: tx.id })}>{clear.pending ? "…" : "Revelar agora"}</TextLink>
                </Row>
              ) : (
                <Press href={`/transactions/${tx.id}/surprise`} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.card, paddingHorizontal: 14, paddingVertical: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Txt size={15} weight="medium">Modo surpresa</Txt>
                    <Txt size={13} color={colors.mutedForeground}>É um presente? Guarde até uma data.</Txt>
                  </View>
                  <Txt color={colors.mutedForeground}>›</Txt>
                </Press>
              )
            ) : null}
            {d.tagName ? <TextLink href="/privacy/rules">Fazer isso sempre em {d.tagName} · Criar uma regra de privacidade</TextLink> : null}
            <Txt size={13} color={colors.mutedForeground}>{partnerName} não recebe aviso quando você muda o que ele vê. Lançamentos ocultos não aparecem como “ocultos” para ele.</Txt>
          </View>
        </Card>
      ) : null}
    </>
  );
}

function Choice({ active, onPress, title, body }: { active: boolean; onPress: () => void; title: string; body: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      disabled={busy}
      onPress={async () => { if (active) return; setBusy(true); await onPress(); setBusy(false); }}
      style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, borderWidth: 1, borderColor: active ? colors.foreground : colors.border, borderRadius: radius.md, backgroundColor: colors.card, paddingHorizontal: 14, paddingVertical: 12 }}
    >
      <View style={{ marginTop: 2, width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: active ? colors.primary : colors.radioOff, alignItems: "center", justifyContent: "center" }}>
        {active ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary }} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Txt size={15} weight="medium">{title}</Txt>
        <Txt size={13} color={colors.mutedForeground}>{body}</Txt>
      </View>
    </Pressable>
  );
}

function PartnerTransaction({ d }: { d: Partner }) {
  const line = d.line;
  return (
    <>
      <PageHeader title="Movimentação" back="/overview" />
      <Card style={{ alignItems: "center" }}>
        <Amount cents={line.amountCents} type={line.kind === "reserved" ? "out" : line.type} size={30} />
        <Txt weight="medium" center style={{ marginTop: 8 }}>{line.kind === "reserved" ? `Compra reservada por ${d.partnerName}` : line.kind === "detail" ? line.label : d.category}</Txt>
        <Txt size={14} color={colors.mutedForeground} center>{formatDayLabel(line.date)} · {d.ours ? `Nosso · lançado por ${d.partnerName}` : `De ${d.partnerName}`}</Txt>
        {line.kind === "detail" ? <Txt size={12} color={colors.mutedForeground} center style={{ marginTop: 4 }}>{d.category}</Txt> : null}
        {line.kind === "reserved" ? <Txt size={12} color={colors.mutedForeground} center style={{ marginTop: 4 }}>Detalhes liberados em {formatDayLabel(line.until)}</Txt> : null}
      </Card>
      <Txt size={13} color={colors.mutedForeground} center>Só {d.partnerName} pode editar este lançamento.</Txt>
    </>
  );
}
