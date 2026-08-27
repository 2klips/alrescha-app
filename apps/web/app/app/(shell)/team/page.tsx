import { redirect } from "next/navigation";

import { getCurrentUserId } from "../../../../lib/auth/current-user";
import { loadWorkspaceTeamReport } from "../../../../lib/team/team-report";
import { createClient } from "../../../../lib/supabase/server";
import { TeamView } from "../../../ui/team-view";

export const dynamic = "force-dynamic";

/**
 * The workspace's own team surface (Phase 2C todo 5).
 *
 * The loader is where ADR-011 holds: its row types have no field for another
 * member's consent state and none for prompt text, so nothing this page renders
 * can leak either. Coaching is `null` until a coaching job has graded a prompt
 * in this workspace — the demo's sample rubric is not shown here.
 */
export default async function WorkspaceTeamPage() {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/auth/login");

  const client = await createClient();
  const { report } = await loadWorkspaceTeamReport(client, userId);

  return <TeamView team={{ ...report, coaching: null }} />;
}
