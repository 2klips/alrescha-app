import { isScannableCommitSha } from "@alrescha/core";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { DefaultBranchHead } from "./api";

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
 * button, a retried form post and a re-render all resolve to the same pair of
 * jobs (scan, then analyze — what a push queues). It costs nothing: both are
 * deterministic and `enqueue_job` refuses a non-zero credit cost for them.
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

/**
 * Which head the backfill scans at. A caller that already knows it (a test,
 * a replay) hands it in; otherwise the branch is read with the installation
 * token the connect minted a moment ago — one more GitHub call on a token
 * that is scoped to this repository and is about to be dropped.
 */
export async function resolveConnectHead(input: {
  readonly defaultBranch: string;
  readonly fullName: string;
  readonly providedHead: string | null | undefined;
  readonly readHead: (input: {
    branch: string;
    fullName: string;
    token: string;
  }) => Promise<DefaultBranchHead>;
  readonly token: string | null;
}): Promise<DefaultBranchHead> {
  if (typeof input.providedHead === "string") {
    return { sha: input.providedHead };
  }
  if (input.token === null) {
    return { error: "no installation token was minted for the repository" };
  }
  return input.readHead({
    branch: input.defaultBranch,
    fullName: input.fullName,
    token: input.token,
  });
}

/** Schedules the backfill when the head is known; says why when it is not. */
export async function scheduleBackfillAtHead(input: {
  readonly client: SupabaseClient;
  readonly head: DefaultBranchHead;
  readonly repositoryId: string;
  readonly workspaceId: string;
}): Promise<BackfillScanResult> {
  if ("error" in input.head) {
    return {
      jobId: null,
      reason: `the repository's head commit could not be read: ${input.head.error}`,
      scheduled: false,
    };
  }
  return scheduleBackfillScan({
    client: input.client,
    headCommitSha: input.head.sha,
    repositoryId: input.repositoryId,
    workspaceId: input.workspaceId,
  });
}

export async function scheduleBackfillScan(input: {
  readonly client: SupabaseClient;
  readonly headCommitSha: string | null;
  readonly repositoryId: string;
  readonly workspaceId: string;
}): Promise<BackfillScanResult> {
  if (!input.headCommitSha || !isScannableCommitSha(input.headCommitSha)) {
    // Without a head there is nothing to scan *at*. Saying so beats
    // scheduling a job that would fail in the worker. The null sha counts as
    // no head: it is what an empty repository or a deleted branch reports.
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
