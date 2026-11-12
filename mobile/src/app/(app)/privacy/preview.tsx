import { formatDayShort } from "@domain/dates";
import { formatBRL } from "@domain/money";
import { View } from "react-native";

import { Amount, Avatar, InstitutionMark, VisibilityBadge } from "@/ui/finance";
import { Button, Card, Flex, Label, PageHeader, Row, Txt } from "@/ui/kit";
import { Screen } from "@/ui/screen";
import { colors, type Person } from "@/ui/theme";

type Line =
  | { kind: "detail" | "category_only"; id: string; label?: string; category: string; amountCents: number; type: "credit" | "debit"; date: string }
  | { kind: "reserved"; id: string; until: string; amountCents: number; date: string };
type Data = {
  partner: Person;
  meName: string;
  accounts: { id: string; name: string; visibility: "totals" | "details"; balanceCents: number | null; monthOutCents: number; lines: Line[] }[];
  freeMoney: { usedCents: number; allowanceCents: number } | null;
  kept: { privateAccounts: string[]; hidden: string[]; freeMoneyCount: number; hiddenSurprises: number };
};

/** Exactly what the partner's screen shows of my accounts, computed by the same projection. */
export default function Preview() {
  return (
    <Screen<Data> path="privacy/preview" gap={16}>
      {(d) => {
        const k = d.kept;
        return (
          <>
            <PageHeader title={`Como ${d.partner.name} vê isso`} back="/privacy/visibility" />
            <Row gap={8}>
              <Avatar person={d.partner} size={24} />
              <Txt size={13} color={colors.mutedForeground}>Prévia da tela de {d.partner.name} · suas contas</Txt>
            </Row>

            {d.accounts.map((account) => (
              <Card key={account.id} padded={false} style={{ gap: 12 }}>
                <Row style={{ paddingHorizontal: 16, paddingTop: 16 }}>
                  <InstitutionMark name={account.name} />
                  <Flex>
                    <Txt size={15} weight="medium" numberOfLines={1}>{account.name} · {d.meName}</Txt>
                    <View style={{ marginTop: 4 }}><VisibilityBadge kind={account.visibility} /></View>
                  </Flex>
                  {account.balanceCents !== null ? <Amount cents={Math.abs(account.balanceCents)} /> : null}
                </Row>
                {account.visibility === "details" ? (
                  account.lines.length > 0 ? (
                    <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
                      {account.lines.map((line, i) => (
                        <Row key={line.id} style={{ minHeight: 56, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                          <Flex>
                            {line.kind === "reserved" ? (
                              <>
                                <Txt size={15} weight="medium" numberOfLines={1}>Compra reservada por {d.meName}</Txt>
                                <Txt size={13} color={colors.mutedForeground}>Detalhes liberados em {formatDayShort(line.until)}</Txt>
                              </>
                            ) : (
                              <>
                                <Txt size={15} weight="medium" numberOfLines={1}>{line.kind === "detail" ? line.label : line.category}</Txt>
                                <Txt size={13} color={colors.mutedForeground}>{line.kind === "detail" ? `${line.category} · ` : ""}{formatDayShort(line.date)}</Txt>
                              </>
                            )}
                          </Flex>
                          <Amount cents={line.amountCents} type={line.kind === "reserved" ? "out" : line.type} />
                        </Row>
                      ))}
                    </View>
                  ) : (
                    <Txt size={13} color={colors.mutedForeground} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 16, paddingVertical: 12 }}>Nenhum lançamento compartilhado neste mês.</Txt>
                  )
                ) : (
                  <Txt size={13} color={colors.mutedForeground} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 16, paddingVertical: 12 }}>Saiu {formatBRL(account.monthOutCents)} no mês · lançamentos não compartilhados.</Txt>
                )}
              </Card>
            ))}

            {d.freeMoney ? (
              <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Flex>
                  <Txt size={15} weight="medium">Dinheiro livre de {d.meName}</Txt>
                  <Txt size={13} color={colors.mutedForeground}>{formatBRL(d.freeMoney.usedCents)} usados de {formatBRL(d.freeMoney.allowanceCents)}</Txt>
                </Flex>
                <VisibilityBadge kind="totals" />
              </Card>
            ) : null}

            <Card style={{ gap: 8 }}>
              <Label>Fica só com você</Label>
              <View style={{ gap: 6 }}>
                {k.privateAccounts.map((name) => <Txt key={name} size={14} color={colors.mutedForeground}>{name} — {d.partner.name} não vê que ela existe.</Txt>)}
                {k.hidden.length > 0 ? <Txt size={14} color={colors.mutedForeground}>{k.hidden.length === 1 ? `1 lançamento oculto (${k.hidden[0]})` : `${k.hidden.length} lançamentos ocultos`} — não aparece nem conta como oculto.</Txt> : null}
                {k.freeMoneyCount > 0 ? <Txt size={14} color={colors.mutedForeground}>{k.freeMoneyCount === 1 ? "1 compra" : `${k.freeMoneyCount} compras`} do dinheiro livre — entram só no total.</Txt> : null}
                {k.hiddenSurprises > 0 ? <Txt size={14} color={colors.mutedForeground}>{k.hiddenSurprises === 1 ? "1 surpresa" : `${k.hiddenSurprises} surpresas`} com valor escondido — entram só no total do mês.</Txt> : null}
                {k.privateAccounts.length + k.hidden.length + k.freeMoneyCount + k.hiddenSurprises === 0 ? <Txt size={14} color={colors.mutedForeground}>Nada além do que você já escolheu nas contas.</Txt> : null}
              </View>
            </Card>

            <Button href="/privacy/visibility">Ajustar visibilidade</Button>
          </>
        );
      }}
    </Screen>
  );
}
