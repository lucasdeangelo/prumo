import Link from "next/link";

import { setImportAction } from "@/app/(app)/connect/actions";
import { PageHeader } from "@/components/app/bits";
import { Avatar, InstitutionMark, VisibilityBadge } from "@/components/app/couple";
import { AuthorizeButton, InitialSync, OpenMeuPluggy } from "@/components/app/connect-client";
import { VisibilitySegment } from "@/components/app/visibility-segment";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/app/money";
import { requireUser } from "@/lib/auth/session";
import { loadAccounts } from "@/lib/application/couple-data";
import { getHousehold } from "@/lib/application/household";
import { addDays, formatDayShort, todayIn } from "@/lib/domain/dates";
import { createAdminClient } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";

export const metadata = { title: "Conectar bancos · Prumo" };

type Search = { step?: string; item?: string; n?: string };

const primaryLink = "inline-flex min-h-12 w-full items-center justify-center rounded-full bg-primary px-6 text-[15px] font-medium text-primary-foreground hover:bg-primary-press hover:text-primary-foreground";
const ghostLink = "inline-flex min-h-12 w-full items-center justify-center rounded-full px-6 text-[15px] font-medium text-foreground hover:bg-muted hover:text-foreground";
const outlineLink = "inline-flex min-h-12 w-full items-center justify-center rounded-full border border-foreground px-6 text-[15px] font-medium text-foreground hover:text-foreground";

function Stage({ label }: { label: string }) {
  return <p className="label-mono">{label}</p>;
}

function Point({ title, body }: { title: string; body: string }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
      <span>
        <span className="block text-[15px] font-medium">{title}</span>
        <span className="block text-sm text-muted-foreground">{body}</span>
      </span>
    </li>
  );
}

async function itemAccounts(userId: string, itemId: string | undefined) {
  if (!itemId || !/^[0-9a-f-]{36}$/i.test(itemId)) return { row: null, accounts: [] };
  const { data: row } = await createAdminClient().from("pluggy_items").select("id, pluggy_item_id, consent_expires_at, created_at").eq("user_id", userId).eq("pluggy_item_id", itemId).is("deleted_at", null).maybeSingle();
  if (!row) return { row: null, accounts: [] };
  const accounts = (await loadAccounts([userId])).filter((a) => a.pluggy_item_id === row.id);
  return { row, accounts };
}

