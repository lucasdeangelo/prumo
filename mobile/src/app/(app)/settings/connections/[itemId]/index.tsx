import { formatDayShort } from "@domain/dates";
import { formatBRL } from "@domain/money";
import * as WebBrowser from "expo-web-browser";
import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";

import { useAction } from "@/lib/query";
import { Amount, InstitutionMark, UpdatedAt, VisibilityBadge, type VisibilityKind } from "@/ui/finance";
import { Button, Card, Flex, FormMessage, Label, ListGroup, PageHeader, Row, Txt } from "@/ui/kit";
import { Screen } from "@/ui/screen";
import { colors } from "@/ui/theme";

type Data = {
  itemId: string;
  institution: string;
  firstInstitution: string;
  partnerName: string | null;
  state: "ok" | "expired" | "failed";
  lastSuccessAt: string | null;
  dataUntil: string;
  nextUpdate: string | null;
  consentDay: string | null;
  history: { at: string; label: string; ok: boolean }[];
  main: { balance_cents: number | null; visibility: VisibilityKind } | null;
  recent: { id: string; label: string; date: string; category: string; ours: boolean; cents: number; type: "credit" | "debit" }[];
};

export default function ConnectionScreen() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  return <Screen<Data> path={`settings/connections/${itemId}`} gap={16}>{(d) => (d.state === "expired" ? <Expired d={d} /> : <Healthy d={d} />)}</Screen>;
}

function Expired({ d }: { d: Data }) {
  return (
    <>
      <PageHeader title={d.institution} back="/settings/connections" />
      <Card style={{ gap: 8, borderColor: "rgba(168,53,42,0.3)" }}>
        <Txt size={15} weight="medium">A autorização com {d.institution} venceu{d.consentDay ? ` em ${d.consentDay}` : ""}</Txt>
        <Txt size={14} color={colors.mutedForeground}>Os dados desta conexão estão parados em {d.dataUntil}. Reconectar leva uns 2 minutos e não apaga nada.</Txt>
        <Button href="/connect?step=5">Reconectar</Button>
      </Card>
      {d.main ? (
        <Card style={{ gap: 8 }}>
          <Label>Saldo em {d.dataUntil}</Label>
          <Txt size={24} weight="medium" tabular>{d.main.balance_cents !== null ? formatBRL(Math.abs(d.main.balance_cents)) : "—"}</Txt>
          {d.partnerName ? <VisibilityBadge kind={d.main.visibility} /> : null}
          <UpdatedAt at={d.lastSuccessAt} state="expired" />
        </Card>
      ) : null}
      {d.recent.length > 0 ? (
        <ListGroup>
          {d.recent.map((f) => (
            <Row key={f.id} style={{ minHeight: 56, paddingHorizontal: 16, paddingVertical: 12 }}>
              <Flex>
                <Txt size={15} weight="medium" numberOfLines={1}>{f.label}</Txt>
                <Txt size={13} color={colors.mutedForeground}>{formatDayShort(f.date)} · {f.category}{f.ours ? " · Nosso" : ""}</Txt>
              </Flex>
              <Amount cents={f.cents} type={f.type} />
            </Row>
          ))}
        </ListGroup>
      ) : null}
      {d.partnerName ? <Txt size={13} color={colors.mutedForeground}>{d.partnerName} continua vendo os dados até {d.dataUntil}, com a mesma data de atualização. Ele não recebe aviso sobre a autorização.</Txt> : null}
    </>
  );
}

function Healthy({ d }: { d: Data }) {
  const sync = useAction("pluggySync");
  return (
    <>
      <PageHeader title={d.institution} back="/settings/connections" />
      <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <InstitutionMark name={d.firstInstitution} />
        <Flex>
          {d.state === "failed" ? (
            <>
              <Txt size={15} weight="medium">A atualização de hoje não funcionou</Txt>
              <Txt size={14} color={colors.mutedForeground}>O MeuPluggy não conseguiu atualizar com o banco. Seus dados estão de {d.dataUntil}.{d.nextUpdate ? ` Nova tentativa ${d.nextUpdate}.` : ""}</Txt>
            </>
          ) : (
            <>
              <Txt size={15} weight="medium">Tudo certo</Txt>
              <UpdatedAt at={d.lastSuccessAt} />
              {d.nextUpdate ? <Txt size={13} color={colors.mutedForeground}>Próxima atualização do MeuPluggy: {d.nextUpdate}. Depois disso, toque em “Sincronizar agora”.</Txt> : null}
            </>
          )}
        </Flex>
      </Card>

      {d.history.length > 0 ? (
        <Card style={{ gap: 8 }}>
          <Label>Últimas atualizações</Label>
          {d.history.map((h) => (
            <Row key={h.at} style={{ justifyContent: "space-between" }}>
              <Txt size={14} style={{ textTransform: "capitalize" }}>{h.label}</Txt>
              <Txt size={14} weight={h.ok ? "regular" : "medium"} color={h.ok ? colors.mutedForeground : colors.danger}>{h.ok ? "Atualizado" : "Falhou"}</Txt>
            </Row>
          ))}
        </Card>
      ) : null}

      <Card style={{ gap: 8 }}>
        <Txt size={15} weight="medium">Por que não tem “atualizar agora”?</Txt>
        <Txt size={14} color={colors.mutedForeground}>O MeuPluggy busca os dados do banco uma vez por dia. Se uma falha se repetir por 3 dias, avisamos para você conferir a conexão no MeuPluggy. O botão abaixo só traz o que o MeuPluggy já tem.</Txt>
      </Card>
      <View style={{ gap: 8 }}>
        <Button variant="outline" pending={sync.pending} pendingText="Sincronizando…" onPress={() => sync.run({ itemId: d.itemId })}>Sincronizar agora</Button>
        <FormMessage state={sync.state} />
      </View>
      <Card style={{ gap: 8 }}>
        <Txt size={15} weight="medium">Falta algum banco?</Txt>
        <Txt size={14} color={colors.mutedForeground}>No MeuPluggy, cada banco é autorizado separadamente. Conectou outro banco lá? Autorize aqui também e escolha esse banco na tela do MeuPluggy. Ele entra como uma conexão nova, sem mexer nesta.</Txt>
        <Button variant="outline" href="/connect?step=5">Conectar outro banco</Button>
      </Card>
      <Button variant="outline" onPress={() => WebBrowser.openBrowserAsync("https://meu.pluggy.ai")}>Ver a conexão no MeuPluggy</Button>
    </>
  );
}
