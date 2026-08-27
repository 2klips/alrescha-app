import { redirect } from "next/navigation";

import { getCurrentUserId } from "../../../../lib/auth/current-user";
import { loadWorkspaceInspectionDashboard } from "../../../../lib/inspection/inspection-report";
import { createClient } from "../../../../lib/supabase/server";
import { InspectionView } from "../../../ui/inspection-view";

export const dynamic = "force-dynamic";

/**
 * The workspace's own project check (Phase 2C todo 5).
 *
 * Every widget already knows how to say "증거 부족"; on this route that state is
 * the honest reading of an empty workspace rather than a demo state to switch
 * into, so there is no `?state=` switcher here.
 */
export default async function WorkspaceInspectionPage() {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/auth/login");

  const client = await createClient();
  const { dashboard } = await loadWorkspaceInspectionDashboard(client, userId);

  return <InspectionView dashboard={dashboard} />;
}
