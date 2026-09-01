import { redirect } from "next/navigation";

import { STATS } from "../../../../lib/strings";
import { getCurrentUserId } from "../../../../lib/auth/current-user";
import { createClient } from "../../../../lib/supabase/server";
import { loadWorkspacePilotReport } from "../../../../lib/stats/pilot-report";
import { PilotStatsDashboard } from "./pilot-stats-dashboard";
import { ProductPageHeader } from "../../../ui/page-layout";

export const dynamic = "force-dynamic";

export default async function PilotStatsPage() {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/auth/login");

  const client = await createClient();
  const { report } = await loadWorkspacePilotReport(client, userId);

  return (
    <main className="mcp-settings-shell pilot-stats-shell product-page">
      <ProductPageHeader
        description={STATS.page.body}
        kicker={STATS.page.eyebrow}
        title={STATS.page.title}
      />
      <PilotStatsDashboard report={report} />
    </main>
  );
}
