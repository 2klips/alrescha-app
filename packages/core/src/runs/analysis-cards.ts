/**
 * Per-commit analysis cards (Phase 2B todo 2, ADR-003 "push → auto analysis").
 *
 * A run's own `status` column never leaves `pending` in production (see
 * OQ-014), so the card status is derived from the run's job rows — the one
 * place the worker actually records transitions. Every value here is either
 * read from a stored row or `null`; nothing is fabricated.
 */

export type AnalysisTriggerKind =
  | "manual"
  | "push"
  | "check_run"
  | "workflow_run";

export type AnalysisJobKind = "scan" | "analyze" | "judge" | "pack";

export type AnalysisJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type CommitAnalysisStatus =
  | "pending"
  | "analyzing"
  | "completed"
  | "failed";

/**
 * How much this run can be trusted to assert (ADR-015). `full` runs are
 * analyzed server-side from transiently fetched bodies, so findings and a
 * receipt are possible. `graph-only` runs came through the metadata-only local
 * ingest path — the server never saw the bodies, so it must not claim either.
 */
export type CommitAssuranceScope = "full" | "graph-only";

export type AnalysisRunStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface AnalysisRunInput {
  readonly commitSha: string;
  readonly completedAt?: string | null;
  readonly createdAt: string;
  readonly id: string;
  readonly repository: string;
  readonly startedAt?: string | null;
  /**
   * The stored run status. Authoritative for runs with no jobs — a local
   * ingest is synchronous and settles on arrival, so there is nothing to
   * derive from. For job-backed runs the jobs stay the source of truth and
   * this acts as a second ledger (a mismatch is a regression signal).
   */
  readonly status?: AnalysisRunStatus;
  readonly triggerKind: AnalysisTriggerKind;
}

export interface AnalysisJobInput {
  readonly claimedAt: string | null;
  readonly completedAt: string | null;
  readonly kind: AnalysisJobKind;
  readonly lastError: string | null;
  readonly runId: string;
  readonly status: AnalysisJobStatus;
}

export interface CommitFindingsDelta {
  readonly opened: number;
  readonly openTotal: number;
  readonly resolved: number;
}

export interface AnalysisReceiptInput {
  readonly commitSha: string;
  readonly findings: CommitFindingsDelta | null;
  readonly id: string;
  readonly runId: string | null;
}

export interface CommitAnalysisJobStep {
  readonly kind: AnalysisJobKind;
  readonly status: AnalysisJobStatus;
}

export interface CommitAnalysisCard {
  readonly assurance: CommitAssuranceScope;
  readonly commitSha: string;
  readonly createdAt: string;
  readonly durationMs: number | null;
  readonly failureReason: string | null;
  readonly findingsDelta: CommitFindingsDelta | null;
  readonly jobs: readonly CommitAnalysisJobStep[];
  readonly receiptId: string | null;
  readonly repository: string;
  readonly runId: string;
  readonly status: CommitAnalysisStatus;
  readonly triggerKind: AnalysisTriggerKind;
}

export interface BuildCommitAnalysisCardsInput {
  readonly jobs: readonly AnalysisJobInput[];
  readonly receipts: readonly AnalysisReceiptInput[];
  readonly runs: readonly AnalysisRunInput[];
}

const JOB_KIND_ORDER: readonly AnalysisJobKind[] = [
  "scan",
  "analyze",
  "judge",
  "pack",
];

const RUN_STATUS_CARD: Readonly<
  Record<AnalysisRunStatus, CommitAnalysisStatus>
> = {
  cancelled: "failed",
  failed: "failed",
  pending: "pending",
  running: "analyzing",
  succeeded: "completed",
};

