import { redirect } from "next/navigation";

import { getCurrentUserId } from "../../../lib/auth/current-user";
import { loadWorkspaceCommitCards } from "../../../lib/commits/commit-cards-report";
import { createClient } from "../../../lib/supabase/server";
import { CommitAnalysisBoard } from "../../commits/commit-cards";

export const dynamic = "force-dynamic";

/**
 * The workspace's own commit cards (Phase 2C todo 5).
 *
 * `/commits` is the demo board and stays one. This route reads `runs`, `jobs`
 * and `receipts` through RLS, so a workspace with no runs gets an empty board
 * — the demo fixture is never a fallback for missing evidence.
 */
export default async function WorkspaceCommitsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/auth/login");

  const client = await createClient();
  const { cards } = await loadWorkspaceCommitCards(client, userId);

  const requested = (await searchParams).run;
  const requestedRunId = typeof requested === "string" ? requested : null;
  const selectedRunId =
    cards.find((card) => card.runId === requestedRunId)?.runId ??
    cards[0]?.runId ??
    null;

  return (
    <div className="app-surface">
      <CommitAnalysisBoard
        basePath="/app/commits"
        cards={cards}
        selectedRunId={selectedRunId}
        stateQuery={null}
      />
    </div>
  );
}
