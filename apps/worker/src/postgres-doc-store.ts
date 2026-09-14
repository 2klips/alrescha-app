import type postgres from "postgres";

import type {
  DocSkeletonArtifact,
  DocSkeletonPage,
  DocSkeletonRows,
  DocSkeletonStore,
} from "./doc-skeleton-job";

interface ArtifactRow {
  readonly exported_symbols: unknown;
  readonly id: string;
  readonly path: string;
  readonly source_blob_sha: string | null;
}

interface DirectoryRow {
  readonly id: string;
  readonly path: string;
}

interface EdgeRow {
  readonly relation: string;
  readonly source_node_id: string;
  readonly target_node_id: string;
}

interface NodeRow {
  readonly id: string;
  readonly kind: string;
  readonly label: string;
}

function symbolNames(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === "string") return [entry];
    const name =
      typeof entry === "object" && entry !== null
        ? (entry as { name?: unknown }).name
        : undefined;
    return typeof name === "string" ? [name] : [];
  });
}

/**
 * The rows a skeleton pass reads and the two RPCs it calls (todo 20).
 *
 * Reads are metadata only — paths, symbol names, node labels, relations,
 * blob shas. No body column exists to read, which is the property the
 * skeleton exists to prove.
 */
export class PostgresDocSkeletonStore implements DocSkeletonStore {
  constructor(private readonly sql: postgres.Sql) {}

  async loadSkeletonRows(input: {
    repositoryId: string;
    workspaceId: string;
  }): Promise<DocSkeletonRows> {
    const [repositories, artifacts, directories, edges, nodes] =
      await Promise.all([
        this.sql<{ full_name: string }[]>`
          select full_name from public.repositories
          where workspace_id = ${input.workspaceId} and id = ${input.repositoryId}
        `,
        this.sql<ArtifactRow[]>`
          select id, path, source_blob_sha, exported_symbols
          from public.artifacts
          where workspace_id = ${input.workspaceId}
            and repository_id = ${input.repositoryId}
          order by path
        `,
        this.sql<DirectoryRow[]>`
          select id, path from public.directories
          where workspace_id = ${input.workspaceId}
            and repository_id = ${input.repositoryId}
          order by path
        `,
        this.sql<EdgeRow[]>`
          select relation, source_node_id, target_node_id from public.edges
          where workspace_id = ${input.workspaceId}
            and repository_id = ${input.repositoryId}
          order by source_node_id, target_node_id, relation
        `,
        this.sql<NodeRow[]>`
          select id, kind, label from public.graph_nodes
          where workspace_id = ${input.workspaceId}
            and repository_id = ${input.repositoryId}
          order by id
        `,
      ]);
    const repositoryFullName = repositories[0]?.full_name;
    if (!repositoryFullName) {
      throw new Error("docskeleton: the repository row is missing");
    }
    const storedArtifacts: DocSkeletonArtifact[] = artifacts.map((row) => ({
      blobSha: row.source_blob_sha,
      exportedSymbols: symbolNames(row.exported_symbols),
      nodeId: row.id,
      path: row.path,
    }));
    const pathById = new Map<string, string>([
      ...storedArtifacts.map(
        (artifact) => [artifact.nodeId, artifact.path] as const,
      ),
      ...directories.map((row) => [row.id, row.path] as const),
    ]);
    return {
      artifacts: storedArtifacts,
      directories: directories.map((row) => ({
        nodeId: row.id,
        path: row.path,
      })),
      edges: edges.map((row) => ({
        relation: row.relation,
        sourceNodeId: row.source_node_id,
        targetNodeId: row.target_node_id,
      })),
      nodes: nodes.map((row) => ({
        kind: row.kind,
        nodeId: row.id,
        path: pathById.get(row.id) ?? null,
        title: row.label,
      })),
      repositoryFullName,
    };
  }

  async applySkeletons(input: {
    pages: readonly DocSkeletonPage[];
    repositoryId: string;
    workspaceId: string;
  }): Promise<{ renamed: number; written: number }> {
    const rows = await this.sql<
      { result: { renamed: number; written: number } }[]
    >`
      select public.apply_doc_page_skeletons(
        ${input.workspaceId}, ${input.repositoryId}, ${this.sql.json(input.pages as never)}::jsonb
      ) as result
    `;
    const result = rows[0]?.result;
    return { renamed: result?.renamed ?? 0, written: result?.written ?? 0 };
  }

  /**
   * Queue the skeleton pass behind an analysis (todo 20). Idempotent per
   * repository and commit, and free by the same CHECK the scan and analyze
   * kinds are under — `enqueue_job` refuses a cost on it.
   */
  async enqueueDocSkeleton(input: {
    commitSha: string;
    repositoryId: string;
    runId: string;
    workspaceId: string;
  }): Promise<void> {
    await this.sql`
      select public.enqueue_job(
        ${input.workspaceId},
        ${input.repositoryId},
        ${input.runId},
        'docskeleton',
        ${`docskeleton:${input.repositoryId}:${input.commitSha}`},
        ${this.sql.json({ commitSha: input.commitSha, reason: "analyze" })}::jsonb,
        0,
        3
      )
    `;
  }
}
