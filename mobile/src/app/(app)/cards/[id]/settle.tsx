import { formatDayLabel } from "@domain/dates";
import { formatBRL } from "@domain/money";
import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";

import { useAction } from "@/lib/query";
import { CopyButton } from "@/ui/copy";
import { Avatar, SpaceChip } from "@/ui/finance";
import { Button, Card, Label, Notice, PageHeader, Row, TextLink, Txt } from "@/ui/kit";
import { Screen } from "@/ui/screen";
import { colors, fonts, radius, type Person } from "@/ui/theme";

type Data = {
  cardId: string;
  offset: number;
  me: Person;
  partner: Person;
  holder: Person;
  other: Person;
  holderIsMe: boolean;
  viewerIsHolder: boolean;
  hasAdditional: boolean;
  monthKey: string;
  month: string;
  due: string;
  amountCents: number;
  totalCents: number;
  partnerShareOfOursCents: number;
  partnerPurchasesCents: number;
  sharesLabel: string | null;
  pix: string | null;
  pixKeyMasked: string | null;
  settledAt: string | null;
};

export default function SettleScreen() {
  const { id, m } = useLocalSearchParams<{ id: string; m?: string }>();
  return <Screen<Data> path={`cards/${id}/settle?m=${m ?? 0}`} gap={16}>{(d) => <SettleView d={d} />}</Screen>;
}

function SettleView({ d }: { d: Data }) {
  const settle = useAction("settleInvoice");
  return (
    <>
      <Row gap={8}>
        <PageHeader back={`/cards/${d.cardId}/split?m=${d.offset}`} />
        <SpaceChip space="nosso" caption={`Nosso · ${d.me.name} e ${d.partner.name} veem`} me={d.me.color} />
      </Row>
      <Txt size={24} weight="medium" tracking={-0.48} lh={30}>Acerto da fatura de {d.month}</Txt>

      <Card style={{ alignItems: "center", gap: 12 }}>
        <Txt size={14} color={colors.mutedForeground} center>Para fechar a fatura, {d.other.name} transfere para {d.holder.name}</Txt>
        <Row gap={8}>
          <Avatar person={d.other} size={36} />
          <Txt color={colors.mutedForeground}>→</Txt>
          <Avatar person={d.holder} size={36} />
        </Row>
        <Txt size={36} weight="medium" tabular tracking={-1.08} lh={44}>{formatBRL(d.amountCents)}</Txt>
        <Txt size={14} color={colors.mutedForeground}>Até {formatDayLabel(d.due)} — dia do vencimento</Txt>
      </Card>

      <Card style={{ gap: 8 }}>
        <Line label={`${d.holder.name} paga a fatura inteira`} value={formatBRL(d.totalCents)} />
        <Line label={`Parte de ${d.other.name} no que é Nosso${d.sharesLabel ? ` (${d.sharesLabel})` : ""}`} value={formatBRL(d.partnerShareOfOursCents)} />
        <Line label={`Compras de ${d.other.name}${d.hasAdditional ? " no adicional" : ""}`} value={formatBRL(d.partnerPurchasesCents)} />
        <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 }}>
          <Line label={`${d.other.name} transfere`} value={formatBRL(d.amountCents)} strong />
        </View>
      </Card>

      {d.amountCents > 0 ? (
        d.pix ? (
          <Card style={{ gap: 8 }}>
            <Txt size={15} weight="medium">Pix para {d.holder.name}</Txt>
            <Txt size={13} color={colors.mutedForeground}>Chave: {d.pixKeyMasked}</Txt>
            <Label>Pix copia e cola</Label>
            <View style={{ borderRadius: radius.md, backgroundColor: colors.muted, padding: 12 }}>
              <Txt selectable size={12} style={{ fontFamily: fonts.mono }}>{d.pix}</Txt>
            </View>
            <Txt size={13} color={colors.mutedForeground}>Descrição: Prumo · fatura {d.month.slice(0, 3)}</Txt>
            <CopyButton text={d.pix} label={d.viewerIsHolder ? `Copiar e enviar para ${d.other.name}` : "Copiar Pix"} share={d.viewerIsHolder} />
          </Card>
        ) : (
          <Card style={{ gap: 8 }}>
            <Txt size={14}>{d.holder.name} ainda não cadastrou a chave Pix.</Txt>
            {d.holderIsMe ? <TextLink href="/couple">Cadastrar minha chave Pix</TextLink> : <Txt size={14} color={colors.mutedForeground}>Peça para {d.holder.name} cadastrar em Ajustes › Perfil do casal.</Txt>}
          </Card>
        )
      ) : null}
      <Txt size={13} color={colors.mutedForeground} center>O Prumo não movimenta dinheiro: o Pix é pago no app do banco.</Txt>

      {d.settledAt ? (
        <Notice>Acertado em {formatDayLabel(d.settledAt)}.</Notice>
      ) : d.amountCents > 0 ? (
        <Button variant="outline" pending={settle.pending} onPress={() => settle.run({ cardId: d.cardId, month: d.monthKey, amount: d.amountCents, returnTo: `/cards/${d.cardId}/split?m=${d.offset}` })}>Já está acertado</Button>
      ) : null}
    </>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <Row gap={12} style={{ justifyContent: "space-between" }}>
      <Txt size={14} weight={strong ? "medium" : "regular"} style={{ flex: 1 }}>{label}</Txt>
      <Txt size={14} weight={strong ? "medium" : "regular"} tabular>{value}</Txt>
    </Row>
  );
}
