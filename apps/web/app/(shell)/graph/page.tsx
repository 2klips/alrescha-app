import { parseDashboardState } from "../../../lib/dashboard/graph-model";
import { GraphDetail } from "../../ui/graph-detail";

export default async function GraphPage({
  searchParams,
}: {
  searchParams: Promise<{ node?: string; state?: string | string[] }>;
}) {
  const { node, state } = await searchParams;
  return (
    <GraphDetail
      initialNodeId={node ?? null}
      // `?state=` is the demo shell's fixture switch, and it reaches every
      // other demo screen. This route used to pin itself to `scanned`, so the
      // one screen showing a node's evidence never saw the clustered graph.
      state={parseDashboardState(state)}
    />
  );
}
