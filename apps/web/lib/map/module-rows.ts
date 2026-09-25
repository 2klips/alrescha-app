import type { SupabaseClient } from "@supabase/supabase-js";

import {
  EVERY_ROW,
  readRowsById,
  type TableQuery,
} from "../supabase/table-pages";
import type { ModuleCardInputs } from "./inspect-card";

/** Rows one module computation may read — the map's own per-table caps. */
export const MODULE_ARTIFACT_LIMIT = 2_000;
export const MODULE_EDGE_LIMIT = 6_000;

interface ModuleArtifactRow {
  readonly id: string;
  readonly path: string;
  readonly source_blob_sha: string | null;
}

interface ModuleEdgeRow {
  readonly id: string;
  readonly relation: string;
  readonly source_node_id: string;
  readonly target_node_id: string;
}

interface ModuleSummaryRow {
  readonly id: string;
  readonly member_digest: string;
  readonly member_paths: readonly string[] | null;
  readonly module_key: string;
  readonly name: string;
  readonly summary: string;
}

/**
 * What the map inspector's module card is computed from (Phase 4 Wave D
 * todo 19 ⑴): a repository's files, their import and call edges, and the
 * module summaries stored for it. Null when a read failed.
 *
 * Each read pages past PostgREST's row cap (RE-04): the server answers with
 * at most 1,000 rows and says nothing, and the pilot's 1,010 files and some
 * 2,800 import and call edges had the card computing modules from the first
 * thousand of each. The budgets are the ones the reads had.
 */
export async function readModuleCardInputs(
  client: SupabaseClient,
  repositoryId: string,
): Promise<ModuleCardInputs | null> {
  const inRepository = <Row>(query: TableQuery<Row>) =>
    query.eq("repository_id", repositoryId);
  const [artifacts, edges, summaries] = await Promise.all([
    readRowsById<ModuleArtifactRow>(
      client,
      "artifacts",
      "id,path,source_blob_sha",
      MODULE_ARTIFACT_LIMIT,
      inRepository,
    ),
    readRowsById<ModuleEdgeRow>(
      client,
      "edges",
      "id,relation,source_node_id,target_node_id",
      MODULE_EDGE_LIMIT,
      (query) => inRepository(query).in("relation", ["imports", "calls"]),
    ),
    // `id` is selected only to continue past a page.
    readRowsById<ModuleSummaryRow>(
      client,
      "module_summaries",
      "id,module_key,name,member_paths,member_digest,summary",
      EVERY_ROW,
      inRepository,
    ),
  ]);
  if (artifacts.error || edges.error || summaries.error) return null;
  return {
    artifacts: artifacts.data.map((entry) => ({
      blobSha: entry.source_blob_sha,
      id: entry.id,
      path: entry.path,
    })),
    edges: edges.data.map((entry) => ({
      relation: entry.relation,
      sourceNodeId: entry.source_node_id,
      targetNodeId: entry.target_node_id,
    })),
    summaries: summaries.data.map((entry) => ({
      memberDigest: entry.member_digest,
      memberPaths: entry.member_paths ?? [],
      moduleKey: entry.module_key,
      name: entry.name,
      summary: entry.summary,
    })),
  };
}
