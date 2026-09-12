import { describe, expect, test } from "vitest";

import {
  buildScanProgress,
  buildWorkspaceJourney,
  type WorkspaceJourneyJobRow,
  type WorkspaceJourneyRepositoryRow,
  type WorkspaceJourneyRows,
} from "./journey";

const EMPTY: WorkspaceJourneyRows = {
  agentAssertionCount: 0,
  edgeCount: 0,
  installations: [],
  jobs: [],
  nodeCount: 0,
  repositories: [],
  tokens: [],
};

const HEAD = "a".repeat(40);
const NEXT = "b".repeat(40);

const GITHUB_REPO: WorkspaceJourneyRepositoryRow = {
  full_name: "acme/app",
  id: "repo-1",
  installation_id: "inst-1",
  last_analyzed_commit_sha: null,
  last_scanned_commit_sha: null,
};

const LOCAL_REPO: WorkspaceJourneyRepositoryRow = {
  full_name: "local/notes",
  id: "repo-2",
  installation_id: null,
  last_analyzed_commit_sha: null,
  last_scanned_commit_sha: HEAD,
};

function job(
  kind: "analyze" | "scan",
  status: string,
  overrides: Partial<WorkspaceJourneyJobRow> = {},
): WorkspaceJourneyJobRow {
  return {
    created_at: "2026-09-12T00:00:00Z",
    kind,
    last_error: null,
    payload: { commitSha: HEAD },
    status,
    ...overrides,
  };
}

function build(overrides: Partial<WorkspaceJourneyRows>) {
  return buildWorkspaceJourney("ws-1", "Personal workspace", {
    ...EMPTY,
    ...overrides,
  });
}

describe("buildWorkspaceJourney", () => {
  test("an empty workspace starts at the connect step", () => {
    const model = build({});
    expect(model.steps).toEqual({
      agent: "pending",
      connect: "active",
      graph: "pending",
    });
    expect(model.repoFullName).toBeNull();
    expect(model.installationRevoked).toBe(false);
    expect(model.scan.rescan).toBe("none");
  });

  test("a connected repository without nodes is waiting on its first scan", () => {
    const model = build({
      repositories: [GITHUB_REPO],
    });
    expect(model.steps).toEqual({
      agent: "pending",
      connect: "done",
      graph: "active",
    });
    expect(model.repoFullName).toBe("acme/app");
  });

  test("a scanned graph advances the thread to the agent step", () => {
    const model = build({
      edgeCount: 12,
      nodeCount: 42,
      repositories: [{ ...GITHUB_REPO, last_scanned_commit_sha: HEAD }],
    });
    expect(model.steps).toEqual({
      agent: "active",
      connect: "done",
      graph: "done",
    });
    expect(model.lastScannedCommitSha).toBe(HEAD);
  });

  test("an active token completes the journey; revoked tokens do not", () => {
    const rows = {
      nodeCount: 42,
      repositories: [GITHUB_REPO],
    };
    expect(
      build({ ...rows, tokens: [{ revoked_at: "2026-08-23T00:00:00Z" }] }).steps
        .agent,
    ).toBe("active");
    const done = build({
      ...rows,
      tokens: [{ revoked_at: "2026-08-23T00:00:00Z" }, { revoked_at: null }],
    });
    expect(done.steps.agent).toBe("done");
    expect(done.activeTokenCount).toBe(1);
  });

  test("a revoked installation warns without un-connecting the repository", () => {
    const model = build({
      installations: [{ revoked_at: "2026-08-23T00:00:00Z" }],
      nodeCount: 7,
      repositories: [GITHUB_REPO],
    });
    expect(model.installationRevoked).toBe(true);
    expect(model.steps.connect).toBe("done");
  });

  test("a local-ingest repository (no installation row) still connects", () => {
    const model = build({
      repositories: [LOCAL_REPO],
    });
    expect(model.steps.connect).toBe("done");
    expect(model.installationRevoked).toBe(false);
  });
});