export default async function ConnectPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { step = "1", item, n } = await searchParams;
  const { user } = await requireUser();
  const household = await getHousehold(user.id);
  const partnerName = household?.partner?.name ?? "seu par";
  const Partner = household?.partner;

  if (step === "1") {
    return (
      <div className="grid gap-6">
        <PageHeader title="" back="/settings" />
        <Stage label="Conectar bancos" />
        <h1 className="text-[28px] font-medium leading-tight tracking-[-0.02em]">Traga seus bancos para o Prumo</h1>
        <p className="text-[15px] text-muted-foreground">Com o Open Finance, seu banco envia saldos e lançamentos para o Prumo. Você não precisa digitar nada.</p>
        <ul className="grid gap-4">
          <Point title="Regulado pelo Banco Central" body="É o sistema oficial de compartilhamento de dados entre instituições." />
          <Point title="Só leitura" body="O Prumo vê seus dados, mas não faz pagamentos nem transferências." />
          <Point title="Você desfaz quando quiser" body="O consentimento pode ser revogado a qualquer momento." />
        </ul>
        <div className="grid gap-2">
          <Link href="/connect?step=2" className={primaryLink}>Começar</Link>
          <Link href="/settings" className={ghostLink}>Agora não</Link>
        </div>
      </div>
    );
  }

  if (step === "2") {
    return (
      <div className="grid gap-6">
        <PageHeader title="" back="/connect?step=1" />
        <Stage label="Conectar bancos" />
        <h1 className="text-[28px] font-medium leading-tight tracking-[-0.02em]">São duas etapas, cerca de 6 minutos</h1>
        <p className="text-[15px] text-muted-foreground">A conexão com os bancos é feita pelo MeuPluggy, parceiro autorizado pelo Banco Central. Depois você libera o acesso para o Prumo.</p>
        <ol className="grid gap-3">
          <Card className="grid gap-1">
            <div className="flex items-center justify-between"><span className="text-[15px] font-medium">1 · Conecte seus bancos no MeuPluggy</span><span className="text-[13px] text-muted-foreground">~5 min</span></div>
            <p className="text-sm text-muted-foreground">Você cria uma conta lá e autoriza cada banco no app do próprio banco.</p>
          </Card>
          <Card className="grid gap-1">
            <div className="flex items-center justify-between"><span className="text-[15px] font-medium">2 · Autorize o Prumo</span><span className="text-[13px] text-muted-foreground">~1 min</span></div>
            <p className="text-sm text-muted-foreground">De volta aqui, você escolhe quais contas trazer e quem vê cada uma.</p>
          </Card>
        </ol>
        {Partner ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Avatar person={Partner} size={28} /> Cada um conecta os próprios bancos, com a própria conta MeuPluggy. {Partner.name} faz isso no celular dele.</p>
        ) : null}
        <div className="grid gap-2">
          <Link href="/connect?step=3" className={primaryLink}>Ir para o MeuPluggy</Link>
          <Link href="/connect?step=5" className={ghostLink}>Já tenho conta no MeuPluggy</Link>
        </div>
      </div>
    );
  }

  if (step === "3") {
    return (
      <div className="grid gap-6">
        <PageHeader title="" back="/connect?step=2" />
        <Stage label="Etapa 1 de 2" />
        <h1 className="text-[28px] font-medium leading-tight tracking-[-0.02em]">Você vai sair do Prumo por alguns minutos</h1>
        <p className="text-[15px] text-muted-foreground">O MeuPluggy abre no navegador, em meu.pluggy.ai.</p>
        <ol className="grid gap-3 text-[15px]">
          <li className="flex gap-3"><span className="tabular font-medium text-primary">1</span>Crie sua conta no MeuPluggy com seu CPF.</li>
          <li className="flex gap-3"><span className="tabular font-medium text-primary">2</span>Conecte cada banco. O app do banco abre para você confirmar.</li>
        </ol>
        <p className="text-sm text-muted-foreground">Volte aqui quando terminar. O Prumo guarda onde você parou.</p>
        <div className="grid gap-2">
          <OpenMeuPluggy />
          <Link href="/connect?step=2" className={ghostLink}>Voltar</Link>
        </div>
      </div>
    );
  }

  if (step === "4") {
    return (
      <div className="grid gap-6">
        <PageHeader title="" back="/connect?step=3" />
        <Stage label="Etapa 1 de 2" />
        <h1 className="text-[28px] font-medium leading-tight tracking-[-0.02em]">Terminou de conectar seus bancos?</h1>
        <p className="text-[15px] text-muted-foreground">Se ainda estiver no MeuPluggy, pode voltar lá. A gente espera.</p>
        <div className="grid gap-2">
          <Link href="/connect?step=5" className={primaryLink}>Continuar</Link>
          <OpenMeuPluggy label="Abrir o MeuPluggy de novo" next="/connect?step=4" variant="outline" />
        </div>
      </div>
    );
  }

  if (step === "5") {
    const validUntil = addDays(todayIn(), 365);
    return (
      <div className="grid gap-6">
        <PageHeader title="" back="/connect?step=4" />
        <Stage label="Etapa 2 de 2" />
        <h1 className="text-[28px] font-medium leading-tight tracking-[-0.02em]">Autorizar o Prumo a ler seus dados</h1>
        <p className="text-[15px] text-muted-foreground">Pelo conector MeuPluggy, com a conta que você acabou de usar.</p>
        <Card className="grid gap-3">
          <p className="label-mono">O Prumo vai ler</p>
          <ul className="grid gap-3">
            <Point title="Contas" body="Saldos e extratos de conta corrente e poupança" />
            <Point title="Cartões de crédito" body="Limite, faturas, compras e parcelas" />
            <Point title="Transações" body="Histórico dos últimos 12 meses e os novos lançamentos" />
          </ul>
        </Card>
        <Card className="grid gap-2">
          <p className="label-mono">O Prumo não pode</p>
          <ul className="grid gap-1.5 text-[15px]">
            <li>Fazer pagamentos, Pix ou transferências</li>
            <li>Mudar limites, dados ou senhas</li>
          </ul>
        </Card>
        <p className="text-sm text-muted-foreground">
          Válido por 12 meses, até {formatDayShort(validUntil)}/{validUntil.slice(0, 4)}. Avisamos 15 dias antes. Você pode revogar antes disso em Ajustes › Conexões.
        </p>
        <div className="grid gap-2">
          <AuthorizeButton />
          <Link href="/settings" className={ghostLink}>Cancelar</Link>
        </div>
      </div>
    );
  }

  const { accounts } = await itemAccounts(user.id, item);

  if (step === "sem-banco") {
    return (
      <div className="grid gap-6">
        <PageHeader title="" back="/connect?step=5" />
        <Stage label="Etapa 2 de 2" />
        <h1 className="text-[28px] font-medium leading-tight tracking-[-0.02em]">Ainda não há bancos na sua conta MeuPluggy</h1>
        <p className="text-[15px] text-muted-foreground">Nada foi perdido. Normalmente é uma destas coisas:</p>
        <ul className="grid gap-2 text-[15px]">
          <li>A conexão ainda está sendo processada. Leva até 2 minutos depois que o banco confirma.</li>
          <li>A autorização no app do banco não foi concluída.</li>
          <li>Você entrou no MeuPluggy com outro e-mail.</li>
        </ul>
        <div className="grid gap-2">
          <Link href={`/connect?step=6&item=${item ?? ""}`} className={primaryLink}>Verificar de novo</Link>
          <OpenMeuPluggy label="Voltar ao MeuPluggy" next={`/connect?step=sem-banco&item=${item ?? ""}`} variant="outline" />
          <Link href="/settings" className={ghostLink}>Conectar depois</Link>
        </div>
      </div>
    );
  }

  if (step === "6") {
    if (accounts.length === 0) {
      return (
        <div className="grid gap-4">
          <PageHeader title="Conectar bancos" back="/connect?step=5" />
          <p className="text-[15px] text-muted-foreground">Nenhuma conta encontrada nesta conexão ainda.</p>
          <Link href={`/connect?step=sem-banco&item=${item ?? ""}`} className={primaryLink}>Entender por quê</Link>
        </div>
      );
    }
    const chosen = accounts.filter((a) => a.import_enabled);
    return (
      <div className="grid gap-5">
        <PageHeader title="" back="/connect?step=5" />
        <Stage label="Etapa 2 de 2" />
        <h1 className="text-[28px] font-medium leading-tight tracking-[-0.02em]">Encontramos {accounts.length === 1 ? "1 conta" : `${accounts.length} contas e cartões`}</h1>
        <p className="text-[15px] text-muted-foreground">Tudo começa como <strong>Só eu vejo</strong>.{household?.partner ? ` Escolha o que compartilhar com ${partnerName} — dá para mudar depois.` : " Quando seu par entrar, você escolhe o que compartilhar."}</p>
        <ul className="grid gap-3">
          {accounts.map((a) => (
            <li key={a.id} className={cn("grid gap-3 rounded-2xl border border-border bg-card p-4", !a.import_enabled && "opacity-60")}>
              <div className="flex items-center gap-3">
                <InstitutionMark name={a.institution ?? a.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{a.institution ? `${a.institution} · ` : ""}{a.type === "CREDIT" ? "Cartão de crédito" : a.name}</span>
                  <span className="block text-[13px] text-muted-foreground">
                    {a.card_last4 ? `•• ${a.card_last4}` : ""}
                    {a.card_last4 && a.balance_cents !== null ? " · " : ""}
                    {a.balance_cents !== null ? <Money cents={Math.abs(a.balance_cents)} /> : ""}
                    {!a.import_enabled ? " · não importar" : ""}
                  </span>
                </span>
                <form action={setImportAction}>
                  <input type="hidden" name="accountId" value={a.id} />
                  <input type="hidden" name="returnTo" value={`/connect?step=6&item=${item}`} />
                  <button type="submit" name="import" value={a.import_enabled ? "0" : "1"} aria-label={a.import_enabled ? `Não importar ${a.name}` : `Importar ${a.name}`} className={cn("flex h-6 w-10 items-center rounded-full p-0.5", a.import_enabled ? "justify-end bg-primary" : "justify-start bg-[#cdd0ca]")}>
                    <span className="size-5 rounded-full bg-white" />
                  </button>
                </form>
              </div>
              {a.import_enabled && household?.partner ? <VisibilitySegment accountId={a.id} value={a.visibility} returnTo={`/connect?step=6&item=${item}`} accountName={a.name} /> : null}
            </li>
          ))}
        </ul>
        <Link href={chosen.length ? `/connect?step=7&item=${item}` : "/settings"} className={primaryLink}>
          {chosen.length ? `Trazer ${chosen.length === 1 ? "1 conta" : `${chosen.length} contas`}` : "Não trazer nada agora"}
        </Link>
        {household?.partner ? <p className="text-center text-[13px] text-muted-foreground">{partnerName.charAt(0).toUpperCase() + partnerName.slice(1)} não recebe aviso das suas escolhas.</p> : null}
      </div>
    );
  }

  if (step === "7" && item) {
    return (
      <div className="grid gap-5">
        <Stage label="Importando" />
        <h1 className="text-[28px] font-medium leading-tight tracking-[-0.02em]">Trazendo seu histórico dos últimos 12 meses</h1>
        <p className="text-[15px] text-muted-foreground">Pode levar alguns minutos. Se quiser, siga usando o app: avisamos quando terminar.</p>
        <InitialSync itemId={item} accounts={accounts.filter((a) => a.import_enabled).map((a) => ({ id: a.id, name: a.institution ? `${a.institution} · ${a.type === "CREDIT" ? `Cartão${a.card_last4 ? ` •• ${a.card_last4}` : ""}` : a.name}` : a.name }))} />
        <Link href="/overview" className={ghostLink}>Continuar usando o app</Link>
      </div>
    );
  }

  if (step === "parcial") {
    return (
      <div className="grid gap-5">
        <Stage label="Etapa 2 de 2 · conexão parcial" />
        <h1 className="text-[28px] font-medium leading-tight tracking-[-0.02em]">Conectamos, mas faltou uma parte</h1>
        <p className="text-[15px] text-muted-foreground">O banco decide o que compartilha pelo Open Finance. Desta vez, nem todos os produtos vieram.</p>
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {accounts.map((a) => (
            <li key={a.id} className="flex min-h-14 items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1 text-[15px] font-medium">{a.name}</span>
              <span className="text-[13px] text-muted-foreground">{a.import_enabled ? "veio" : "não importar"}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">Você pode tentar de novo no MeuPluggy (às vezes o banco libera depois) ou cadastrar o que faltou à mão enquanto isso.</p>
        <div className="grid gap-2">
          <Link href={`/connect?step=8&item=${item}&n=${n ?? 0}`} className={primaryLink}>Continuar com o que veio</Link>
          <OpenMeuPluggy label="Tentar de novo no MeuPluggy" next={`/connect?step=4`} variant="outline" />
          <Link href="/settings" className={ghostLink}>Cadastrar à mão</Link>
        </div>
      </div>
    );
  }

  // Step 8: done.
  const brought = accounts.filter((a) => a.import_enabled);
  return (
    <div className="grid gap-5">
      <h1 className="pt-6 text-[28px] font-medium leading-tight tracking-[-0.02em]">Seus bancos estão no Prumo</h1>
      <p className="text-[15px] text-muted-foreground">Os dados se atualizam sozinhos uma vez por dia, pelo MeuPluggy.{n ? ` Trouxemos ${Number(n).toLocaleString("pt-BR")} lançamentos.` : ""}</p>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {brought.map((a) => (
          <li key={a.id} className="flex min-h-16 items-center gap-3 px-4 py-3">
            <InstitutionMark name={a.institution ?? a.name} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium">{a.institution ? `${a.institution} · ` : ""}{a.type === "CREDIT" ? `Cartão${a.card_last4 ? ` •• ${a.card_last4}` : ""}` : a.name}</span>
              {household?.partner ? <span className="mt-1 block"><VisibilityBadge kind={a.visibility} /></span> : null}
            </span>
            {a.balance_cents !== null ? <span className="tabular text-[15px] font-medium"><Money cents={Math.abs(a.balance_cents)} /></span> : null}
          </li>
        ))}
      </ul>
      <section className="grid gap-2">
        <p className="label-mono">Próximo passo</p>
        {!household?.partner ? (
          <Link href="/couple" className="flex min-h-14 flex-col justify-center rounded-2xl border border-border bg-card px-4 py-3 text-foreground no-underline hover:text-foreground">
            <span className="text-[15px] font-medium">Convidar seu par</span>
            <span className="text-[13px] text-muted-foreground">Ele conecta os bancos dele, do celular dele</span>
          </Link>
        ) : null}
        {brought.some((a) => a.type === "CREDIT") ? (
          <Link href="/cards" className="flex min-h-14 flex-col justify-center rounded-2xl border border-border bg-card px-4 py-3 text-foreground no-underline hover:text-foreground">
            <span className="text-[15px] font-medium">Revisar a fatura do cartão</span>
            <span className="text-[13px] text-muted-foreground">Marcar o que é Nosso, seu e {household?.partner ? `do ${partnerName}` : "do seu par"}</span>
          </Link>
        ) : null}
      </section>
      <Link href="/overview" className={outlineLink}>Ir para o início</Link>
    </div>
  );
}
