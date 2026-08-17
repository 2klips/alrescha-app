import {
  buildDashboardViewModel,
  parseDashboardState,
} from "../../lib/dashboard/graph-model";
import { DashboardScreen } from "../ui/dashboard-screen";

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string | string[] }>;
}) {
  const { state } = await searchParams;
  return (
    <DashboardScreen
      model={buildDashboardViewModel(parseDashboardState(state))}
    />
  );
}