/**
 * The first run, stage by stage (Phase 4 Wave C todo 16). Structure and
 * analysis are read separately on purpose (보완 R-02): the map opens on the
 * first, whether or not the second has caught up.
 */
describe("buildScanProgress", () => {
  test("a fresh connect with its pair queued shows both stages waiting", () => {
    const progress = buildScanProgress(GITHUB_REPO, [
      job("analyze", "queued"),
      job("scan", "queued"),
    ]);
    expect(progress).toMatchObject({
      analysis: "queued",
      commitSha: HEAD,
      repositoryId: "repo-1",
      rescan: "busy",
      structure: "queued",
      structureError: null,
    });
  });

  test("a connect whose backfill was not scheduled has nothing in flight and nothing to rescan", () => {
    const progress = buildScanProgress(GITHUB_REPO, []);
    expect(progress).toMatchObject({
      analysis: "idle",
      commitSha: null,
      rescan: "never-scanned",
      structure: "idle",
    });
  });

  test("structure-ready and analysis-pending are two states, not one", () => {
    // The scan landed; the analyze job is still in the queue.
    const progress = buildScanProgress(
      { ...GITHUB_REPO, last_scanned_commit_sha: HEAD },
      [job("analyze", "queued"), job("scan", "succeeded")],
    );
    expect(progress.structure).toBe("ready");
    expect(progress.analysis).toBe("queued");
    expect(progress.rescan).toBe("available");
  });

  test("the analysis is current once it caught up with the scan", () => {
    const progress = buildScanProgress(
      {
        ...GITHUB_REPO,
        last_analyzed_commit_sha: HEAD,
        last_scanned_commit_sha: HEAD,
      },
      [job("analyze", "succeeded"), job("scan", "succeeded")],
    );
    expect(progress).toMatchObject({
      analysis: "ready",
      rescan: "available",
      structure: "ready",
    });
  });

  test("a failed scan carries the queue's own words, and can be asked for again", () => {
    const progress = buildScanProgress(GITHUB_REPO, [
      job("analyze", "queued"),
      job("scan", "failed", {
        last_error: "GitHub repository request failed: 403",
      }),
    ]);
    expect(progress.structure).toBe("failed");
    expect(progress.structureError).toBe(
      "GitHub repository request failed: 403",
    );
    // Nothing to rescan against yet: the first scan never landed.
    expect(progress.rescan).toBe("never-scanned");

    const afterRescan = buildScanProgress(
      { ...GITHUB_REPO, last_scanned_commit_sha: HEAD },
      [
        job("scan", "failed", {
          last_error: "throttled",
          payload: { commitSha: NEXT },
        }),
      ],
    );
    expect(afterRescan.structure).toBe("failed");
    expect(afterRescan.commitSha).toBe(NEXT);
    expect(afterRescan.rescan).toBe("available");
  });

  test("the newest job of a kind decides, not the oldest", () => {
    const progress = buildScanProgress(
      { ...GITHUB_REPO, last_scanned_commit_sha: HEAD },
      [
        job("scan", "running", {
          created_at: "2026-09-12T01:00:00Z",
          payload: { commitSha: NEXT },
        }),
        job("scan", "succeeded"),
      ],
    );
    expect(progress).toMatchObject({
      commitSha: NEXT,
      rescan: "busy",
      structure: "running",
    });
  });

  test("a locally pushed repository is ready on structure and analysed on its own machine", () => {
    const progress = buildScanProgress(LOCAL_REPO, []);
    expect(progress).toMatchObject({
      analysis: "local",
      analysisError: null,
      commitSha: HEAD,
      rescan: "local",
      structure: "ready",
    });
  });

  test("a failed analysis says why while the structure stays ready", () => {
    const progress = buildScanProgress(
      { ...GITHUB_REPO, last_scanned_commit_sha: HEAD },
      [
        job("analyze", "failed", {
          last_error: "analyze ran before any artifact was stored",
        }),
        job("scan", "succeeded"),
      ],
    );
    expect(progress.structure).toBe("ready");
    expect(progress.analysis).toBe("failed");
    expect(progress.analysisError).toMatch(/before any artifact/);
  });
});
