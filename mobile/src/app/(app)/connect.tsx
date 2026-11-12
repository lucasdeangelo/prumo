import { formatDayShort } from "@domain/dates";
import { formatBRL } from "@domain/money";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { PluggyConnect } from "react-native-pluggy-connect";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAction } from "@/lib/query";
import { Avatar, InstitutionMark, VisibilityBadge, type VisibilityKind } from "@/ui/finance";
import { XIcon } from "@/ui/icons";
import { Button, Card, Flex, FormMessage, Label, ListGroup, PageHeader, Press, Row, Toggle, Txt } from "@/ui/kit";
import { Screen } from "@/ui/screen";
import { colors, radius, type Person } from "@/ui/theme";
import { VisibilitySegment } from "@/ui/visibility";

type Account = { id: string; name: string; institution: string | null; type: string | null; card_last4: string | null; balance_cents: number | null; import_enabled: boolean; visibility: "private" | "totals" | "details" };
type Data = { partner: Person | null; validUntil: string; accounts: Account[] };

const MEUPLUGGY_CONNECTOR_ID = 200;
const Title = ({ children }: { children: React.ReactNode }) => <Txt size={28} weight="medium" tracking={-0.56} lh={34}>{children}</Txt>;
const Lead = ({ children }: { children: React.ReactNode }) => <Txt color={colors.mutedForeground}>{children}</Txt>;
const go = (href: string) => router.push(href as never);

