import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The first scan of a repository that is already finished (Phase 4 Wave C
 * todo 16, D11, OQ-029).
 *
 * Connecting a repository used to store a row and wait for a push. A finished
 * repository — the case this wave exists for — may not see one for weeks, so
 * the product's first impression was an empty graph and an invitation to go
 * and commit something.
 *
 * Scheduling is idempotent on `(repository, head)`, so a double-clicked
 * button, a retried form post and a re-render all resolve to the same job.
 * It costs nothing: a scan is deterministic and `enqueue_job` refuses a
 * non-zero credit cost for it.
 *
 * Failure here does **not** fail the connect. A repository that is connected
 * but not yet scanned is a state the product already handles (the basis
 * reports `structure: building`), while a connect that fails after the row
 * was written would leave the user with a half-finished setup and no way to
 * retry except disconnecting.
 */
export interface BackfillScanResult {
  jobId: string | null;
  reason: string;
  scheduled: boolean;
}

export async function scheduleBackfillScan(input: {
  readonly client: SupabaseClient;
  readonly headCommitSha: string | null;
  readonly repositoryId: string;
  readonly workspaceId: string;
}): Promise<BackfillScanResult> {
  if (!input.headCommitSha || !/^[0-9a-f]{40}$/.test(input.headCommitSha)) {
    // Without a head there is nothing to scan *at*. Saying so beats
    // scheduling a job that would fail in the worker.
    return {
      jobId: null,
      reason: "the repository's head commit is unknown",
      scheduled: false,
    };
  }

  const result = await input.client.rpc("enqueue_backfill_scan", {
    head_commit_sha: input.headCommitSha,
    target_repository_id: input.repositoryId,
    target_workspace_id: input.workspaceId,
  });
  if (result.error) {
    return { jobId: null, reason: result.error.message, scheduled: false };
  }
  const jobId = typeof result.data === "string" ? result.data : null;
  return {
    jobId,
    reason: jobId === null ? "the queue returned no job" : "scheduled",
    scheduled: jobId !== null,
  };
}
