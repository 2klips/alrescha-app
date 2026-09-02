import { redirect } from "next/navigation";

import { getCurrentUserId } from "../../../../lib/auth/current-user";
import { loadWorkspaceInspectionDashboard } from "../../../../lib/inspection/inspection-report";
import { INSPECTION } from "../../../../lib/strings";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { createClient } from "../../../../lib/supabase/server";
import { Button } from "../../../ui/button";
import { InspectionView } from "../../../ui/inspection-view";
import { requestFindingJudgment } from "./actions";

export const dynamic = "force-dynamic";

interface OpenFindingRow {
  readonly id: string;
  readonly kind: string;
  readonly severity: string;
  readonly title: string;
}

interface JudgeJobRow {
  readonly payload: { readonly targetId?: string } | null;
  readonly status: string;
}

/** The latest judgment job per finding — the queue keeps every generation. */
function latestJudgmentByFinding(
  rows: readonly JudgeJobRow[],
): ReadonlyMap<string, string> {
  const latest = new Map<string, string>();
  for (const row of rows) {
    const target = row.payload?.targetId;
    if (target && !latest.has(target)) latest.set(target, row.status);
  }
  return latest;
}

/**
 * The workspace's own project check (Phase 2C todo 5).
 *
 * Every widget already knows how to say "증거 부족"; on this route that state is
 * the honest reading of an empty workspace rather than a demo state to switch
 * into, so there is no `?state=` switcher here. The judgment panel below is
 * live-only: it lists open findings with the state of their latest judgment
 * job and hands each to `enqueue_judgment_job`, whose SQL owns the kind
 * mapping, the billing rule, and the retry generation after a terminal
 * failure. Jobs carry no member grant, so their state is read with the admin
 * client after the owner check — the query stays scoped to that workspace.
 */
export default async function WorkspaceInspectionPage({
  searchParams,
}: {
  searchParams?: Promise<{ judgment?: string }>;
}) {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/auth/login");
  const { judgment } = (await searchParams) ?? {};

  const client = await createClient();
  const { dashboard, workspaceId } = await loadWorkspaceInspectionDashboard(
    client,
    userId,
  );

  const openFindings = await client
    .from("findings")
    .select("id,kind,severity,title")
    .eq("workspace_id", workspaceId)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(8);
  if (openFindings.error) throw new Error(openFindings.error.message);
  const findings = (openFindings.data ?? []) as OpenFindingRow[];

  const judgeJobs = await createAdminClient()
    .from("jobs")
    .select("status,payload")
    .eq("workspace_id", workspaceId)
    .eq("kind", "judge")
    .order("created_at", { ascending: false });
  if (judgeJobs.error) throw new Error(judgeJobs.error.message);
  const latest = latestJudgmentByFinding(
    (judgeJobs.data ?? []) as JudgeJobRow[],
  );

  return (
    <>
      <InspectionView dashboard={dashboard} />
      <section
        className="inspection-main"
        aria-label={INSPECTION.judgment.title}
        data-testid="inspection-judgment-request"
      >
        <section className="inspection-widget">
          <header>
            <h2>{INSPECTION.judgment.title}</h2>
          </header>
          <p>{INSPECTION.judgment.note}</p>
          {judgment === "queued" ? (
            <p role="status">{INSPECTION.judgment.queued}</p>
          ) : null}
          {findings.length === 0 ? (
            <p>{INSPECTION.judgment.empty}</p>
          ) : (
            <ul className="inspection-list">
              {findings.map((finding) => {
                const state = latest.get(finding.id);
                return (
                  <li key={finding.id} className="inspection-finding">
                    <span>
                      {finding.kind} · {finding.severity}
                    </span>{" "}
                    <span>{finding.title}</span>{" "}
                    {state === "queued" || state === "running" ? (
                      <span>{INSPECTION.judgment.pending}</span>
                    ) : state === "succeeded" ? (
                      <span>{INSPECTION.judgment.done}</span>
                    ) : (
                      <form action={requestFindingJudgment}>
                        <input
                          type="hidden"
                          name="findingId"
                          value={finding.id}
                        />
                        <Button type="submit">
                          {state === "failed" || state === "cancelled"
                            ? INSPECTION.judgment.retry
                            : INSPECTION.judgment.action}
                        </Button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <small className="inspection-source">
            {INSPECTION.sourcePrefix}
            {INSPECTION.judgment.source}
          </small>
        </section>
      </section>
    </>
  );
}