function deriveStatus(
  jobs: readonly AnalysisJobInput[],
  runStatus: AnalysisRunStatus | undefined,
): CommitAnalysisStatus {
  if (jobs.length === 0) {
    return runStatus ? RUN_STATUS_CARD[runStatus] : "pending";
  }
  if (
    jobs.some(({ status }) => status === "failed" || status === "cancelled")
  ) {
    return "failed";
  }
  if (jobs.every(({ status }) => status === "queued")) {
    return "pending";
  }
  if (jobs.every(({ status }) => status === "succeeded")) {
    return "completed";
  }
  return "analyzing";
}

/** The stored error, verbatim — the UI's contract is to show it unedited. */
function deriveFailureReason(
  jobs: readonly AnalysisJobInput[],
): string | null {
  for (const job of jobs) {
    if (
      (job.status === "failed" || job.status === "cancelled") &&
      job.lastError !== null
    ) {
      return job.lastError;
    }
  }
  return null;
}

function parseInstant(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Wall time from the first claim to the last completion. Only terminal runs
 * have a duration; an in-flight run would need a "now", which a deterministic
 * builder does not have.
 */
function deriveDurationMs(
  status: CommitAnalysisStatus,
  jobs: readonly AnalysisJobInput[],
  run: AnalysisRunInput,
): number | null {
  if (status !== "completed" && status !== "failed") {
    return null;
  }
  if (jobs.length === 0) {
    // Job-less run (local ingest): the run's own server-measured timestamps.
    const started = parseInstant(run.startedAt ?? null);
    const completed = parseInstant(run.completedAt ?? null);
    if (started === null || completed === null || completed < started) {
      return null;
    }
    return completed - started;
  }
  const starts = jobs
    .map(({ claimedAt }) => parseInstant(claimedAt))
    .filter((instant): instant is number => instant !== null);
  const ends = jobs
    .map(({ completedAt }) => parseInstant(completedAt))
    .filter((instant): instant is number => instant !== null);
  if (starts.length === 0 || ends.length === 0) {
    return null;
  }
  const duration = Math.max(...ends) - Math.min(...starts);
  return duration < 0 ? null : duration;
}

/**
 * A job row exists only when the worker was asked to analyze fetched bodies,
 * so a job-less run is exactly the local ingest path (ADR-015 §3). Derived
 * from the same stored signal the duration uses — not from a second column
 * that could drift out of step with it.
 */
function deriveAssurance(
  jobs: readonly AnalysisJobInput[],
): CommitAssuranceScope {
  return jobs.length === 0 ? "graph-only" : "full";
}

function matchReceipt(
  run: AnalysisRunInput,
  receipts: readonly AnalysisReceiptInput[],
): AnalysisReceiptInput | null {
  return (
    receipts.find((receipt) => receipt.runId === run.id) ??
    receipts.find(
      (receipt) => receipt.runId === null && receipt.commitSha === run.commitSha,
    ) ??
    null
  );
}

export function buildCommitAnalysisCards(
  input: BuildCommitAnalysisCardsInput,
): readonly CommitAnalysisCard[] {
  return input.runs
    .map((run) => {
      const jobs = input.jobs
        .filter((job) => job.runId === run.id)
        .sort(
          (left, right) =>
            JOB_KIND_ORDER.indexOf(left.kind) -
            JOB_KIND_ORDER.indexOf(right.kind),
        );
      const status = deriveStatus(jobs, run.status);
      const receipt = matchReceipt(run, input.receipts);
      return {
        assurance: deriveAssurance(jobs),
        commitSha: run.commitSha,
        createdAt: run.createdAt,
        durationMs: deriveDurationMs(status, jobs, run),
        failureReason: status === "failed" ? deriveFailureReason(jobs) : null,
        findingsDelta: receipt?.findings ?? null,
        jobs: jobs.map(({ kind, status: jobStatus }) => ({
          kind,
          status: jobStatus,
        })),
        receiptId: receipt?.id ?? null,
        repository: run.repository,
        runId: run.id,
        status,
        triggerKind: run.triggerKind,
      };
    })
    .sort(
      (left, right) =>
        right.createdAt.localeCompare(left.createdAt) ||
        left.runId.localeCompare(right.runId),
    );
}
