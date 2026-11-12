import { formatBRL } from "@domain/money";
import { router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";

import { CoupleAvatars } from "@/ui/finance";
import { Button, Label, Row, Txt } from "@/ui/kit";
import { Screen } from "@/ui/screen";
import { ShareImageButton } from "@/ui/share-image";
import { colors, type Person } from "@/ui/theme";

type Data = { id: string; pct: string; title: string; name: string; savedCents: number; months: number | null; people: Person[]; everyoneNotified: boolean };

export default function Milestone() {
  const { id, pct } = useLocalSearchParams<{ id: string; pct: string }>();
  return (
    <Screen<Data> path={`couple/goals/${id}/milestone/${pct}`}>
      {(d) => {
        const together = d.people.length > 1;
        return (
          <View style={{ minHeight: 560, justifyContent: "center", alignItems: "center", gap: 20 }}>
            <View style={{ width: 112, height: 112, borderRadius: 56, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
              <Txt size={34} weight="medium" color="#ffffff" lh={40}>{d.pct}%</Txt>
            </View>
            <Label>{d.name}</Label>
            <Txt size={28} weight="medium" tracking={-0.56} center>{d.title}</Txt>
            <Txt color={colors.mutedForeground} center style={{ maxWidth: 320 }}>
              {together ? "Vocês já guardaram" : "Você já guardou"} {formatBRL(d.savedCents)}{together ? " juntos" : ""}.
              {d.pct !== "100" && d.months ? ` Mais ${d.months === 1 ? "um mês" : `${d.months} meses`} nesse ritmo e ${together ? "vocês chegam" : "você chega"} lá.` : ""}
            </Txt>
            {together ? (
              <Row gap={8}>
                <CoupleAvatars people={d.people} size={28} />
                <Txt size={13} color={colors.mutedForeground}>{d.everyoneNotified ? "Os dois receberam este aviso" : "Os dois veem este marco no app"}</Txt>
              </Row>
            ) : null}
            <View style={{ width: "100%", maxWidth: 320, gap: 12 }}>
              <Button onPress={() => router.dismissTo(`/couple/goals/${d.id}` as never)}>Continuar</Button>
              <ShareImageButton title={`${d.name}: ${d.pct}%`} lines={[d.title, `${formatBRL(d.savedCents)} guardados${together ? " juntos" : ""}`]} label="Compartilhar como imagem" />
            </View>
          </View>
        );
      }}
    </Screen>
  );
}
