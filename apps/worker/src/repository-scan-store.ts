import type { PreviousScannedArtifact, RepositoryScanPlan } from "@arr/core";
import type postgres from "postgres";

interface PreviousArtifactRow {
  classification: PreviousScannedArtifact["classification"];
  digest: string;
  exported_symbols: PreviousScannedArtifact["exportedSymbols"];
  kind: PreviousScannedArtifact["kind"];
  last_seen_commit_sha: string;
  path: string;
  size_bytes: number;
  source_blob_sha: string;
  source_commit_sha: string;
}

function fromRow(row: PreviousArtifactRow): PreviousScannedArtifact {
  return {
    classification: row.classification,
    digest: row.digest,
    exportedSymbols: row.exported_symbols,
    kind: row.kind,
    path: row.path,
    sizeBytes: row.size_bytes,
    sourceBlobSha: row.source_blob_sha,
    sourceCommitSha: row.last_seen_commit_sha || row.source_commit_sha,
  };
}

export class RepositoryScanStore {
  constructor(private readonly sql: postgres.Sql) {}

  async loadPrevious(
    workspaceId: string,
    repositoryId: string,
  ): Promise<{
    artifacts: readonly PreviousScannedArtifact[];
    commitSha: string | null;
  }> {
    const [repositories, artifacts] = await Promise.all([
      this.sql<{ last_scanned_commit_sha: string | null }[]>`
        select last_scanned_commit_sha from public.repositories
        where workspace_id = ${workspaceId} and id = ${repositoryId}
      `,
      this.sql<PreviousArtifactRow[]>`
        select path, classification, kind, digest, source_blob_sha, source_commit_sha,
               last_seen_commit_sha, size_bytes, exported_symbols
        from public.artifacts
        where workspace_id = ${workspaceId} and repository_id = ${repositoryId}
      `,
    ]);
    return {
      artifacts: artifacts.map(fromRow),
      commitSha: repositories[0]?.last_scanned_commit_sha ?? null,
    };
  }

  /**
   * Persistence lives in `public.apply_repository_scan` (202608170002) so the
   * GitHub path and the local ingest path share one atomic implementation
   * (ADR-013 — the two routes must yield the same graph).
   */
  async apply(
    workspaceId: string,
    repositoryId: string,
    plan: RepositoryScanPlan,
  ): Promise<number> {
    // `sql.json`, not `JSON.stringify`: postgres.js sends an interpolated
    // string as a JSON *string scalar*, so `plan->>'treeSha'` and
    // `plan->>'touchedRows'` both read null inside the function, its
    // unchanged-commit guard fires, and it returns 0 having written nothing.
    // That silence is why the GitHub scan path never persisted a row.
    const rows = await this.sql<{ touched: number }[]>`
      select public.apply_repository_scan(
        ${workspaceId}, ${repositoryId}, ${this.sql.json(
          // `sql.json` is typed for index-signature objects; the plan is a
          // closed interface of plain JSON values, which satisfies it in fact
          // but not in type.
          plan as unknown as postgres.JSONValue,
        )}::jsonb
      ) as touched
    `;
    return rows[0]?.touched ?? 0;
  }
}
