import * as Linking from "expo-linking";
import { View } from "react-native";

import { useAction } from "@/lib/query";
import { MessageIcon } from "@/ui/icons";
import { Button, Card, FormMessage, Label, PageHeader, Row, Txt } from "@/ui/kit";
import { Screen } from "@/ui/screen";
import { colors, radius } from "@/ui/theme";

type Data = { linked: boolean; phone: string | null; botNumber: string | null };

export default function Whatsapp() {
  return <Screen<Data> path="settings/whatsapp" gap={16}>{(d) => <WhatsappView d={d} />}</Screen>;
}

function WhatsappView({ d }: { d: Data }) {
  const unlink = useAction("whatsappUnlink");
  return (
    <>
      <PageHeader title="WhatsApp" back="/settings" />
      <Card style={{ gap: 12 }}>
        {d.linked ? (
          <>
            <Txt>
              {d.phone ? <>Vinculado ao número <Txt weight="semibold" tabular>{d.phone}</Txt></> : "WhatsApp vinculado"}. Envie <Txt style={{ fontStyle: "italic" }}>ajuda</Txt> para o bot ver os comandos.
            </Txt>
            <Button variant="ghost" color={colors.danger} pending={unlink.pending} pendingText="…" onPress={() => unlink.run()}>Desvincular</Button>
          </>
        ) : (
          <>
            <Txt size={14} color={colors.mutedForeground}>Registre gastos por mensagem e receba avisos de contas, assinaturas, orçamento do lar e combinados.</Txt>
            <LinkCode botNumber={d.botNumber} />
          </>
        )}
      </Card>
      <Card style={{ gap: 6 }}>
        <Label>Exemplos</Label>
        {["gastei 45,90 no mercado", "recebi 3500 salário", "paguei aluguel", "resumo · saldo · contas · assinaturas"].map((t) => <Txt key={t} size={14}>{t}</Txt>)}
      </Card>
    </>
  );
}

function LinkCode({ botNumber }: { botNumber: string | null }) {
  const { run, pending, state } = useAction<{ code?: string; expiresAt?: string; error?: string }>("whatsappCode");
  const deepLink = state?.code && botNumber ? `https://wa.me/${botNumber.replace(/\D/g, "")}?text=${encodeURIComponent(`vincular ${state.code}`)}` : null;
  return (
    <View style={{ gap: 12 }}>
      {state?.code ? (
        <View style={{ borderRadius: radius.md, backgroundColor: colors.muted, padding: 12, alignItems: "center" }}>
          <Txt size={12} color={colors.mutedForeground}>Envie para o número do bot:</Txt>
          <Txt selectable size={24} weight="semibold" tabular tracking={2.4} lh={32} center style={{ marginTop: 4 }}>vincular {state.code}</Txt>
          <Txt size={12} color={colors.mutedForeground} style={{ marginTop: 4 }}>Válido por 15 minutos, uso único.</Txt>
        </View>
      ) : null}
      {deepLink ? (
        <Button size="sm" onPress={() => Linking.openURL(deepLink)}>
          <Row gap={8}><MessageIcon size={16} color="#ffffff" /><Txt size={14} weight="medium" color="#ffffff">Abrir no WhatsApp</Txt></Row>
        </Button>
      ) : null}
      <Button variant={state?.code ? "outline" : "default"} pending={pending} pendingText="Gerando…" onPress={() => run()}>{state?.code ? "Gerar outro código" : "Vincular WhatsApp"}</Button>
      <FormMessage state={state?.error ? { error: state.error } : undefined} />
    </View>
  );
}
