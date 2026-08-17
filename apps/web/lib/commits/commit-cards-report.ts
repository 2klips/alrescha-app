import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildCommitAnalysisCards,
  type AnalysisJobInput,
  type AnalysisReceiptInput,
  type AnalysisTriggerKind,
  type CommitAnalysisCard,
  type CommitFindingsDelta,
} from "@arr/core";

/** Raw rows as Supabase returns them (snake_case). */
export interface CommitCardRunRow {
  readonly commit_sha: string;
  readonly created_at: string;
  readonly id: string;
  readonly repository_id: string;
  readonly trigger_kind: string;
}

export interface CommitCardJobRow {
  readonly claimed_at: string | null;
  readonly completed_at: string | null;
  readonly kind: string;
  readonly last_error: string | null;
  readonly run_id: string | null;
  readonly status: string;
}

export interface CommitCardReceiptRow {
  readonly commit_sha: string;
  readonly id: string;
  readonly run_id: string | null;
  readonly summary: unknown;
}

export interface CommitCardRepositoryRow {
  readonly full_name: string;
  readonly id: string;
}

export interface WorkspaceCommitCardRows {
  readonly jobs: readonly CommitCardJobRow[];
  readonly receipts: readonly CommitCardReceiptRow[];
  readonly repositories: readonly CommitCardRepositoryRow[];
  readonly runs: readonly CommitCardRunRow[];
}

const TRIGGER_KINDS: readonly AnalysisTriggerKind[] = [
  "manual",
  "push",
  "check_run",
  "workflow_run",
];

const JOB_KINDS = ["scan", "analyze", "judge", "pack"] as const;
const JOB_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
] as const;

function isTriggerKind(value: string): value is AnalysisTriggerKind {
  return (TRIGGER_KINDS as readonly string[]).includes(value);
}

/**
 * The receipt `summary.findings` snapshot (WORK_SPEC §13). A malformed or
 * missing snapshot yields `null` — the card then shows no delta rather than a
 * guessed one.
 */
export function receiptFindings(summary: unknown): CommitFindingsDelta | null {
  if (typeof summary !== "object" || summary === null) {
    return null;
  }
  const findings = (summary as Record<string, unknown>)["findings"];
  if (typeof findings !== "object" || findings === null) {
    return null;
  }
  const record = findings as Record<string, unknown>;
  const opened = record["opened"];
  const resolved = record["resolved"];
  const openTotal = record["open_total"];
  if (
    !Array.isArray(opened) ||
    !Array.isArray(resolved) ||
    typeof openTotal !== "number" ||
    !Number.isFinite(openTotal)
  ) {
    return null;
  }
  return {
    opened: opened.length,
    openTotal,
    resolved: resolved.length,
  };
}

export function buildWorkspaceCommitCards(
  rows: WorkspaceCommitCardRows,
): readonly CommitAnalysisCard[] {
  const repositoryNames = new Map(
    rows.repositories.map(({ full_name, id }) => [id, full_name]),
  );
  const jobs: AnalysisJobInput[] = rows.jobs.flatMap((job) =>
    job.run_id !== null &&
    (JOB_KINDS as readonly string[]).includes(job.kind) &&
    (JOB_STATUSES as readonly string[]).includes(job.status)
      ? [
          {
            claimedAt: job.claimed_at,
            completedAt: job.completed_at,
            kind: job.kind as AnalysisJobInput["kind"],
            lastError: job.last_error,
            runId: job.run_id,
            status: job.status as AnalysisJobInput["status"],
          },
        ]
      : [],
  );
  const receipts: AnalysisReceiptInput[] = rows.receipts.map((receipt) => ({
    commitSha: receipt.commit_sha,
    findings: receiptFindings(receipt.summary),
    id: receipt.id,
    runId: receipt.run_id,
  }));
  return buildCommitAnalysisCards({
    jobs,
    receipts,
    runs: rows.runs.flatMap((run) =>
      isTriggerKind(run.trigger_kind)
        ? [
            {
              commitSha: run.commit_sha,
              createdAt: run.created_at,
              id: run.id,
              repository:
                repositoryNames.get(run.repository_id) ?? run.repository_id,
              triggerKind: run.trigger_kind,
            },
          ]
        : [],
    ),
  });
}

export async function loadWorkspaceCommitCards(
  client: SupabaseClient,
  userId: string,
): Promise<{ cards: readonly CommitAnalysisCard[]; workspaceId: string }> {
  const workspaceResult = await client
    .from("workspaces")
    .select("id")
    .eq("owner_user_id", userId)
    .limit(1)
    .single();
  if (workspaceResult.error || !workspaceResult.data) {
    throw new Error("Personal workspace is unavailable.");
  }
  const workspaceId = String(workspaceResult.data.id);
  const runsResult = await client
    .from("runs")
    .select("id,commit_sha,created_at,repository_id,trigger_kind")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (runsResult.error) {
    throw new Error(runsResult.error.message);
  }
  const runs = (runsResult.data ?? []) as CommitCardRunRow[];
  const runIds = runs.map(({ id }) => id);
  const [jobsResult, receiptsResult, repositoriesResult] = await Promise.all([
    runIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : client
          .from("jobs")
          .select("run_id,kind,status,claimed_at,completed_at,last_error")
          .eq("workspace_id", workspaceId)
          .in("run_id", runIds),
    runIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : client
          .from("receipts")
          .select("id,run_id,commit_sha,summary")
          .eq("workspace_id", workspaceId)
          .in("run_id", runIds),
    client.from("repositories").select("id,full_name").eq("workspace_id", workspaceId),
  ]);
  for (const result of [jobsResult, receiptsResult, repositoriesResult]) {
    if (result.error) {
      throw new Error(result.error.message);
    }
  }
  return {
    cards: buildWorkspaceCommitCards({
      jobs: (jobsResult.data ?? []) as CommitCardJobRow[],
      receipts: (receiptsResult.data ?? []) as CommitCardReceiptRow[],
      repositories: (repositoriesResult.data ?? []) as CommitCardRepositoryRow[],
      runs,
    }),
    workspaceId,
  };
}
