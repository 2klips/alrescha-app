import {
  LINK_SCHEMA_VERSION,
  scanRepository,
  type LinkScope,
  type RepositorySource,
} from "@alrescha/core";

import type { RepositoryScanStore } from "./repository-scan-store";

export async function runRepositoryScan(input: {
  readonly commitSha: string;
  /** Blob fetches in flight; see SCAN_FETCH_CONCURRENCY (perf research MT-3). */
  readonly fetchConcurrency?: number;
  /** Force a full relink regardless of the stored resolver generation. */
  readonly mode?: LinkScope;
  readonly repositoryId: string;
  readonly source: RepositorySource;
  readonly store: RepositoryScanStore;
  readonly workspaceId: string;
}): Promise<{ linkScope: LinkScope; touchedRows: number }> {
  const previous = await input.store.loadPrevious(
    input.workspaceId,
    input.repositoryId,
  );
  /**
   * An incremental pass never re-parses an unchanged file, so a repository
   * whose edges were built by an older resolver would keep its thin graph
   * until every file happened to change. Falling behind the current
   * generation is therefore itself a reason to relink (R5 §2.2 D2).
   */
  const mode: LinkScope =
    input.mode === "full" || previous.linkSchemaVersion < LINK_SCHEMA_VERSION
      ? "full"
      : "incremental";
  const plan = await scanRepository({
    commitSha: input.commitSha,
    ...(input.fetchConcurrency === undefined
      ? {}
      : { fetchConcurrency: input.fetchConcurrency }),
    mode,
    previousArtifacts: previous.artifacts,
    previousCommitSha: previous.commitSha,
    source: input.source,
  });
  return {
    linkScope: plan.linkScope,
    touchedRows: await input.store.apply(
      input.workspaceId,
      input.repositoryId,
      plan,
    ),
  };
}
