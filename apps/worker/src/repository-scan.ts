import { scanRepository, type RepositorySource } from "@alrescha/core";

import type { RepositoryScanStore } from "./repository-scan-store";

export async function runRepositoryScan(input: {
  readonly commitSha: string;
  /** Blob fetches in flight; see SCAN_FETCH_CONCURRENCY (perf research MT-3). */
  readonly fetchConcurrency?: number;
  readonly repositoryId: string;
  readonly source: RepositorySource;
  readonly store: RepositoryScanStore;
  readonly workspaceId: string;
}): Promise<{ touchedRows: number }> {
  const previous = await input.store.loadPrevious(
    input.workspaceId,
    input.repositoryId,
  );
  const plan = await scanRepository({
    commitSha: input.commitSha,
    ...(input.fetchConcurrency === undefined
      ? {}
      : { fetchConcurrency: input.fetchConcurrency }),
    previousArtifacts: previous.artifacts,
    previousCommitSha: previous.commitSha,
    source: input.source,
  });
  return {
    touchedRows: await input.store.apply(
      input.workspaceId,
      input.repositoryId,
      plan,
    ),
  };
}
