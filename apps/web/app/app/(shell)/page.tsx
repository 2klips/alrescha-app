import { redirect } from "next/navigation";

import { getCurrentUserId } from "../../../lib/auth/current-user";
import { loadWorkspaceJourney } from "../../../lib/home/journey";
import { createClient } from "../../../lib/supabase/server";
import { WorkspaceHomeScreen, type HomeNotices } from "./home-screen";

export const dynamic = "force-dynamic";

/**
 * `/app` — the real-workspace home (Phase 3 Wave E todo 13). Renders the
 * onboarding journey from stored rows only; the fixture dashboard stays on
 * the public demo routes.
 *
 * The connect routes and the rescan action land here with the outcome of
 * what they queued in the query string (Phase 4 Wave C todo 16); the
 * progress itself is read from rows, never from the URL.
 */
export default async function WorkspacePage({
  searchParams,
}: {
  searchParams?: Promise<{
    backfill?: string;
    github?: string;
    mode?: string;
    rescan?: string;
  }>;
}) {
  const userId = await getCurrentUserId();

  if (!userId) {
    redirect("/auth/login");
  }

  const supabase = await createClient();
  const model = await loadWorkspaceJourney(supabase, userId);
  const { backfill, mode, rescan } = (await searchParams) ?? {};
  const notices: HomeNotices = {
    backfill: backfill === "unscheduled" ? "unscheduled" : null,
    rescan:
      rescan === "scheduled" ||
      rescan === "first-scan" ||
      rescan === "never-scanned" ||
      rescan === "local" ||
      rescan === "rate-limited" ||
      rescan === "error"
        ? rescan
        : null,
    rescanMode: mode === "full" ? "full" : null,
  };

  return <WorkspaceHomeScreen model={model} notices={notices} />;
}
