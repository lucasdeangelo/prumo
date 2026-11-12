import { useState } from "react";
import { View } from "react-native";

import { useAction } from "@/lib/query";
import { InstitutionMark, SpaceChip } from "@/ui/finance";
import { Button, Card, EmptyState, Flex, Input, ListGroup, PageHeader, Row, SectionHeader, Txt, go } from "@/ui/kit";
import { Screen } from "@/ui/screen";
import { colors, type PersonColor } from "@/ui/theme";
import { VisibilitySegment } from "@/ui/visibility";

type Account = { id: string; name: string; institution: string | null; detail: string; visibility: "private" | "totals" | "details"; partner_card_last4: string | null };
type Data = { partnerName: string; hasPartner: boolean; meColor: PersonColor; empty: boolean; banks: Account[]; cards: Account[] };

export default function Visibility() {
  return <Screen<Data> path="privacy/visibility" keyboard gap={16}>{(d) => <VisibilityView d={d} />}</Screen>;
}

function Info({ a }: { a: Account }) {
  return (
    <>
      <Row>
        <InstitutionMark name={a.institution ?? a.name} />
        <Flex>
          <Txt size={15} weight="medium" numberOfLines={1}>{a.name}</Txt>
          {a.detail ? <Txt size={13} color={colors.mutedForeground}>{a.detail}</Txt> : null}
        </Flex>
      </Row>
      <VisibilitySegment accountId={a.id} value={a.visibility} returnTo="/privacy/visibility" accountName={a.name} />
    </>
  );
}

function VisibilityView({ d }: { d: Data }) {
  return (
    <>
      <Row gap={8}>
        <PageHeader back="/settings" />
        <SpaceChip space="meu" caption="Meu · só você vê esta tela" me={d.meColor} />
      </Row>
      <View style={{ gap: 4 }}>
        <Txt size={24} weight="medium" tracking={-0.48} lh={30}>O que {d.partnerName} vê das suas contas</Txt>
        <Txt size={14} color={colors.mutedForeground}>Escolha conta por conta. Você pode mudar quando quiser.</Txt>
      </View>

      <Card style={{ gap: 8 }}>
        <Txt size={14}><Txt size={14} weight="semibold">Só eu vejo.</Txt> {d.partnerName} não sabe que a conta existe.</Txt>
        <Txt size={14}><Txt size={14} weight="semibold">Só totais.</Txt> Saldo e quanto saiu no mês, sem lançamentos.</Txt>
        <Txt size={14}><Txt size={14} weight="semibold">Com detalhes.</Txt> Cada lançamento, menos os que você ocultar.</Txt>
      </Card>

      {d.empty ? (
        <EmptyState title="Nenhuma conta ainda"><Txt size={14} color={colors.primary} onPress={() => go("/connect")}>Conecte seus bancos</Txt> ou crie uma conta manual em Ajustes.</EmptyState>
      ) : null}

      {d.banks.length > 0 ? (
        <View style={{ gap: 8 }}>
          <SectionHeader title="Contas" />
          <ListGroup>{d.banks.map((a) => <View key={a.id} style={{ gap: 12, padding: 16 }}><Info a={a} /></View>)}</ListGroup>
        </View>
      ) : null}

      {d.cards.length > 0 ? (
        <View style={{ gap: 8 }}>
          <SectionHeader title="Cartões" />
          <ListGroup>
            {d.cards.map((a) => (
              <View key={a.id} style={{ gap: 12, padding: 16 }}>
                <Info a={a} />
                <PartnerCard account={a} partnerName={d.partnerName} />
              </View>
            ))}
          </ListGroup>
          <Txt size={13} color={colors.mutedForeground} style={{ paddingHorizontal: 4 }}>{d.partnerName} sempre vê as compras do próprio adicional. Esta escolha vale para as suas compras na fatura.</Txt>
        </View>
      ) : null}

      {d.hasPartner ? <Button variant="outline" href="/privacy/preview">{`Ver como ${d.partnerName} vê`}</Button> : null}
      <Txt size={13} color={colors.mutedForeground} center>Contas novas entram como “Só eu vejo”. {d.partnerName} não recebe aviso quando você muda a visibilidade.</Txt>
    </>
  );
}

function PartnerCard({ account, partnerName }: { account: Account; partnerName: string }) {
  const { run, pending } = useAction("setPartnerCard");
  const [last4, setLast4] = useState(account.partner_card_last4 ?? "");
  return (
    <View style={{ gap: 6 }}>
      <Txt size={13} color={colors.mutedForeground}>Final do cartão adicional de {partnerName} (se houver)</Txt>
      <Row gap={8}>
        <View style={{ width: 112 }}><Input value={last4} onChangeText={setLast4} keyboardType="number-pad" maxLength={4} placeholder="7710" /></View>
        <Button variant="ghost" full={false} pending={pending} pendingText="…" onPress={() => run({ accountId: account.id, last4 })}>Salvar</Button>
      </Row>
    </View>
  );
}
