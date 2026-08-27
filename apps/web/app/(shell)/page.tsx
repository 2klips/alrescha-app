import { buildOverviewViewModel } from "../../lib/overview/view-model";
import { OverviewScreen } from "../ui/overview-screen";

/**
 * Phase 2D todo 6 — the four-zone overview is the default entry. The
 * full-bleed graph dashboard lives one click away at /map.
 */
export default function HomePage() {
  return <OverviewScreen model={buildOverviewViewModel()} />;
}
