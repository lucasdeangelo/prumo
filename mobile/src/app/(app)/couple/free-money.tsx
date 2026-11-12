import { formatBRL } from "@domain/money";
import { useState } from "react";
import { View } from "react-native";

import { useAction } from "@/lib/query";
import { Avatar, SpaceChip } from "@/ui/finance";
import { Button, Card, Checkbox, Field, Flex, FormMessage, Input, PageHeader, Pill, Row, Stack, Txt } from "@/ui/kit";
import { Screen } from "@/ui/screen";
import { colors, type Person, type PersonColor } from "@/ui/theme";

type CardData = { person: Person; isMe: boolean; status: string | null; proposedCents: number | null; currentCents: number | null; avgCents: number };
type Data = { meColor: PersonColor; meName: string; partnerName: string; cards: CardData[]; proposal: { id: string; mine: boolean } | null; mineText: string; theirsText: string; nextMonth: string; mineCents: number | null };

export default function FreeMoney() {
  return <Screen<Data> path="couple/free-money" keyboard gap={16}>{(d) => <FreeMoneyView d={d} />}</Screen>;
}

function FreeMoneyView({ d }: { d: Data }) {
  const decide = useAction("decideProposal");
  return (
    <>
      <Row gap={8}>
        <PageHeader back="/overview" />
        <SpaceChip space="nosso" caption="Nosso · combinado dos dois" me={d.meColor} />
      </Row>
      <Txt size={24} weight="medium" tracking={-0.48} lh={30}>Dinheiro livre</Txt>
      <Txt size={14} color={colors.mutedForeground}>Um valor por mês para cada um gastar sem precisar explicar. O outro vê só quanto foi usado, nunca onde.</Txt>

      {d.cards.map((c) => (
        <Card key={c.person.userId} style={{ gap: 8 }}>
          <Row>
            <Avatar person={c.person} size={36} />
            <Flex>
              <Txt size={15} weight="medium">{c.person.name}</Txt>
              <Txt size={13} color={colors.mutedForeground}>{c.isMe ? "Você" : "Seu par"}</Txt>
            </Flex>
            {c.status ? <Pill>{c.status}</Pill> : null}
          </Row>
          {c.proposedCents !== null ? <Txt size={24} weight="medium" tabular>{formatBRL(c.proposedCents)} <Txt size={14} color={colors.mutedForeground}>por mês</Txt></Txt> : null}
          <Txt size={13} color={colors.mutedForeground}>
            Hoje: {c.currentCents !== null ? formatBRL(c.currentCents) : "sem valor combinado"}
            {c.avgCents > 0 ? ` · média usada nos últimos 3 meses: ${formatBRL(c.avgCents)}` : ""}
          </Txt>
        </Card>
      ))}

      {d.proposal && !d.proposal.mine ? (
        <Row gap={8}>
          <Button style={{ flex: 1 }} variant="outline" pending={decide.pending} pendingText="…" onPress={() => decide.run({ id: d.proposal!.id, accept: "0", returnTo: "/couple/free-money" })}>Vamos conversar</Button>
          <Button style={{ flex: 1 }} pending={decide.pending} pendingText="…" onPress={() => decide.run({ id: d.proposal!.id, accept: "1", returnTo: "/couple/free-money" })}>Aceitar</Button>
        </Row>
      ) : (
        <Card><FreeMoneyForm d={d} /></Card>
      )}
      <Txt size={13} color={colors.mutedForeground} center>
        O novo valor vale a partir de {d.nextMonth}, quando os dois confirmarem.{d.mineCents !== null ? ` Até lá, segue ${formatBRL(d.mineCents)}.` : ""} Para usar, marque o gasto como “Dinheiro livre” na movimentação.
      </Txt>
    </>
  );
}

function FreeMoneyForm({ d }: { d: Data }) {
  const { run, pending, state } = useAction("proposeFreeMoney");
  const [same, setSame] = useState(d.mineText === d.theirsText);
  const [mine, setMine] = useState(d.mineText);
  const [theirs, setTheirs] = useState(d.theirsText);
  return (
    <Stack>
      <Row gap={12} align="flex-start">
        <View style={{ flex: 1 }}><Field label={same ? "Por mês, para cada um" : `${d.meName} · por mês`}><Input value={mine} onChangeText={setMine} keyboardType="decimal-pad" /></Field></View>
        {!same ? <View style={{ flex: 1 }}><Field label={`${d.partnerName} · por mês`}><Input value={theirs} onChangeText={setTheirs} keyboardType="decimal-pad" /></Field></View> : null}
      </Row>
      <Checkbox checked={same} onChange={setSame}>Mesmo valor para os dois</Checkbox>
      <FormMessage state={state} />
      <Button pending={pending} onPress={() => run({ mine, theirs: same ? undefined : theirs, same })}>{d.proposal ? "Enviar nova proposta" : `Enviar proposta para ${d.partnerName}`}</Button>
    </Stack>
  );
}
