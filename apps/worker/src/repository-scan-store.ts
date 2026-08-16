import type {
  PreviousScannedArtifact,
  RepositoryScanPlan,
  ScannedArtifact,
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

  async apply(workspaceId: string, repositoryId: string, plan: RepositoryScanPlan): Promise<number> {
    if (plan.treeSha === null && plan.touchedRows === 0) {
      return 0;
    }

    await this.sql.begin(async (transaction) => {
      for (const path of plan.removedPaths) {
        await transaction`
          delete from public.graph_nodes
          where workspace_id = ${workspaceId}
            and repository_id = ${repositoryId}
            and id in (
              select id from public.artifacts
              where workspace_id = ${workspaceId} and repository_id = ${repositoryId} and path = ${path}
            )
        `;
      }

      for (const artifact of plan.artifacts) {
        await this.upsertArtifact(transaction, workspaceId, repositoryId, artifact);
      }

      for (const skip of plan.skipped) {
        await transaction`
          insert into public.repository_scan_skips (
            workspace_id, repository_id, commit_sha, path, reason, detail
          ) values (
            ${workspaceId}, ${repositoryId}, ${plan.commitSha}, ${skip.path}, ${skip.reason}, ${skip.detail}
          )
          on conflict (workspace_id, repository_id, commit_sha, path) do update
          set reason = excluded.reason, detail = excluded.detail, observed_at = now()
        `;
      }

      await transaction`
        update public.repositories
        set last_scanned_commit_sha = ${plan.commitSha}
        where workspace_id = ${workspaceId} and id = ${repositoryId}
      `;
    });

    return plan.touchedRows + 1;
  }

  private async upsertArtifact(
    transaction: postgres.TransactionSql,
    workspaceId: string,
    repositoryId: string,
    artifact: ScannedArtifact,
  ): Promise<void> {
    const existing = await transaction<{ id: string }[]>`
      select id from public.artifacts
      where workspace_id = ${workspaceId} and repository_id = ${repositoryId} and path = ${artifact.path}
    `;
    let artifactId = existing[0]?.id;

    if (!artifactId) {
      const nodes = await transaction<{ id: string }[]>`
        insert into public.graph_nodes (workspace_id, repository_id, kind, label)
        values (${workspaceId}, ${repositoryId}, 'artifact', ${artifact.path})
        returning id
      `;
      artifactId = nodes[0]?.id;
      if (!artifactId) {
        throw new Error("Failed to create graph node for scanned artifact.");
      }
    }

    await transaction`
      insert into public.artifacts (
        id, workspace_id, repository_id, kind, classification, path, digest,
        source_blob_sha, source_commit_sha, last_seen_commit_sha, size_bytes,
        exported_symbols, metadata
      ) values (
        ${artifactId}, ${workspaceId}, ${repositoryId}, ${artifact.kind}, ${artifact.classification},
        ${artifact.path}, ${artifact.digest}, ${artifact.sourceBlobSha}, ${artifact.sourceCommitSha},
        ${artifact.sourceCommitSha}, ${artifact.sizeBytes}, ${JSON.stringify(artifact.exportedSymbols)}::jsonb,
        '{}'::jsonb
      )
      on conflict (workspace_id, repository_id, path) do update
      set kind = excluded.kind,
          classification = excluded.classification,
          digest = excluded.digest,
          source_blob_sha = excluded.source_blob_sha,
          source_commit_sha = excluded.source_commit_sha,
          last_seen_commit_sha = excluded.last_seen_commit_sha,
          size_bytes = excluded.size_bytes,
          exported_symbols = excluded.exported_symbols,
          updated_at = now()
    `;

    await this.syncDocumentTodos(
      transaction,
      workspaceId,
      repositoryId,
      artifactId,
      artifact,
    );
  }

  private async syncDocumentTodos(
    transaction: postgres.TransactionSql,
    workspaceId: string,
    repositoryId: string,
    artifactId: string,
    artifact: ScannedArtifact,
  ): Promise<void> {
    const sourceKeys = artifact.todoItems.map(({ sourceKey }) => sourceKey);
    if (sourceKeys.length === 0) {
      await transaction`
        delete from public.todos
        where workspace_id = ${workspaceId}
          and repository_id = ${repositoryId}
          and source_artifact_id = ${artifactId}
          and source_kind = 'document'
      `;
    } else {
      await transaction`
        delete from public.todos
        where workspace_id = ${workspaceId}
          and repository_id = ${repositoryId}
          and source_artifact_id = ${artifactId}
          and source_kind = 'document'
          and not (source_key = any(${sourceKeys}))
      `;
    }

    for (const todo of artifact.todoItems) {
      await transaction`
        insert into public.todos (
          workspace_id,
          repository_id,
          title,
          status,
          source_kind,
          source_key,
          source_artifact_id,
          source_path,
          source_span
        ) values (
          ${workspaceId},
          ${repositoryId},
          ${todo.title},
          ${todo.status},
          'document',
          ${todo.sourceKey},
          ${artifactId},
          ${todo.source.path},
          ${JSON.stringify(todo.source.span)}::jsonb
        )
        on conflict (workspace_id, source_kind, source_key) do update
        set title = excluded.title,
            status = excluded.status,
            repository_id = excluded.repository_id,
            source_artifact_id = excluded.source_artifact_id,
            source_path = excluded.source_path,
            source_span = excluded.source_span,
            updated_at = now()
      `;
    }
  }
}
