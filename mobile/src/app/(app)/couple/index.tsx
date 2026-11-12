import * as Linking from "expo-linking";
import { router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";

import { useAction } from "@/lib/query";
import { useSession } from "@/lib/session";
import { CoupleAvatars } from "@/ui/finance";
import { useFields } from "@/ui/forms";
import { Button, Card, CardTitle, Field, FormMessage, Input, Notice, PageHeader, Row, Select, Stack, Txt } from "@/ui/kit";
import { Screen } from "@/ui/screen";
import { colors, radius, type Person } from "@/ui/theme";

type Data =
  | { paired: false; convite: string | null; appUrl: string | null }
  | {
      paired: true;
      entrou: boolean;
      people: Person[];
      since: string;
      partnerName: string;
      proposals: { id: string; title: string; description: string; mine: boolean }[];
      incomeText: string;
      pixKey: string;
      defaultSplit: "income" | "equal";
      splitNote: string;
      equalCategories: string;
    };

export default function Couple() {
  const { convite, entrou } = useLocalSearchParams<{ convite?: string; entrou?: string }>();
  const qs = new URLSearchParams();
  if (convite) qs.set("convite", convite);
  if (entrou) qs.set("entrou", entrou);
  return <Screen<Data> path={`couple${qs.toString() ? `?${qs}` : ""}`} keyboard gap={16}>{(d) => (d.paired ? <Paired d={d} /> : <Single d={d} />)}</Screen>;
}

function Single({ d }: { d: Extract<Data, { paired: false }> }) {
  return (
    <>
      <PageHeader title="Seu par no Prumo" back="/settings" />
      <Card style={{ gap: 12 }}>
        <CardTitle>Convidar</CardTitle>
        <Txt size={14} color={colors.mutedForeground} style={{ marginTop: -12 }}>Cada um continua dono do que é seu: contas novas começam como “Só eu vejo”, e vocês escolhem juntos o que é dos dois.</Txt>
        <InviteButton appUrl={d.appUrl} />
      </Card>
      <Card style={{ gap: 12 }}>
        <CardTitle>Recebi um convite</CardTitle>
        <JoinForm defaultCode={d.convite ?? ""} />
      </Card>
    </>
  );
}

function InviteButton({ appUrl }: { appUrl: string | null }) {
  const { run, pending, state } = useAction("createInvite");
  const link = state?.code && appUrl ? `${appUrl.replace(/\/$/, "")}/signup?convite=${encodeURIComponent(state.code)}` : null;
  const share = link ? `Vem organizar nossas finanças comigo no Prumo: ${link} (código ${state!.code})` : state?.code ? `Meu código do Prumo: ${state.code}` : "";
  return (
    <View style={{ gap: 12 }}>
      {state?.code ? (
        <View style={{ borderRadius: radius.md, backgroundColor: colors.muted, padding: 16, alignItems: "center" }}>
          <Txt size={13} color={colors.mutedForeground}>Envie este código para o seu par:</Txt>
          <Txt selectable size={24} weight="semibold" tabular tracking={2.4} lh={32} style={{ marginTop: 4 }}>{state.code}</Txt>
          <Txt size={13} color={colors.mutedForeground} style={{ marginTop: 4 }}>Vale por 7 dias, uma vez só.</Txt>
        </View>
      ) : null}
      {share ? <Button onPress={() => Linking.openURL(`https://wa.me/?text=${encodeURIComponent(share)}`)}>Enviar pelo WhatsApp</Button> : null}
      <Button variant={state?.code ? "outline" : "default"} pending={pending} pendingText="Gerando…" onPress={() => run()}>{state?.code ? "Gerar outro código" : "Convidar meu par"}</Button>
      <FormMessage state={state?.error ? { error: state.error } : undefined} />
    </View>
  );
}

function JoinForm({ defaultCode }: { defaultCode: string }) {
  const { run, pending, state } = useAction("joinHousehold");
  const [code, setCode] = useFields({ code: defaultCode });
  return (
    <Stack gap={12}>
      <Field label="Código do convite"><Input value={code.code} onChangeText={setCode("code")} placeholder="ABCD-1234" autoCapitalize="characters" autoCorrect={false} /></Field>
      <FormMessage state={state} />
      <Button variant="outline" pending={pending} pendingText="Entrando…" onPress={() => run(code)}>Entrar na casa</Button>
    </Stack>
  );
}

function Paired({ d }: { d: Extract<Data, { paired: true }> }) {
  const decide = useAction("decideProposal");
  const split = useAction("proposeSplit");
  const { setSpace } = useSession();
  const leave = useAction("leaveHousehold", { onRedirect: () => { setSpace("meu"); router.dismissTo("/settings"); } });
  const member = useAction("updateMember");
  const [m, setM] = useFields({ income: d.incomeText, pixKey: d.pixKey });
  const [s, setS] = useFields({ defaultSplit: d.defaultSplit as string, equalCategories: d.equalCategories });

  return (
    <>
      <PageHeader title="Perfil do casal" back="/settings" />
      {d.entrou ? <Notice>Pronto! Agora vocês dois estão no Prumo.</Notice> : null}

      <Card style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
        <CoupleAvatars people={d.people} size={44} />
        <View style={{ flex: 1 }}>
          <Txt size={18} weight="medium">{d.people[0].name} e {d.people[1].name}</Txt>
          <Txt size={13} color={colors.mutedForeground}>Juntos no Prumo desde {d.since}</Txt>
        </View>
      </Card>

      {d.proposals.length > 0 ? (
        <Card style={{ gap: 12 }}>
          <CardTitle>Esperando confirmação</CardTitle>
          {d.proposals.map((p) => (
            <View key={p.id} style={{ gap: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 12 }}>
              <Txt size={15} weight="medium">{p.title}</Txt>
              <Txt size={14} color={colors.mutedForeground}>{p.description}</Txt>
              <Txt size={13} color={colors.mutedForeground}>{p.mine ? `Você propôs. Aguardando ${d.partnerName}.` : `${d.partnerName} propôs.`}</Txt>
              {p.mine ? (
                <Button variant="ghost" pending={decide.pending} onPress={() => decide.run({ id: p.id, accept: "0", returnTo: "/couple" })}>Retirar proposta</Button>
              ) : (
                <Row gap={8}>
                  <Button style={{ flex: 1 }} variant="outline" pending={decide.pending} pendingText="…" onPress={() => decide.run({ id: p.id, accept: "0", returnTo: "/couple" })}>Vamos conversar</Button>
                  <Button style={{ flex: 1 }} pending={decide.pending} pendingText="…" onPress={() => decide.run({ id: p.id, accept: "1", returnTo: "/couple" })}>Confirmar</Button>
                </Row>
              )}
            </View>
          ))}
        </Card>
      ) : null}

      <Card style={{ gap: 12 }}>
        <CardTitle>Você</CardTitle>
        <View style={{ gap: 12, marginTop: -12 }}>
          <Field label="Sua renda mensal" hint="Usada só para dividir pela renda. Seu par vê a proporção, não o valor."><Input value={m.income} onChangeText={setM("income")} keyboardType="decimal-pad" placeholder="0,00" /></Field>
          <Field label="Sua chave Pix" hint="Para o acerto: o Prumo monta o Pix copia e cola para o seu par."><Input value={m.pixKey} onChangeText={setM("pixKey")} placeholder="celular, e-mail, CPF ou chave aleatória" autoCapitalize="none" autoCorrect={false} /></Field>
          <FormMessage state={member.state} />
          <Button variant="secondary" pending={member.pending} onPress={() => member.run(m)}>Salvar</Button>
        </View>
      </Card>

      <Card style={{ gap: 12 }}>
        <CardTitle>Divisão das contas</CardTitle>
        <View style={{ gap: 12, marginTop: -12 }}>
          <Txt size={14} color={colors.mutedForeground}>{d.splitNote}</Txt>
          <Select label="Regra padrão" value={s.defaultSplit} onChange={setS("defaultSplit")} options={[{ value: "income", label: "Proporcional à renda" }, { value: "equal", label: "50/50" }]} />
          <Field label="Categorias sempre 50/50"><Input value={s.equalCategories} onChangeText={setS("equalCategories")} placeholder="Ex.: Lazer, Viagens" /></Field>
          <Button variant="secondary" pending={split.pending} onPress={() => split.run(s)}>{`Propor para ${d.partnerName}`}</Button>
          <Txt size={13} color={colors.mutedForeground}>Muda quando {d.partnerName} confirmar.</Txt>
        </View>
      </Card>

      <View style={{ gap: 4 }}>
        <Button variant="ghost" color={colors.danger} pending={leave.pending} pendingText="Saindo…" onPress={() => leave.run()}>Sair da casa</Button>
        <Txt size={13} color={colors.mutedForeground} center>Cada um fica com o que é seu. O que era Nosso volta para quem lançou.</Txt>
      </View>
    </>
  );
}
