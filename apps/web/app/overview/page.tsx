import { buildOverviewViewModel } from "../../lib/overview/view-model";
import { OverviewScreen } from "./overview-screen";

export default function OverviewPage() {
  return <OverviewScreen model={buildOverviewViewModel()} />;
}
