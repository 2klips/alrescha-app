import {
  LINK_SCHEMA_VERSION,
  type PreviousScannedArtifact,
  type RepositoryScanPlan,
  type RepositorySource,
} from "@alrescha/core";
import { describe, expect, it } from "vitest";

import { runRepositoryScan } from "./repository-scan";
import type { RepositoryScanStore } from "./repository-scan-store";

/**
 * A repository whose stored edges predate the current resolver must be
 * re-linked without anyone asking (Phase 4 Wave A todo 0, R5 §2.2 D2).
 *
 * This is the mechanism the sparse production graph came down to: an
 * incremental scan never re-parses a file whose blob is unchanged, so a
 * resolver improvement reached only files that happened to change afterwards
 * — on a settled repository, none of them.
 */

const COMMIT_SHA = "a".repeat(40);

const FILES: Record<string, string> = {
  "src/a.ts": 'import { b } from "./b";\n\nexport const a = () => b();\n',
  "src/b.ts": "export function b(): number {\n  return 1;\n}\n",
};

function source(): RepositorySource {
  return {
    async fetchContent(path: string): Promise<Uint8Array> {
      return new TextEncoder().encode(FILES[path] ?? "");
    },
    async listTree() {
      return {
        entries: Object.keys(FILES).map((path, index) => ({
          mode: "100644",
          path,
          sha: String(index).repeat(40).slice(0, 40),
          size: FILES[path]?.length ?? 0,
          type: "blob" as const,
        })),
        treeSha: "d".repeat(40),
        truncated: false,
      };
    },
  };
}

function fakeStore(previous: {
  artifacts: readonly PreviousScannedArtifact[];
  commitSha: string | null;
  linkSchemaVersion: number;
}): { applied: RepositoryScanPlan[]; store: RepositoryScanStore } {
  const applied: RepositoryScanPlan[] = [];
  const store = {
    async apply(
      _workspaceId: string,
      _repositoryId: string,
      plan: RepositoryScanPlan,
    ): Promise<number> {
      applied.push(plan);
      return plan.touchedRows;
    },
    async loadPrevious() {
      return previous;
    },
  } as unknown as RepositoryScanStore;
  return { applied, store };
}

async function previousArtifacts(): Promise<
  readonly PreviousScannedArtifact[]
> {
  const { applied, store } = fakeStore({
    artifacts: [],
    commitSha: null,
    linkSchemaVersion: LINK_SCHEMA_VERSION,
  });
  await runRepositoryScan({
    commitSha: COMMIT_SHA,
    repositoryId: "repository",
    source: source(),
    store,
    workspaceId: "workspace",
  });
  return (applied[0]?.artifacts ?? []).map((artifact) => ({
    classification: artifact.classification,
    digest: artifact.digest,
    exportedSymbols: artifact.exportedSymbols,
    kind: artifact.kind,
    path: artifact.path,
    sizeBytes: artifact.sizeBytes,
    sourceBlobSha: artifact.sourceBlobSha,
    sourceCommitSha: artifact.sourceCommitSha,
  }));
}

describe("runRepositoryScan", () => {
  it("re-links in full when the stored resolver generation is behind", async () => {
    const artifacts = await previousArtifacts();
    expect(artifacts.length).toBe(2);

    const { applied, store } = fakeStore({
      artifacts,
      commitSha: COMMIT_SHA,
      linkSchemaVersion: 1,
    });
    const result = await runRepositoryScan({
      commitSha: COMMIT_SHA,
      repositoryId: "repository",
      source: source(),
      store,
      workspaceId: "workspace",
    });

    expect(result.linkScope).toBe("full");
    const plan = applied[0];
    expect(plan).toBeDefined();
    expect(plan?.linkScope).toBe("full");
    expect(plan?.linkSchemaVersion).toBe(LINK_SCHEMA_VERSION);
    // Nothing changed, so there are no artifact rows — but the links are back.
    expect(plan?.artifacts).toEqual([]);
    expect(plan?.codeLinks.length).toBeGreaterThan(0);
  });

  it("stays incremental — and silent — when the stored generation is current", async () => {
    const artifacts = await previousArtifacts();
    const { applied, store } = fakeStore({
      artifacts,
      commitSha: COMMIT_SHA,
      linkSchemaVersion: LINK_SCHEMA_VERSION,
    });

    const result = await runRepositoryScan({
      commitSha: COMMIT_SHA,
      repositoryId: "repository",
      source: source(),
      store,
      workspaceId: "workspace",
    });

    expect(result.linkScope).toBe("incremental");
    // The commit has not moved and the resolver has not either: the scan
    // short-circuits rather than re-reading a settled repository.
    expect(applied[0]?.treeSha).toBeNull();
    expect(applied[0]?.codeLinks).toEqual([]);
  });
});
