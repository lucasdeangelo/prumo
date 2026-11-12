import { useAction } from "@/lib/query";
import { Pair, useFields } from "@/ui/forms";
import { Amount, VisibilityBadge } from "@/ui/finance";
import { Button, Card, CardTitle, EmptyState, Field, Flex, FormMessage, Input, ListGroup, PageHeader, Row, Stack, Txt } from "@/ui/kit";
import { Screen } from "@/ui/screen";
import { colors } from "@/ui/theme";
import { View } from "react-native";

type Data = { partnerName: string | null; manual: { id: string; name: string; visibility: "private" | "totals" | "details"; balance_cents: number | null }[] };

export default function ManualAccounts() {
  return <Screen<Data> path="settings/accounts" keyboard gap={16}>{(d) => <ManualAccountsView d={d} />}</Screen>;
}

function ManualAccountsView({ d }: { d: Data }) {
  const archive = useAction("archiveAccount");
  return (
    <>
      <PageHeader title="Contas manuais" subtitle="Carteira, dinheiro guardado, contas sem Open Finance" back="/settings" />
      {d.manual.length > 0 ? (
        <ListGroup>
          {d.manual.map((a) => (
            <Row key={a.id} style={{ minHeight: 56, paddingLeft: 16, paddingRight: 4, paddingVertical: 12 }}>
              <Flex>
                <Txt size={15} weight="medium" numberOfLines={1}>{a.name}</Txt>
                {d.partnerName ? <View style={{ marginTop: 4 }}><VisibilityBadge kind={a.visibility} /></View> : null}
              </Flex>
              {a.balance_cents !== null ? <Amount cents={a.balance_cents} /> : null}
              <Button variant="ghost" size="sm" full={false} pending={archive.pending} pendingText="…" onPress={() => archive.run({ id: a.id })}>Arquivar</Button>
            </Row>
          ))}
        </ListGroup>
      ) : (
        <EmptyState title="Nenhuma conta manual" />
      )}
      <Card style={{ gap: 12 }}>
        <CardTitle>Nova conta manual</CardTitle>
        <ManualAccountForm />
        {d.partnerName ? <Txt size={13} color={colors.mutedForeground}>Começa como “Só eu vejo”. Mude em Ajustes › O que {d.partnerName} vê.</Txt> : null}
      </Card>
    </>
  );
}

function ManualAccountForm() {
  const { run, pending, state } = useAction("createManualAccount");
  const [f, set, setAll] = useFields({ name: "", balance: "" });
  return (
    <Stack gap={12}>
      <Pair>
        <Field label="Nome"><Input value={f.name} onChangeText={set("name")} maxLength={60} placeholder="Ex.: Carteira" /></Field>
        <Field label="Saldo (opcional)"><Input value={f.balance} onChangeText={set("balance")} keyboardType="decimal-pad" placeholder="0,00" /></Field>
      </Pair>
      <FormMessage state={state} />
      <Button variant="secondary" pending={pending} onPress={async () => { const r = await run(f); if (r && !r.error) setAll({ name: "", balance: "" }); }}>Adicionar conta manual</Button>
    </Stack>
  );
}
