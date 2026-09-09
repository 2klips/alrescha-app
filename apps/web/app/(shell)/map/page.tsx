import {
  buildDashboardViewModel,
  parseDashboardState,
  parseDemoNodeCount,
} from "../../../lib/dashboard/graph-model";
import { DashboardScreen } from "../../ui/dashboard-screen";

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<{
    nodes?: string | string[];
    state?: string | string[];
  }>;
}) {
  const { nodes, state } = await searchParams;
  return (
    <DashboardScreen
      model={buildDashboardViewModel(
        parseDashboardState(state),
        undefined,
        // `?nodes=` is how `scripts/bench-graph-browser.ts` gets a
        // five-thousand-node graph in front of a real GPU. Clamped, and only
        // here: `/app/map` reads a workspace and never this.
        parseDemoNodeCount(nodes),
      )}
    />
  );
}
