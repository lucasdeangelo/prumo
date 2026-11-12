import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { useAction } from "@/lib/query";
import { InstitutionMark } from "@/ui/finance";
import { Button, Card, Label, PageHeader, RadioCard, Row, Txt } from "@/ui/kit";
import { Screen } from "@/ui/screen";
import { colors } from "@/ui/theme";

type Data = { itemId: string; name: string; firstInstitution: string; many: boolean; partnerName: string | null; hasCard: boolean; today: string };

export default function Disconnect() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  return <Screen<Data> path={`settings/connections/${itemId}/disconnect`} gap={16}>{(d) => <DisconnectView d={d} />}</Screen>;
}

function DisconnectView({ d }: { d: Data }) {
  const [history, setHistory] = useState<"keep" | "purge">("keep");
  const { run, pending } = useAction("disconnect", { onRedirect: (to) => router.dismissTo(to as never) });
  return (
    <>
      <PageHeader title="Conexões" back="/settings/connections" />
      <Row>
        <InstitutionMark name={d.firstInstitution} />
        <Txt size={24} weight="medium" tracking={-0.48} lh={30} style={{ flex: 1 }}>Desconectar {d.name}?</Txt>
      </Row>
      <Txt color={colors.mutedForeground}>
        O Prumo para de receber dados novos desta conexão.{d.many ? " Pelo MeuPluggy, seus bancos estão numa conexão só: todos param juntos." : ""}
      </Txt>
      <View style={{ gap: 8 }}>
        <Txt size={15} weight="medium" style={{ marginBottom: 4 }}>E o histórico já importado?</Txt>
        <RadioCard selected={history === "keep"} onPress={() => setHistory("keep")} title="Manter" body={`Lançamentos, fatura e acertos ${d.partnerName ? "de vocês " : ""}continuam como estão.`} />
        <RadioCard selected={history === "purge"} onPress={() => setHistory("purge")} title="Apagar do Prumo" body="Some de todas as telas. Metas e acertos já feitos ficam, sem os detalhes." />
      </View>
      {d.partnerName ? (
        <Card style={{ gap: 6 }}>
          <Label>E para {d.partnerName}</Label>
          <Txt size={14}>Ele continua vendo o que já via, até {d.today}, com a data da última atualização.</Txt>
          {d.hasCard ? <Txt size={14}>As compras do adicional dele não entram mais sozinhas na fatura de vocês.</Txt> : null}
        </Card>
      ) : null}
      <Txt size={13} color={colors.mutedForeground}>Para encerrar o consentimento com o banco também, revogue no MeuPluggy depois.</Txt>
      <Button variant="danger" pending={pending} pendingText="Desconectando…" onPress={() => run({ itemId: d.itemId, history })}>{`Desconectar ${d.firstInstitution}`}</Button>
      <Button variant="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace("/settings/connections"))}>Cancelar</Button>
    </>
  );
}
