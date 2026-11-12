import { formatBRL } from "@domain/money";
import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";

import { useAction } from "@/lib/query";
import { Button, Card, EmptyState, Label, Notice, PageHeader, Pill, TextLink, Txt } from "@/ui/kit";
import { Screen } from "@/ui/screen";
import { ShareImageButton } from "@/ui/share-image";
import { colors } from "@/ui/theme";

import type { RetroData } from "./index";

const COUNT = ["", "Uma coisa", "Duas coisas", "Três coisas"];

export default function Talk() {
  const { month } = useLocalSearchParams<{ month: string }>();
  // Same data as the retrospective: opening this screen from there is instant.
  return <Screen<RetroData> path={`couple/retro/${month}`} gap={16}>{(d) => <TalkView d={d} />}</Screen>;
}

function TalkView({ d }: { d: RetroData }) {
  const mark = useAction("markRetroPoint");
  const finish = useAction("finishRetro");
  const marked = new Set(d.marked);
  const shareLines = [
    `Juntos em ${d.name}: ${formatBRL(d.totalCents)}`,
    ...(d.goalsSavedCents ? [`Nas metas: + ${formatBRL(d.goalsSavedCents)}`] : []),
    ...d.goalLines.slice(0, 2).map((g) => `${g.name}: ${g.percent}%`),
  ];
  return (
    <>
      <PageHeader back={`/couple/retro/${d.month}`} />
      <Label>Retrospectiva · {d.name}</Label>
      <Txt size={24} weight="medium" tracking={-0.48} lh={30}>Pontos para conversar</Txt>
      <Txt size={14} color={colors.mutedForeground}>Sem pressa e sem placar. {d.points.length ? `${COUNT[Math.min(3, d.points.length)]} que apareceram no mês.` : ""}</Txt>

      {d.points.length === 0 ? <EmptyState title="Nada pedindo conversa">O mês ficou dentro do combinado.</EmptyState> : null}
      <View style={{ gap: 12 }}>
        {d.points.map((point) => (
          <Card key={point.key} style={{ gap: 8 }}>
            <Txt size={15} weight="medium">{point.title}</Txt>
            <Txt size={14} color={colors.mutedForeground}>{point.body}</Txt>
            {marked.has(point.key) ? <Pill bg={colors.secondary} color={colors.secondaryForeground}>Conversamos</Pill> : <TextLink onPress={() => mark.run({ month: d.month, key: point.key })}>{mark.pending ? "…" : "Marcar como conversado"}</TextLink>}
          </Card>
        ))}
      </View>

      {d.done ? <Notice>Retrospectiva concluída.</Notice> : <Button pending={finish.pending} onPress={() => finish.run({ month: d.month })}>Concluir retrospectiva</Button>}
      <ShareImageButton title={`${d.name.charAt(0).toUpperCase() + d.name.slice(1)} a dois`} lines={shareLines} />
      <Txt size={13} color={colors.mutedForeground} center>A imagem mostra só totais do casal e metas, sem valores de cada um.</Txt>
    </>
  );
}
