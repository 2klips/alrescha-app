import type { CommitFindingsDelta } from "@alrescha/core";
import {
  storedInTotoStatementSchema,
  verifyInTotoStatement,
  type ReceiptVerification,
  type StoredInTotoStatement,
} from "@alrescha/core/receipts";
import type { SupabaseClient } from "@supabase/supabase-js";

import { receiptFindings } from "../commits/commit-cards-report";

/**
 * `/app/receipts` from stored rows (follow-up to OQ-022 ⑴).
 *
 * Every receipt the worker issued is read back through the stored-shape
 * schema and re-verified here, on the server, against the digest the same
 * analyze stored — so the page never shows a verdict it did not compute.
 * A statement that does not parse is shown as `invalid` with its issues
 * rather than dropped: a receipt that cannot be read is itself evidence.
 */

/** Raw rows as Supabase returns them (snake_case). */
export interface WorkspaceReceiptRow {
  readonly commit_sha: string;
  readonly created_at: string;
  readonly digest: string | null;
  readonly id: string;
  readonly repository_id: string;
  readonly run_id: string | null;
  readonly status: string;
  readonly summary: unknown;
}

export interface ReceiptRepositoryRow {
  readonly full_name: string;
  readonly id: string;
  readonly last_scanned_commit_sha: string | null;
}

export interface WorkspaceReceipt {
  readonly commitSha: string;
  readonly createdAt: string;
  /** The digest the analyze stored; null only for a row written without one. */
  readonly digest: string | null;
  readonly findings: CommitFindingsDelta | null;
  readonly id: string;
  /** `repositories.full_name`, or the id when the repository row is gone. */
  readonly repository: string;
  readonly runId: string | null;
  /** True when the repository has since scanned a newer commit. */
  readonly stale: boolean;
  /** The parsed statement, or null when it does not match the stored shape. */
  readonly statement: StoredInTotoStatement | null;
  readonly status: string;
  readonly verification: ReceiptVerification;
}

function statementOf(summary: unknown): unknown {
  if (typeof summary !== "object" || summary === null) return undefined;
  return (summary as Record<string, unknown>)["statement"];
}

/** Pure: rows in, verified receipts out, in the order the rows came. */
export async function buildWorkspaceReceipts(
  rows: readonly WorkspaceReceiptRow[],
  repositories: readonly ReceiptRepositoryRow[],
): Promise<readonly WorkspaceReceipt[]> {
  const repositoryById = new Map(repositories.map((repo) => [repo.id, repo]));
  return Promise.all(
    rows.map(async (row) => {
      const repository = repositoryById.get(row.repository_id);
      const statement = statementOf(row.summary);
      const parsed = storedInTotoStatementSchema.safeParse(statement);
      const verification: ReceiptVerification =
        row.digest === null
          ? { issues: ["receipt row has no digest"], state: "invalid" }
          : await verifyInTotoStatement(statement, row.digest);
      return {
        commitSha: row.commit_sha,
        createdAt: row.created_at,
        digest: row.digest,
        findings: receiptFindings(row.summary),
        id: row.id,
        repository: repository?.full_name ?? row.repository_id,
        runId: row.run_id,
        stale:
          repository?.last_scanned_commit_sha != null &&
          repository.last_scanned_commit_sha !== row.commit_sha,
        statement: parsed.success ? parsed.data : null,
        status: row.status,
        verification,
      };
    }),
  );
}

export async function loadWorkspaceReceipts(
  client: SupabaseClient,
  userId: string,
): Promise<{
  receipts: readonly WorkspaceReceipt[];
  workspaceId: string;
}> {
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
  const [receiptsResult, repositoriesResult] = await Promise.all([
    client
      .from("receipts")
      .select("id,commit_sha,created_at,digest,repository_id,run_id,status,summary")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(50),
    client
      .from("repositories")
      .select("id,full_name,last_scanned_commit_sha")
      .eq("workspace_id", workspaceId),
  ]);
  for (const result of [receiptsResult, repositoriesResult]) {
    if (result.error) throw new Error(result.error.message);
  }
  return {
    receipts: await buildWorkspaceReceipts(
      (receiptsResult.data ?? []) as WorkspaceReceiptRow[],
      (repositoriesResult.data ?? []) as ReceiptRepositoryRow[],
    ),
    workspaceId,
  };
}
