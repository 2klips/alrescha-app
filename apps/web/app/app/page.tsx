import { redirect } from "next/navigation";

import { getCurrentUserId } from "../../lib/auth/current-user";
import { buildDashboardViewModel } from "../../lib/dashboard/graph-model";
import { createClient } from "../../lib/supabase/server";
import { DashboardScreen } from "../ui/dashboard-screen";

export default async function WorkspacePage() {
  const userId = await getCurrentUserId();

  if (!userId) {
    redirect("/auth/login");
  }

  const supabase = await createClient();
  const { data: workspaces } = await supabase.from("workspaces").select("id, name").limit(1);
  const workspace = workspaces?.[0];
  const model = buildDashboardViewModel("scanned");

  return (
    <div data-user-id={userId} data-workspace-name={workspace?.name ?? "Personal workspace"}>
      <DashboardScreen model={model} />
    </div>
  );
}
