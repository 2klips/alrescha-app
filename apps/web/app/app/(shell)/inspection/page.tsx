import { redirect } from "next/navigation";

import { getCurrentUserId } from "../../../../lib/auth/current-user";
import { loadWorkspaceInspectionDashboard } from "../../../../lib/inspection/inspection-report";
import { INSPECTION } from "../../../../lib/strings";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { createClient } from "../../../../lib/supabase/server";
import { Button } from "../../../ui/button";
import { InspectionView } from "../../../ui/inspection-view";
import { requestFindingJudgment, requestRequirementJudgment } from "./actions";

export const dynamic = "force-dynamic";

interface OpenFindingRow {
  readonly id: string;
  readonly kind: string;
  readonly severity: string;
  readonly title: string;
}

interface ActiveRequirementRow {
  readonly id: string;
  readonly repository_id: string;
  readonly source_artifact_id: string;
  readonly statement: string;
}

interface ArtifactPathRow {
  readonly id: string;
  readonly path: string;
}

interface JudgeJobRow {
  readonly payload: { readonly targetId?: string } | null;
  readonly status: string;
}

interface RequirementJudgmentRow {
  readonly payload: {
    readonly explanation?: string;
    readonly verdict?: string;
  } | null;
  readonly target_id: string;
}

type Verdict = keyof typeof INSPECTION.requirementJudgment.verdicts;

/** The latest judgment job per target — the queue keeps every generation. */
function latestJobByTarget(
  rows: readonly JudgeJobRow[],
): ReadonlyMap<string, string> {
  const latest = new Map<string, string>();
  for (const row of rows) {
    const target = row.payload?.targetId;
    if (target && !latest.has(target)) latest.set(target, row.status);
  }
  return latest;
}

function latestJudgmentByTarget(
  rows: readonly RequirementJudgmentRow[],
): ReadonlyMap<string, { explanation: string; verdict: Verdict | null }> {
  const latest = new Map<string, { explanation: string; verdict: Verdict | null }>();
  for (const row of rows) {
    if (latest.has(row.target_id)) continue;
    const verdict = row.payload?.verdict;
    latest.set(row.target_id, {
      explanation: row.payload?.explanation ?? "",
      verdict:
        verdict && verdict in INSPECTION.requirementJudgment.verdicts
          ? (verdict as Verdict)
          : null,
    });
  }
  return latest;
}

function excerpt(statement: string, limit = 120): string {
  return statement.length > limit ? `${statement.slice(0, limit)}…` : statement;
}

/**
 * The workspace's own project check (Phase 2C todo 5).
 *
 * Every widget already knows how to say "증거 부족"; on this route that state is
 * the honest reading of an empty workspace rather than a demo state to switch
 * into, so there is no `?state=` switcher here. The two judgment panels below
 * are live-only: open findings and active requirements, each with the state
 * of its latest judgment job, handed to the enqueue functions whose SQL owns
 * the kind mapping, the billing rule, and the retry generation after a
 * terminal failure. Jobs and requirements carry no member grant, so they are
 * read with the admin client after the owner check — every query stays
 * scoped to that workspace. Judgments are member-readable and come through
 * the session client.
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
  const admin = createAdminClient();

  const [openFindings, judgeJobs, requirements, judgments] = await Promise.all([
    client
      .from("findings")
      .select("id,kind,severity,title")
      .eq("workspace_id", workspaceId)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(8),
    admin
      .from("jobs")
      .select("status,payload")
      .eq("workspace_id", workspaceId)
      .eq("kind", "judge")
      .order("created_at", { ascending: false }),
    admin
      .from("requirements")
      .select("id,repository_id,source_artifact_id,statement")
      .eq("workspace_id", workspaceId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(8),
    client
      .from("judgments")
      .select("target_id,payload")
      .eq("workspace_id", workspaceId)
      .eq("kind", "requirement-disambiguation")
      .order("created_at", { ascending: false }),
  ]);
  for (const result of [openFindings, judgeJobs, requirements, judgments]) {
    if (result.error) throw new Error(result.error.message);
  }
  const findings = (openFindings.data ?? []) as OpenFindingRow[];
  const latest = latestJobByTarget((judgeJobs.data ?? []) as JudgeJobRow[]);
  const activeRequirements = (requirements.data ?? []) as ActiveRequirementRow[];
  const verdicts = latestJudgmentByTarget(
    (judgments.data ?? []) as RequirementJudgmentRow[],
  );

  const artifactIds = [
    ...new Set(activeRequirements.map((row) => row.source_artifact_id)),
  ];
  const artifactPaths = new Map<string, string>();
  if (artifactIds.length > 0) {
    const artifacts = await admin
      .from("artifacts")
      .select("id,path")
      .eq("workspace_id", workspaceId)
      .in("id", artifactIds);
    if (artifacts.error) throw new Error(artifacts.error.message);
    for (const row of (artifacts.data ?? []) as ArtifactPathRow[]) {
      artifactPaths.set(row.id, row.path);
    }
  }

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

        <section
          className="inspection-widget"
          data-testid="inspection-requirement-judgment"
        >
          <header>
            <h2>{INSPECTION.requirementJudgment.title}</h2>
          </header>
          <p>{INSPECTION.requirementJudgment.note}</p>
          {activeRequirements.length === 0 ? (
            <p>{INSPECTION.requirementJudgment.empty}</p>
          ) : (
            <ul className="inspection-list">
              {activeRequirements.map((requirement) => {
                const state = latest.get(requirement.id);
                const verdict = verdicts.get(requirement.id);
                return (
                  <li key={requirement.id} className="inspection-finding">
                    <span>
                      {artifactPaths.get(requirement.source_artifact_id) ??
                        requirement.source_artifact_id}
                    </span>{" "}
                    <span>{excerpt(requirement.statement)}</span>{" "}
                    {state === "queued" || state === "running" ? (
                      <span>{INSPECTION.requirementJudgment.pending}</span>
                    ) : state === "succeeded" && verdict ? (
                      <span>
                        {verdict.verdict
                          ? INSPECTION.requirementJudgment.verdicts[
                              verdict.verdict
                            ]
                          : INSPECTION.judgment.done}
                        {verdict.explanation
                          ? ` — ${excerpt(verdict.explanation, 160)}`
                          : ""}
                      </span>
                    ) : (
                      <form action={requestRequirementJudgment}>
                        <input
                          type="hidden"
                          name="requirementId"
                          value={requirement.id}
                        />
                        <Button type="submit">
                          {state === "failed" || state === "cancelled"
                            ? INSPECTION.requirementJudgment.retry
                            : INSPECTION.requirementJudgment.action}
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
            {INSPECTION.requirementJudgment.source}
          </small>
        </section>
      </section>
    </>
  );
}
