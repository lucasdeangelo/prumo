import { formatBRL } from "@domain/money";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { supabase } from "@/lib/supabase";
import { ChevronRightIcon, SignOutIcon } from "@/ui/icons";
import { CoupleAvatars } from "@/ui/finance";
import { Flex, Label, ListGroup, PageHeader, Press, Txt } from "@/ui/kit";
import { Screen } from "@/ui/screen";
import { colors, radius, type Person } from "@/ui/theme";

type Data = {
  email: string | null;
  couple: { people: Person[]; since: string; partnerName: string; budgetAlerts: boolean; approvalThresholdCents: number | null; splitLabel: string; equalIn: string[] } | null;
  sharedCount: number;
  onlyMineCount: number;
  rulesCount: number;
  banksCount: number;
  failing: string[];
  manual: { name: string; balance_cents: number | null }[];
  whatsapp: { phone: string | null } | null;
  budgetTotalCents: number;
  freeMineCents: number | null;
  freeProposal: boolean;
};

function SettingsRow({ href, title, detail, alert }: { href: string; title: string; detail?: string; alert?: boolean }) {
  return (
    <Press href={href} style={{ minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 }} pressedStyle={{ backgroundColor: colors.rowPress }}>
      <Flex>
        <Txt size={15} weight="medium">{title}</Txt>
        {detail ? <Txt size={13} weight={alert ? "medium" : "regular"} color={alert ? colors.danger : colors.mutedForeground}>{detail}</Txt> : null}
      </Flex>
      <ChevronRightIcon size={16} color={colors.mutedForeground} />
    </Press>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Label style={{ paddingHorizontal: 4 }}>{label}</Label>
      <ListGroup>{children}</ListGroup>
    </View>
  );
}

export default function Settings() {
  return <Screen<Data> path="settings">{(d) => <SettingsView d={d} />}</Screen>;
}

function SettingsView({ d }: { d: Data }) {
  const [leaving, setLeaving] = useState(false);
  const c = d.couple;
  return (
    <>
      <PageHeader title="Ajustes" subtitle={d.email ?? undefined} />

      {c ? (
        <Press href="/couple" style={{ flexDirection: "row", alignItems: "center", gap: 16, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 16 }}>
          <CoupleAvatars people={c.people} size={40} />
          <Flex>
            <Txt size={15} weight="medium">{c.people.map((p) => p.name).join(" e ")}</Txt>
            <Txt size={13} color={colors.mutedForeground}>Perfil do casal · juntos no Prumo desde {c.since}</Txt>
          </Flex>
          <ChevronRightIcon size={16} color={colors.mutedForeground} />
        </Press>
      ) : (
        <Press href="/couple" style={{ minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: radius.lg, borderWidth: 1, borderStyle: "dashed", borderColor: colors.dashed, backgroundColor: "rgba(255,255,255,0.6)", paddingHorizontal: 16, paddingVertical: 12 }}>
          <Flex>
            <Txt size={15} weight="medium">Convidar seu par</Txt>
            <Txt size={13} color={colors.mutedForeground}>Ou entrar com o código que você recebeu</Txt>
          </Flex>
          <ChevronRightIcon size={16} color={colors.mutedForeground} />
        </Press>
      )}

      {c ? (
        <Group label="Privacidade · só você">
          <SettingsRow href="/privacy/visibility" title={`O que ${c.partnerName} vê`} detail={`${d.sharedCount} ${d.sharedCount === 1 ? "conta compartilhada" : "contas compartilhadas"} · ${d.onlyMineCount} só sua${d.onlyMineCount === 1 ? "" : "s"}`} />
          <SettingsRow href="/privacy/rules" title="Regras de privacidade" detail={d.rulesCount ? `${d.rulesCount} ${d.rulesCount === 1 ? "ativa" : "ativas"}` : "Nenhuma"} />
        </Group>
      ) : null}

      {c ? (
        <Group label="Combinados do casal">
          <SettingsRow href="/couple/budget" title="Orçamento do lar" detail={d.budgetTotalCents ? `${formatBRL(d.budgetTotalCents)} por mês${c.budgetAlerts ? " · avisos em 80% e 100%" : ""}` : "Ainda não combinado"} />
          <SettingsRow href="/couple/free-money" title="Dinheiro livre" detail={`${d.freeMineCents !== null ? `${formatBRL(d.freeMineCents)} cada` : "Ainda não combinado"}${d.freeProposal ? " · proposta aguardando" : ""}`} />
          <SettingsRow href="/couple/approvals" title="Compras grandes" detail={c.approvalThresholdCents ? `Conversar antes acima de ${formatBRL(c.approvalThresholdCents)}` : "Sem limite combinado"} />
          <SettingsRow href="/couple" title="Divisão das contas" detail={`${c.splitLabel}${c.equalIn.length ? ` · 50/50 em ${c.equalIn.join(", ")}` : ""}`} />
          <SettingsRow href="/couple/goals" title="Metas" />
        </Group>
      ) : null}

      <Group label="Bancos e registro">
        <SettingsRow
          href="/settings/connections"
          title="Conexões (Open Finance)"
          detail={d.banksCount ? `${d.banksCount} ${d.banksCount === 1 ? "banco" : "bancos"}${d.failing.length ? ` · ${d.failing.join(", ")} ${d.failing.length === 1 ? "precisa de atenção" : "precisam de atenção"}` : ""}` : "Nenhum banco conectado"}
          alert={d.failing.length > 0}
        />
        <SettingsRow href="/settings/accounts" title="Contas manuais" detail={d.manual.length ? d.manual.slice(0, 2).map((a) => `${a.name}${a.balance_cents !== null ? ` · ${formatBRL(a.balance_cents)}` : ""}`).join(" · ") : "Carteira, dinheiro guardado…"} />
        <SettingsRow href="/settings/whatsapp" title="WhatsApp" detail={d.whatsapp ? `Vinculado${d.whatsapp.phone ? ` · ${d.whatsapp.phone}` : ""}` : "Registrar gastos e receber avisos"} />
        <SettingsRow href="/settings/tags" title="Tags e regras de categoria" detail={c ? "Valem para os dois" : undefined} />
      </Group>

      <Pressable
        accessibilityRole="button"
        disabled={leaving}
        onPress={async () => { setLeaving(true); await supabase.auth.signOut(); }}
        style={({ pressed }) => ({ minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: radius.full, backgroundColor: pressed ? colors.muted : "transparent" })}
      >
        <SignOutIcon size={16} color={colors.mutedForeground} />
        <Txt size={15} weight="medium" color={colors.mutedForeground}>{leaving ? "Saindo…" : "Sair"}</Txt>
      </Pressable>
    </>
  );
}
