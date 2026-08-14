import { redirect } from "next/navigation";

import { getCurrentUserId } from "../../../lib/auth/current-user";
import { createClient } from "../../../lib/supabase/server";
import { loadWorkspacePilotReport } from "../../../lib/stats/pilot-report";
import { PilotStatsDashboard } from "./pilot-stats-dashboard";

export const dynamic = "force-dynamic";

export default async function PilotStatsPage() {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/auth/login");

  const client = await createClient();
  const { report } = await loadWorkspacePilotReport(client, userId);

  return (
    <main className="mcp-settings-shell pilot-stats-shell">
      <header>
        <div className="eyebrow">Opt-in · measured, never invented</div>
        <h1>Pilot stats</h1>
        <p>
          Receipt-chain movement, deterministic context-token estimates, scan
          duration, and MCP pack requests. Every delta requires enough observed
          evidence.
        </p>
      </header>
      <PilotStatsDashboard report={report} />
    </main>
  );
}
