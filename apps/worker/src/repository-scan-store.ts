import type {
  PreviousScannedArtifact,
  RepositoryScanPlan,
} from "@arr/core";
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

  async loadPrevious(workspaceId: string, repositoryId: string): Promise<{
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
  async apply(workspaceId: string, repositoryId: string, plan: RepositoryScanPlan): Promise<number> {
    const rows = await this.sql<{ touched: number }[]>`
      select public.apply_repository_scan(
        ${workspaceId}, ${repositoryId}, ${JSON.stringify(plan)}::jsonb
      ) as touched
    `;
    return rows[0]?.touched ?? 0;
  }
}
