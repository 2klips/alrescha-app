import { redirect } from "next/navigation";

import { getCurrentUserId } from "../../../../lib/auth/current-user";
import { loadWorkspaceTeamReport } from "../../../../lib/team/team-report";
import { TEAM } from "../../../../lib/strings";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { createClient } from "../../../../lib/supabase/server";
import { Button } from "../../../ui/button";
import { TeamView } from "../../../ui/team-view";
import { requestPromptCoaching } from "./actions";

export const dynamic = "force-dynamic";

interface CoachJobRow {
  readonly payload: { readonly promptRecordId?: string } | null;
  readonly status: string;
}

/** The latest coaching job per record — the queue keeps every generation. */
function latestCoachingByRecord(
  rows: readonly CoachJobRow[],
): ReadonlyMap<string, string> {
  const latest = new Map<string, string>();
  for (const row of rows) {
    const record = row.payload?.promptRecordId;
    if (record && !latest.has(record)) latest.set(record, row.status);
  }
  return latest;
}

/**
 * The workspace's own team surface (Phase 2C todo 5).
 *
 * The loader is where ADR-011 holds: its row types have no field for another
 * member's consent state and none for prompt text, so nothing this page renders
 * can leak either. Coaching starts as `null` and fills in from the viewer's
 * own latest graded record once a coaching job has run — the demo's sample
 * rubric is never shown here. The request panel below lists only the
 * viewer's OWN records with the state of their latest coaching job; the
 * own-author and raw-consent rules are enforced again inside
 * `enqueue_coaching_job`, which also mints the retry generation after a
 * terminal failure. Coaching job rows name the record only (no prompt text),
 * so reading their state with the admin client leaks nothing.
 */
export default async function WorkspaceTeamPage({
  searchParams,
}: {
  searchParams?: Promise<{ coaching?: string }>;
}) {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/auth/login");
  const { coaching: coachingParam } = (await searchParams) ?? {};

  const client = await createClient();
  const { coaching, ownPrompts, report, workspaceId } =
    await loadWorkspaceTeamReport(client, userId);

  const coachJobs = await createAdminClient()
    .from("jobs")
    .select("status,payload")
    .eq("workspace_id", workspaceId)
    .eq("kind", "coach")
    .order("created_at", { ascending: false });
  if (coachJobs.error) throw new Error(coachJobs.error.message);
  const latest = latestCoachingByRecord(
    (coachJobs.data ?? []) as CoachJobRow[],
  );

  return (
    <>
      <TeamView team={{ ...report, coaching }} />
      <section
        className="team-main"
        aria-label={TEAM.coachingRequest.title}
        data-testid="team-coaching-request"
      >
        <div className="team-grid">
          <section className="inspection-widget">
            <header>
              <h2>{TEAM.coachingRequest.title}</h2>
            </header>
            <p>{TEAM.coachingRequest.note}</p>
            {coachingParam === "queued" ? (
              <p role="status">{TEAM.coachingRequest.queued}</p>
            ) : null}
            {ownPrompts.length === 0 ? (
              <p>{TEAM.coachingRequest.empty}</p>
            ) : (
              <ul className="inspection-list">
                {ownPrompts.map((record) => {
                  const state = latest.get(record.id);
                  return (
                    <li key={record.id} className="inspection-finding">
                      <span>{record.occurredAt}</span>{" "}
                      <span>
                        {TEAM.coachingRequest.tokens(record.tokenCount)}
                      </span>{" "}
                      {record.graded ? (
                        <span>{TEAM.coachingRequest.graded}</span>
                      ) : state === "queued" || state === "running" ? (
                        <span>{TEAM.coachingRequest.pending}</span>
                      ) : record.coachable ? (
                        <form action={requestPromptCoaching}>
                          <input
                            type="hidden"
                            name="recordId"
                            value={record.id}
                          />
                          <Button type="submit">
                            {state === "failed" || state === "cancelled"
                              ? TEAM.coachingRequest.retry
                              : TEAM.coachingRequest.action}
                          </Button>
                        </form>
                      ) : (
                        <span>{TEAM.coachingRequest.needsRaw}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </section>
    </>
  );
}
