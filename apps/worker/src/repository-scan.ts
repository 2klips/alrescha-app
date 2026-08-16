import { scanRepository, type RepositorySource } from "@arr/core";

import type { RepositoryScanStore } from "./repository-scan-store";

export async function runRepositoryScan(input: {
  readonly commitSha: string;
  readonly repositoryId: string;
  readonly source: RepositorySource;
  readonly store: RepositoryScanStore;
  readonly workspaceId: string;
}): Promise<{ touchedRows: number }> {
  const previous = await input.store.loadPrevious(input.workspaceId, input.repositoryId);
  const plan = await scanRepository({
    commitSha: input.commitSha,
    previousArtifacts: previous.artifacts,
    previousCommitSha: previous.commitSha,
    source: input.source,
  });
  return { touchedRows: await input.store.apply(input.workspaceId, input.repositoryId, plan) };
}
