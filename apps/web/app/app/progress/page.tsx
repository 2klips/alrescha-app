import { redirect } from "next/navigation";

import { getCurrentUserId } from "../../../lib/auth/current-user";
import { loadWorkspaceProgressReport } from "../../../lib/progress/progress-report";
import { createClient } from "../../../lib/supabase/server";
import { ProgressDashboardView } from "../../progress/progress-dashboard";

export const dynamic = "force-dynamic";

export default async function WorkspaceProgressPage() {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/auth/login");

  const client = await createClient();
  const { report } = await loadWorkspaceProgressReport(client, userId);
  return (
    <div className="app-surface workspace-progress-shell">
      <ProgressDashboardView report={report} />
    </div>
  );
}
