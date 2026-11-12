import { router } from "expo-router";

import { UpdatedAt } from "@/ui/finance";
import { Button, Card, PageHeader, Txt } from "@/ui/kit";
import { Screen } from "@/ui/screen";

type Data = { at: string | null; partnerName: string | null };

export default function UpdatesHelp() {
  return (
    <Screen<Data> path="help/updates">
      {(d) => (
        <>
          <PageHeader back="/overview" />
          <UpdatedAt at={d.at} />
          <Txt size={28} weight="medium" tracking={-0.56} lh={34}>Os dados chegam uma vez por dia</Txt>
          <Card style={{ gap: 12 }}>
            <Txt>O MeuPluggy busca os dados nos bancos de madrugada e o Prumo atualiza logo depois.</Txt>
            <Txt>Uma compra feita hoje aparece amanhã. Se precisar dela agora, registre à mão ou pelo WhatsApp.</Txt>
            {d.partnerName ? <Txt>Você e {d.partnerName} veem a mesma data de atualização em tudo o que é compartilhado.</Txt> : null}
          </Card>
          <Button onPress={() => (router.canGoBack() ? router.back() : router.replace("/overview"))}>Entendi</Button>
        </>
      )}
    </Screen>
  );
}
