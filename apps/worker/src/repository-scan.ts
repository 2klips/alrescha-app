import {
  LINK_SCHEMA_VERSION,
  scanRepository,
  type LinkScope,
  type RepositorySource,
} from "@alrescha/core";

import type { ArchivePrefetch } from "./github-repository-source";
import type { RepositoryScanStore } from "./repository-scan-store";

/**
 * A source that can hand a full pass every body at once
 * (`GitHubRepositorySource`). The CLI's local source cannot and need not: its
 * bodies are on the disk beside it.
 */
export interface ScanSource extends RepositorySource {
  prefetchArchive?(commitSha: string): Promise<ArchivePrefetch>;
}

/** How the pass read its bodies, for the worker's log line. */
export type ScanArchiveSummary =
  | { readonly archived: true; readonly bytes: number; readonly files: number }
  | { readonly archived: false; readonly reason: string }
  | null;

export async function runRepositoryScan(input: {
  readonly commitSha: string;
  /** Blob fetches in flight; see SCAN_FETCH_CONCURRENCY (perf research MT-3). */
  readonly fetchConcurrency?: number;
  /** Force a full relink regardless of the stored resolver generation. */
  readonly mode?: LinkScope;
  readonly repositoryId: string;
  readonly source: ScanSource;
  readonly store: RepositoryScanStore;
  readonly workspaceId: string;
}): Promise<{
  archive: ScanArchiveSummary;
  linkScope: LinkScope;
  touchedRows: number;
}> {
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
  /**
   * A full pass reads nearly every body, and each per-file read is one
   * request against the installation's hourly budget; the archive is one
   * (PR #9 follow-up). An incremental pass reads what a push changed and
   * stays per file. The bodies are released with the pass, landed or not.
   */
  const archive =
    mode === "full" && input.source.prefetchArchive
      ? await input.source.prefetchArchive(input.commitSha)
      : null;
  try {
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
      archive:
        archive === null
          ? null
          : archive.archived
            ? { archived: true, bytes: archive.bytes, files: archive.files }
            : { archived: false, reason: archive.reason },
      linkScope: plan.linkScope,
      touchedRows: await input.store.apply(
        input.workspaceId,
        input.repositoryId,
        plan,
      ),
    };
  } finally {
    archive?.release();
  }
}
