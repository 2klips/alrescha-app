import type { SupabaseClient } from "@supabase/supabase-js";

import {
  EVERY_ROW,
  readEveryRowByPosition,
  readRowsById,
  type TableQuery,
} from "../supabase/table-pages";

/** A stored instruction file, as the harness cards and cost table read it. */
export interface HarnessArtifactRow {
  readonly classification: string;
  readonly digest: string;
  readonly id: string;
  readonly path: string;
  readonly repository_id: string;
  readonly size_bytes: number | null;
  readonly source_commit_sha: string;
}

export interface HarnessRows {
  /** The workspace's instruction files, in the database's path order. */
  readonly artifacts: readonly HarnessArtifactRow[];
  /** Each repository's name by id, for the cards' provenance. */
  readonly repositoryNames: ReadonlyMap<string, string>;
}

/**
 * The page's order: the database's by path, the id deciding a path two
 * repositories share, so the order is total and no page repeats a row.
 */
const INSTRUCTION_ORDER = [
  ["path", true],
  ["id", true],
] as const;

/**
 * What `/app/harness` is drawn from (todo 24): the workspace's instruction
 * files — never a body — and the names of the repositories they came from.
 * Null when a read failed.
 *
 * Both read past PostgREST's row cap (RE-04): the server answers with at
 * most 1,000 rows and says nothing, so a workspace with more instruction
 * files than that listed the first thousand by path as all of them, and a
 * file whose repository a capped page left out lost its card. Neither read
 * has a budget. The files keep the order the page listed them in, which
 * only the database can give, so they page by position in it.
 */
export async function readHarnessRows(
  client: SupabaseClient,
  workspaceId: string,
): Promise<HarnessRows | null> {
  const inWorkspace = <Row>(query: TableQuery<Row>) =>
    query.eq("workspace_id", workspaceId);
  const [artifacts, repositories] = await Promise.all([
    readEveryRowByPosition<HarnessArtifactRow>(
      client,
      "artifacts",
      "id,repository_id,classification,path,digest,size_bytes,source_commit_sha",
      INSTRUCTION_ORDER,
      (query) => inWorkspace(query).eq("kind", "instruction"),
    ),
    readRowsById<{ readonly full_name: string; readonly id: string }>(
      client,
      "repositories",
      "id,full_name",
      EVERY_ROW,
      inWorkspace,
    ),
  ]);
  if (artifacts.error || repositories.error) return null;
  return {
    artifacts: artifacts.data,
    repositoryNames: new Map(
      repositories.data.map((repository) => [
        String(repository.id),
        String(repository.full_name),
      ]),
    ),
  };
}
