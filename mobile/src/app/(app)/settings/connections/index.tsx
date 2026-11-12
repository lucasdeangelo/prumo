import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";

import { Avatar, InstitutionMark, UpdatedAt, VisibilityBadge, type VisibilityKind } from "@/ui/finance";
import { Button, Card, EmptyState, Flex, ListGroup, Notice, PageHeader, Press, Row, SectionHeader, Txt } from "@/ui/kit";
import { Screen } from "@/ui/screen";
import { colors, radius, type Person } from "@/ui/theme";

type Data = {
  email: string | null;
  partner: Person | null;
  pluggyReady: boolean;
  connections: { key: string; pluggyItemId: string; institution: string; state: "ok" | "expired" | "failed"; lastSuccessAt: string | null; failedDate: string; consentUntil: string | null; accounts: { id: string; label: string; visibility: VisibilityKind }[] }[];
  partnerShared: { id: string; label: string; visibility: VisibilityKind }[];
};

export default function Connections() {
  const { desconectado } = useLocalSearchParams<{ desconectado?: string }>();
  return (
    <Screen<Data> path="settings/connections" gap={16}>
      {(d) => (
        <>
          <PageHeader title="Conexões" subtitle={`Pelo MeuPluggy${d.email ? ` · ${d.email}` : ""} · atualização diária`} back="/settings" />
          {desconectado ? <Notice>Banco desconectado.</Notice> : null}

          {d.connections.length === 0 ? (
            <EmptyState title="Nenhum banco conectado">Traga saldos e lançamentos pelo Open Finance, sem digitar nada.</EmptyState>
          ) : (
            d.connections.map((c) => (
              <Card key={c.key} style={{ gap: 12 }}>
                <Row>
                  <InstitutionMark name={c.institution} />
                  <Flex>
                    <Txt size={15} weight="medium">{c.institution}</Txt>
                    {c.state === "ok" ? (
                      <UpdatedAt at={c.lastSuccessAt} />
                    ) : (
                      <Press href={`/settings/connections/${c.pluggyItemId}`}>
                        <Txt size={13} weight="medium" color={colors.danger}>{c.state === "expired" ? "Autorização vencida · reconectar" : `Falhou hoje · dados de ${c.failedDate}`} · Detalhes</Txt>
                      </Press>
                    )}
                  </Flex>
                </Row>
                {c.accounts.length > 0 ? (
                  <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 }}>
                    {c.accounts.map((a) => (
                      <Row key={a.id} style={{ justifyContent: "space-between" }}>
                        <Txt size={14} numberOfLines={1} style={{ flex: 1 }}>{a.label}</Txt>
                        {d.partner ? <VisibilityBadge kind={a.visibility} /> : null}
                      </Row>
                    ))}
                  </View>
                ) : null}
                {c.consentUntil ? <Txt size={13} color={colors.mutedForeground}>Autorização válida até {c.consentUntil}</Txt> : null}
                <Row gap={8}>
                  <View style={{ flex: 1 }}>
                    <Button size="sm" variant="ghost" style={{ borderWidth: 1, borderColor: colors.border }} href={d.partner ? "/privacy/visibility" : `/settings/connections/${c.pluggyItemId}`}>{d.partner ? "Alterar visibilidade" : "Detalhes"}</Button>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button size="sm" variant="ghost" color={colors.danger} href={`/settings/connections/${c.pluggyItemId}/disconnect`}>Desconectar</Button>
                  </View>
                </Row>
              </Card>
            ))
          )}

          {d.pluggyReady ? (
            <Button href="/connect">{d.connections.length ? "Conectar outro banco" : "Conectar bancos"}</Button>
          ) : (
            <View style={{ borderRadius: radius.md, backgroundColor: colors.muted, padding: 12 }}>
              <Txt size={14} color={colors.mutedForeground}>Configure PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no servidor para habilitar.</Txt>
            </View>
          )}
          {d.connections.length ? <Txt size={13} color={colors.mutedForeground} center>No MeuPluggy, todos os seus bancos ficam numa conexão só: adicione novos em meu.pluggy.ai e eles chegam na próxima atualização diária.</Txt> : null}

          {d.partner && d.partnerShared.length > 0 ? (
            <View style={{ gap: 8 }}>
              <SectionHeader title={`Compartilhado por ${d.partner.name}`} />
              <ListGroup>
                {d.partnerShared.map((a) => (
                  <Row key={a.id} style={{ minHeight: 56, paddingHorizontal: 16, paddingVertical: 12 }}>
                    <Avatar person={d.partner!} size={28} />
                    <Txt size={15} weight="medium" numberOfLines={1} style={{ flex: 1 }}>{a.label}</Txt>
                    <VisibilityBadge kind={a.visibility} />
                  </Row>
                ))}
              </ListGroup>
              <Txt size={13} color={colors.mutedForeground} style={{ paddingHorizontal: 4 }}>{d.partner.name} conecta e gerencia os bancos dele. Você não pode alterar estas conexões.</Txt>
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}