function Point({ title, body }: { title: string; body: string }) {
  return (
    <Row gap={12} align="flex-start">
      <View style={{ marginTop: 6, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} />
      <Flex>
        <Txt size={15} weight="medium">{title}</Txt>
        <Txt size={14} color={colors.mutedForeground}>{body}</Txt>
      </Flex>
    </Row>
  );
}

export default function Connect() {
  const { step = "1", item, n } = useLocalSearchParams<{ step?: string; item?: string; n?: string }>();
  return (
    <Screen<Data> path={`connect${item ? `?item=${encodeURIComponent(item)}` : ""}`} gap={24}>
      {(d) => <Step step={step} item={item} n={n} d={d} />}
    </Screen>
  );
}

function Step({ step, item, n, d }: { step: string; item?: string; n?: string; d: Data }) {
  const partnerName = d.partner?.name ?? "seu par";

  if (step === "1") {
    return (
      <>
        <PageHeader back="/settings" />
        <Label>Conectar bancos</Label>
        <Title>Traga seus bancos para o Prumo</Title>
        <Lead>Com o Open Finance, seu banco envia saldos e lançamentos para o Prumo. Você não precisa digitar nada.</Lead>
        <View style={{ gap: 16 }}>
          <Point title="Regulado pelo Banco Central" body="É o sistema oficial de compartilhamento de dados entre instituições." />
          <Point title="Só leitura" body="O Prumo vê seus dados, mas não faz pagamentos nem transferências." />
          <Point title="Você desfaz quando quiser" body="O consentimento pode ser revogado a qualquer momento." />
        </View>
        <View style={{ gap: 8 }}>
          <Button onPress={() => go("/connect?step=2")}>Começar</Button>
          <Button variant="ghost" onPress={() => router.dismissTo("/settings")}>Agora não</Button>
        </View>
      </>
    );
  }

  if (step === "2") {
    return (
      <>
        <PageHeader back="/connect?step=1" />
        <Label>Conectar bancos</Label>
        <Title>São duas etapas, cerca de 6 minutos</Title>
        <Lead>A conexão com os bancos é feita pelo MeuPluggy, parceiro autorizado pelo Banco Central. Depois você libera o acesso para o Prumo.</Lead>
        <View style={{ gap: 12 }}>
          <StepCard title="1 · Conecte seus bancos no MeuPluggy" time="~5 min" body="Você cria uma conta lá e autoriza cada banco no app do próprio banco." />
          <StepCard title="2 · Autorize o Prumo" time="~1 min" body="De volta aqui, você escolhe quais contas trazer e quem vê cada uma." />
        </View>
        {d.partner ? (
          <Row gap={8}>
            <Avatar person={d.partner} size={28} />
            <Txt size={14} color={colors.mutedForeground} style={{ flex: 1 }}>Cada um conecta os próprios bancos, com a própria conta MeuPluggy. {d.partner.name} faz isso no celular dele.</Txt>
          </Row>
        ) : null}
        <View style={{ gap: 8 }}>
          <Button onPress={() => go("/connect?step=3")}>Ir para o MeuPluggy</Button>
          <Button variant="ghost" onPress={() => go("/connect?step=5")}>Já tenho conta no MeuPluggy</Button>
        </View>
      </>
    );
  }

  if (step === "3") {
    return (
      <>
        <PageHeader back="/connect?step=2" />
        <Label>Etapa 1 de 2</Label>
        <Title>Você vai sair do Prumo por alguns minutos</Title>
        <Lead>O MeuPluggy abre no navegador, em meu.pluggy.ai.</Lead>
        <View style={{ gap: 12 }}>
          <Row gap={12} align="flex-start"><Txt weight="medium" color={colors.primary} tabular>1</Txt><Txt style={{ flex: 1 }}>Crie sua conta no MeuPluggy com seu CPF.</Txt></Row>
          <Row gap={12} align="flex-start"><Txt weight="medium" color={colors.primary} tabular>2</Txt><Txt style={{ flex: 1 }}>Conecte cada banco. O app do banco abre para você confirmar.</Txt></Row>
        </View>
        <Txt size={14} color={colors.mutedForeground}>Volte aqui quando terminar. O Prumo guarda onde você parou.</Txt>
        <View style={{ gap: 8 }}>
          <OpenMeuPluggy />
          <Button variant="ghost" onPress={() => router.back()}>Voltar</Button>
        </View>
      </>
    );
  }

  if (step === "4") {
    return (
      <>
        <PageHeader back="/connect?step=3" />
        <Label>Etapa 1 de 2</Label>
        <Title>Terminou de conectar seus bancos?</Title>
        <Lead>Se ainda estiver no MeuPluggy, pode voltar lá. A gente espera.</Lead>
        <View style={{ gap: 8 }}>
          <Button onPress={() => go("/connect?step=5")}>Continuar</Button>
          <OpenMeuPluggy label="Abrir o MeuPluggy de novo" next={null} variant="outline" />
        </View>
      </>
    );
  }

  if (step === "5") {
    return (
      <>
        <PageHeader back="/connect?step=4" />
        <Label>Etapa 2 de 2</Label>
        <Title>Autorizar o Prumo a ler seus dados</Title>
        <Lead>Pelo conector MeuPluggy, com a conta que você acabou de usar.</Lead>
        <Card style={{ gap: 12 }}>
          <Label>O Prumo vai ler</Label>
          <Point title="Contas" body="Saldos e extratos de conta corrente e poupança" />
          <Point title="Cartões de crédito" body="Limite, faturas, compras e parcelas" />
          <Point title="Transações" body="Histórico dos últimos 12 meses e os novos lançamentos" />
        </Card>
        <Card style={{ gap: 8 }}>
          <Label>O Prumo não pode</Label>
          <Txt>Fazer pagamentos, Pix ou transferências</Txt>
          <Txt>Mudar limites, dados ou senhas</Txt>
        </Card>
        <Txt size={14} color={colors.mutedForeground}>
          Válido por 12 meses, até {formatDayShort(d.validUntil)}/{d.validUntil.slice(0, 4)}. Avisamos 15 dias antes. Você pode revogar antes disso em Ajustes › Conexões.
        </Txt>
        <View style={{ gap: 8 }}>
          <AuthorizeButton />
          <Button variant="ghost" onPress={() => router.dismissTo("/settings")}>Cancelar</Button>
        </View>
      </>
    );
  }

  const accounts = d.accounts;
  const nameOf = (a: Account, card: "short" | "long") =>
    `${a.institution ? `${a.institution} · ` : ""}${a.type === "CREDIT" ? (card === "long" ? `Cartão${a.card_last4 ? ` •• ${a.card_last4}` : ""}` : "Cartão de crédito") : a.name}`;

  if (step === "sem-banco") {
    return (
      <>
        <PageHeader back="/connect?step=5" />
        <Label>Etapa 2 de 2</Label>
        <Title>Ainda não há bancos na sua conta MeuPluggy</Title>
        <Lead>Nada foi perdido. Normalmente é uma destas coisas:</Lead>
        <View style={{ gap: 8 }}>
          <Txt>A conexão ainda está sendo processada. Leva até 2 minutos depois que o banco confirma.</Txt>
          <Txt>A autorização no app do banco não foi concluída.</Txt>
          <Txt>Você entrou no MeuPluggy com outro e-mail.</Txt>
        </View>
        <View style={{ gap: 8 }}>
          <Button onPress={() => router.replace(`/connect?step=6&item=${item ?? ""}` as never)}>Verificar de novo</Button>
          <OpenMeuPluggy label="Voltar ao MeuPluggy" next={null} variant="outline" />
          <Button variant="ghost" onPress={() => router.dismissTo("/settings")}>Conectar depois</Button>
        </View>
      </>
    );
  }

  if (step === "6") {
    if (accounts.length === 0) {
      return (
        <>
          <PageHeader title="Conectar bancos" back="/connect?step=5" />
          <Lead>Nenhuma conta encontrada nesta conexão ainda.</Lead>
          <Button onPress={() => router.replace(`/connect?step=sem-banco&item=${item ?? ""}` as never)}>Entender por quê</Button>
        </>
      );
    }
    const chosen = accounts.filter((a) => a.import_enabled);
    return (
      <>
        <PageHeader back="/connect?step=5" />
        <Label>Etapa 2 de 2</Label>
        <Title>Encontramos {accounts.length === 1 ? "1 conta" : `${accounts.length} contas e cartões`}</Title>
        <Lead>
          Tudo começa como <Txt weight="semibold" color={colors.mutedForeground}>Só eu vejo</Txt>.{d.partner ? ` Escolha o que compartilhar com ${partnerName} — dá para mudar depois.` : " Quando seu par entrar, você escolhe o que compartilhar."}
        </Lead>
        <View style={{ gap: 12 }}>{accounts.map((a) => <ImportRow key={a.id} a={a} item={item ?? ""} hasPartner={Boolean(d.partner)} name={nameOf(a, "short")} />)}</View>
        <Button onPress={() => (chosen.length ? go(`/connect?step=7&item=${item}`) : router.dismissTo("/settings"))}>
          {chosen.length ? `Trazer ${chosen.length === 1 ? "1 conta" : `${chosen.length} contas`}` : "Não trazer nada agora"}
        </Button>
        {d.partner ? <Txt size={13} color={colors.mutedForeground} center>{partnerName.charAt(0).toUpperCase() + partnerName.slice(1)} não recebe aviso das suas escolhas.</Txt> : null}
      </>
    );
  }

  if (step === "7" && item) {
    return (
      <>
        <Label>Importando</Label>
        <Title>Trazendo seu histórico dos últimos 12 meses</Title>
        <Lead>Pode levar alguns minutos. Se quiser, siga usando o app: avisamos quando terminar.</Lead>
        <InitialSync itemId={item} accounts={accounts.filter((a) => a.import_enabled).map((a) => ({ id: a.id, name: a.institution ? nameOf(a, "long") : a.name }))} />
        <Button variant="ghost" onPress={() => router.dismissTo("/overview")}>Continuar usando o app</Button>
      </>
    );
  }

  if (step === "parcial") {
    return (
      <>
        <Label>Etapa 2 de 2 · conexão parcial</Label>
        <Title>Conectamos, mas faltou uma parte</Title>
        <Lead>O banco decide o que compartilha pelo Open Finance. Desta vez, nem todos os produtos vieram.</Lead>
        <ListGroup>
          {accounts.map((a) => (
            <Row key={a.id} style={{ minHeight: 56, paddingHorizontal: 16, paddingVertical: 12 }}>
              <Txt size={15} weight="medium" style={{ flex: 1 }}>{a.name}</Txt>
              <Txt size={13} color={colors.mutedForeground}>{a.import_enabled ? "veio" : "não importar"}</Txt>
            </Row>
          ))}
        </ListGroup>
        <Txt size={14} color={colors.mutedForeground}>Você pode tentar de novo no MeuPluggy (às vezes o banco libera depois) ou cadastrar o que faltou à mão enquanto isso.</Txt>
        <View style={{ gap: 8 }}>
          <Button onPress={() => router.replace(`/connect?step=8&item=${item}&n=${n ?? 0}` as never)}>Continuar com o que veio</Button>
          <OpenMeuPluggy label="Tentar de novo no MeuPluggy" next="/connect?step=4" variant="outline" />
          <Button variant="ghost" onPress={() => router.dismissTo("/settings/accounts")}>Cadastrar à mão</Button>
        </View>
      </>
    );
  }

  // Step 8: done.
  const brought = accounts.filter((a) => a.import_enabled);
  return (
    <>
      <View style={{ paddingTop: 24 }}><Title>Seus bancos estão no Prumo</Title></View>
      <Lead>Os dados se atualizam sozinhos uma vez por dia, pelo MeuPluggy.{n && Number(n) ? ` Trouxemos ${Number(n).toLocaleString("pt-BR")} lançamentos.` : ""}</Lead>
      <ListGroup>
        {brought.map((a) => (
          <Row key={a.id} style={{ minHeight: 64, paddingHorizontal: 16, paddingVertical: 12 }}>
            <InstitutionMark name={a.institution ?? a.name} />
            <Flex>
              <Txt size={15} weight="medium" numberOfLines={1}>{nameOf(a, "long")}</Txt>
              {d.partner ? <View style={{ marginTop: 4 }}><VisibilityBadge kind={a.visibility as VisibilityKind} /></View> : null}
            </Flex>
            {a.balance_cents !== null ? <Txt size={15} weight="medium" tabular>{formatBRL(Math.abs(a.balance_cents))}</Txt> : null}
          </Row>
        ))}
      </ListGroup>
      <View style={{ gap: 8 }}>
        <Label>Próximo passo</Label>
        {!d.partner ? <NextCard href="/couple" title="Convidar seu par" body="Ele conecta os bancos dele, do celular dele" /> : null}
        {brought.some((a) => a.type === "CREDIT") ? <NextCard href="/cards" title="Revisar a fatura do cartão" body={`Marcar o que é Nosso, seu e ${d.partner ? `do ${partnerName}` : "do seu par"}`} /> : null}
      </View>
      <Button variant="outline" onPress={() => router.dismissTo("/overview")}>Ir para o início</Button>
    </>
  );
}

function StepCard({ title, time, body }: { title: string; time: string; body: string }) {
  return (
    <Card style={{ gap: 4 }}>
      <Row style={{ justifyContent: "space-between" }}>
        <Txt size={15} weight="medium" style={{ flex: 1 }}>{title}</Txt>
        <Txt size={13} color={colors.mutedForeground}>{time}</Txt>
      </Row>
      <Txt size={14} color={colors.mutedForeground}>{body}</Txt>
    </Card>
  );
}

function NextCard({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Press onPress={() => router.dismissTo(href as never)} style={{ minHeight: 56, justifyContent: "center", borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 16, paddingVertical: 12 }}>
      <Txt size={15} weight="medium">{title}</Txt>
      <Txt size={13} color={colors.mutedForeground}>{body}</Txt>
    </Press>
  );
}

function ImportRow({ a, item, hasPartner, name }: { a: Account; item: string; hasPartner: boolean; name: string }) {
  const { run, pending } = useAction("setImport");
  const returnTo = `/connect?step=6&item=${item}`;
  return (
    <View style={{ gap: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 16, opacity: a.import_enabled ? 1 : 0.6 }}>
      <Row>
        <InstitutionMark name={a.institution ?? a.name} />
        <Flex>
          <Txt size={15} weight="medium" numberOfLines={1}>{name}</Txt>
          <Txt size={13} color={colors.mutedForeground}>
            {a.card_last4 ? `•• ${a.card_last4}` : ""}
            {a.card_last4 && a.balance_cents !== null ? " · " : ""}
            {a.balance_cents !== null ? formatBRL(Math.abs(a.balance_cents)) : ""}
            {!a.import_enabled ? " · não importar" : ""}
          </Txt>
        </Flex>
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: a.import_enabled }} accessibilityLabel={a.import_enabled ? `Não importar ${a.name}` : `Importar ${a.name}`} disabled={pending} onPress={() => run({ accountId: a.id, import: a.import_enabled ? "0" : "1", returnTo })}>
          <Toggle on={a.import_enabled} />
        </Pressable>
      </Row>
      {a.import_enabled && hasPartner ? <VisibilitySegment accountId={a.id} value={a.visibility} returnTo={returnTo} accountName={a.name} /> : null}
    </View>
  );
}

