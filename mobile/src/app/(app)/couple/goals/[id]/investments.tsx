import { useLocalSearchParams } from "expo-router";

import { AssetRow, type AssetView } from "@/ui/investments";
import { EmptyState, ListGroup, PageHeader } from "@/ui/kit";
import { Screen } from "@/ui/screen";

type Data = { goal: { id: string; name: string }; assets: (AssetView & { status: string })[] };

/** From a goal: pick one of your open investments, then choose how much of it counts. */
export default function GoalInvestmentsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen<Data> path={`couple/goals/${id}/investments`}>
      {(d) => (
        <>
          <PageHeader title="Vincular investimento" subtitle={d.goal.name} back={`/couple/goals/${d.goal.id}`} />
          {d.assets.length === 0 ? (
            <EmptyState title="Nenhum investimento seu">Os investimentos chegam pelo Open Finance ou pelo cadastro à mão, em Investimentos. Depois é só vincular aqui.</EmptyState>
          ) : (
            <ListGroup>{d.assets.map((a) => <AssetRow key={a.id} a={a} extra={a.status} href={`/investments/${a.id}/link?meta=${d.goal.id}&voltar=meta`} />)}</ListGroup>
          )}
        </>
      )}
    </Screen>
  );
}
