import { redirect } from "next/navigation";

import { getCurrentUserId } from "../../../lib/auth/current-user";
import { loadWorkspaceJourney } from "../../../lib/home/journey";
import { createClient } from "../../../lib/supabase/server";
import { WorkspaceHomeScreen } from "./home-screen";

export const dynamic = "force-dynamic";

/**
 * `/app` — the real-workspace home (Phase 3 Wave E todo 13). Renders the
 * onboarding journey from stored rows only; the fixture dashboard stays on
 * the public demo routes.
 */
export default async function WorkspacePage() {
  const userId = await getCurrentUserId();

  if (!userId) {
    redirect("/auth/login");
  }

  const supabase = await createClient();
  const model = await loadWorkspaceJourney(supabase, userId);

  return <WorkspaceHomeScreen model={model} />;
}