/** Step 3: opens MeuPluggy in the in-app browser, then moves to "De volta ao Prumo". */
function OpenMeuPluggy({ label = "Abrir MeuPluggy", next = "/connect?step=4", variant = "default" }: { label?: string; next?: string | null; variant?: "default" | "outline" }) {
  return (
    <Button
      variant={variant}
      onPress={async () => {
        await WebBrowser.openBrowserAsync("https://meu.pluggy.ai").catch(() => {});
        if (next) go(next);
      }}
    >
      {label}
    </Button>
  );
}

/** Step 5: opens Pluggy Connect on the MeuPluggy connector, then moves to account choice. */
function AuthorizeButton() {
  const token = useAction<{ token?: string; includeSandbox?: boolean; error?: string }>("connectToken");
  const stage = useAction<{ itemId?: string; accounts?: number; error?: string }>("stageConnection");
  const existing = useAction<{ itemId?: string; accounts?: number; error?: string }>("stageExisting");
  const [widget, setWidget] = useState<{ token: string; includeSandbox: boolean } | null>(null);
  const [error, setError] = useState<string>();

  const staged = (result?: { itemId?: string; accounts?: number; error?: string }) => {
    if (!result || result.error || !result.itemId) {
      setError(result?.error ?? "Não foi possível concluir a conexão.");
      return;
    }
    go(result.accounts ? `/connect?step=6&item=${result.itemId}` : `/connect?step=sem-banco&item=${result.itemId}`);
  };

  const open = async () => {
    setError(undefined);
    const result = await token.run();
    if (!result?.token) return setError(result?.error ?? "Não foi possível abrir a autorização.");
    setWidget({ token: result.token, includeSandbox: Boolean(result.includeSandbox) });
  };

  const busy = token.pending || stage.pending || existing.pending;
  return (
    <View style={{ gap: 8 }}>
      <Button pending={busy} pendingText="Aguarde…" onPress={open}>Autorizar e escolher contas</Button>
      <FormMessage state={error ? { error } : undefined} />
      <Modal visible={Boolean(widget)} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setWidget(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.card }} edges={["top", "bottom"]}>
          <Row style={{ justifyContent: "flex-end", paddingHorizontal: 8 }}>
            <Pressable accessibilityLabel="Fechar" onPress={() => setWidget(null)} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}><XIcon size={20} /></Pressable>
          </Row>
          {widget ? (
            <PluggyConnect
              connectToken={widget.token}
              includeSandbox={widget.includeSandbox}
              connectorIds={widget.includeSandbox ? undefined : [MEUPLUGGY_CONNECTOR_ID]}
              selectedConnectorId={widget.includeSandbox ? undefined : MEUPLUGGY_CONNECTOR_ID}
              language="pt"
              theme="light"
              onClose={() => setWidget(null)}
              onSuccess={async ({ item }) => {
                setWidget(null);
                staged(await stage.run(undefined, [item.id]));
              }}
              onError={async ({ message }) => {
                setWidget(null);
                // Older connect tokens could still refuse a second bank; fall back to the last connection.
                if (message.includes("ITEM_USER_ALREADY_EXISTS")) staged(await existing.run());
                else setError(`Pluggy: ${message}`);
              }}
            />
          ) : null}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

