import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChatIcon, HomeIcon, PrumoSymbol, RepeatIcon } from "@/ui/icons";
import { Button, Card, Label, Row, Txt } from "@/ui/kit";
import { PrumoLogo } from "@/ui/logo";
import { colors } from "@/ui/theme";

// Copy from the "01 Marca" board: the plumb line, and three principles.
const principles = [
  { n: "01", title: "Clareza antes de tudo", text: "Um número por vez. Se não ajuda a decidir, sai da tela." },
  { n: "02", title: "Equilíbrio, não vigilância", text: "O que é de cada um e o que é do casal, sem placar e sem culpa." },
  { n: "03", title: "Calma como padrão", text: "Muito espaço, pouca cor, alertas raros. Dinheiro já gera ruído suficiente." },
];

const features = [
  { icon: HomeIcon, title: "Seu mês em um lugar", text: "Entradas e saídas com tags automáticas, contas futuras e gráficos por tag." },
  { icon: RepeatIcon, title: "Assinaturas sob controle", text: "O Prumo encontra cobranças repetidas e avisa antes de cada uma." },
  { icon: ChatIcon, title: "Direto no WhatsApp", text: "Mande “gastei 45 no mercado” e receba avisos de contas antes do vencimento." },
];

export default function Welcome() {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: Math.max(20, insets.top + 8), paddingBottom: Math.max(32, insets.bottom + 16) }}>
      <Row style={{ justifyContent: "space-between", paddingVertical: 12 }}>
        <PrumoLogo />
        <Button variant="ghost" size="sm" full={false} href="/login">Entrar</Button>
      </Row>

      <View style={{ gap: 24, paddingVertical: 56 }}>
        <Label>Finanças pessoais e do casal</Label>
        <Txt size={40} weight="medium" lh={43} tracking={-1.2}>Finanças a dois, no prumo.</Txt>
        <Txt size={16} lh={28} color={colors.mutedForeground}>
          O prumo é o fio com peso que encontra a vertical. Para o casal, é o ponto de equilíbrio: duas vidas financeiras distintas, alinhadas na mesma direção.
        </Txt>
        <View style={{ gap: 12 }}>
          <Button href="/signup">Criar conta grátis</Button>
          <Button variant="outline" href="/login">Já tenho conta</Button>
        </View>
      </View>

      <Card style={{ padding: 24 }}>
        <Row gap={16} style={{ marginBottom: 24 }}>
          <View style={{ width: 56, height: 56, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
            <PrumoSymbol height={36} color="#ffffff" />
          </View>
          <Label>Princípios</Label>
        </Row>
        {principles.map((p, i) => (
          <View key={p.n} style={{ flexDirection: "row", borderTopWidth: 1, borderBottomWidth: i === principles.length - 1 ? 1 : 0, borderColor: colors.border, paddingVertical: 16 }}>
            <Txt mono size={13} color={colors.mutedForeground} style={{ width: 40 }}>{p.n}</Txt>
            <View style={{ flex: 1, gap: 4 }}>
              <Txt size={18} weight="medium">{p.title}</Txt>
              <Txt size={15} lh={22} color={colors.mutedForeground}>{p.text}</Txt>
            </View>
          </View>
        ))}
      </Card>

      <View style={{ borderTopWidth: 1, borderColor: colors.border, marginTop: 40, paddingTop: 40, gap: 16 }}>
        <Txt size={24} weight="medium" tracking={-0.36} style={{ marginBottom: 12 }}>O que o Prumo faz hoje</Txt>
        {features.map(({ icon: Icon, title, text }) => (
          <Card key={title} style={{ padding: 24 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center" }}><Icon size={20} color={colors.primary} /></View>
            <Txt size={18} weight="semibold" style={{ marginTop: 20 }}>{title}</Txt>
            <Txt size={15} lh={24} color={colors.mutedForeground} style={{ marginTop: 8 }}>{text}</Txt>
          </Card>
        ))}
      </View>
      <Row gap={8} style={{ borderTopWidth: 1, borderColor: colors.border, marginTop: 40, paddingVertical: 24 }}>
        <PrumoSymbol height={16} color={colors.mutedForeground} />
        <Txt size={14} color={colors.mutedForeground}>Prumo · finanças a dois, no prumo.</Txt>
      </Row>
    </ScrollView>
  );
}
