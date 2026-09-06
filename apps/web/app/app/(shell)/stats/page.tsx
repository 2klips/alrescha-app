import { redirect } from "next/navigation";

import { STATS } from "../../../../lib/strings";
import { getCurrentUserId } from "../../../../lib/auth/current-user";
import { createClient } from "../../../../lib/supabase/server";
import { loadWorkspacePilotReport } from "../../../../lib/stats/pilot-report";
import { PilotStatsDashboard } from "./pilot-stats-dashboard";
import { ProductPageHeader } from "../../../ui/page-layout";

export const dynamic = "force-dynamic";

export default async function PilotStatsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ repository?: string }>;
}) {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/auth/login");

  const { repository } = await searchParams;
  const client = await createClient();
  // A repository id from the query string is a request, not a claim: every
  // query it narrows is already scoped to the caller's workspace, and an id
  // from another one simply matches nothing.
  const { report } = await loadWorkspacePilotReport(
    client,
    userId,
    repository && /^[0-9A-HJKMNP-TV-Z]{26}$/.test(repository)
      ? repository
      : null,
  );

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