/** Step 7: imports the chosen accounts' history and moves on when done. */
function InitialSync({ itemId, accounts }: { itemId: string; accounts: { id: string; name: string }[] }) {
  const { run } = useAction<{ imported?: number; accounts?: number; partial?: boolean; error?: string }>("importConnection");
  const started = useRef(false);
  const [error, setError] = useState<string>();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000);
    if (!started.current) {
      started.current = true;
      run(undefined, [itemId]).then((result) => {
        clearInterval(timer);
        if (!result || result.error) setError(result?.error ?? "Algo deu errado. Tente novamente.");
        else router.replace(`/connect?step=${result.partial ? "parcial" : "8"}&item=${itemId}&n=${result.imported ?? 0}` as never);
      });
    }
    return () => clearInterval(timer);
  }, [itemId, run]);

  // An honest, slowing progress: it never claims to be done before the server says so.
  const progress = Math.min(92, Math.round(100 * (1 - Math.exp(-elapsed / 25))));
  return (
    <View style={{ gap: 20 }}>
      <View style={{ gap: 8 }}>
        <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: progress }} style={{ height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: "hidden" }}>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.primary, width: `${error ? 0 : progress}%` }} />
        </View>
        <Txt size={13} color={colors.mutedForeground} tabular>{error ? "Parou" : `${progress}%`}</Txt>
      </View>
      <ListGroup>
        {accounts.map((a) => (
          <Row key={a.id} style={{ minHeight: 56, paddingHorizontal: 16, paddingVertical: 12 }}>
            <Txt size={15} weight="medium" numberOfLines={1} style={{ flex: 1 }}>{a.name}</Txt>
            <Txt size={13} color={colors.mutedForeground}>{error ? "—" : "trazendo…"}</Txt>
          </Row>
        ))}
      </ListGroup>
      <FormMessage state={error ? { error } : undefined} />
    </View>
  );
}
