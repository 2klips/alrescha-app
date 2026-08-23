import { describe, expect, test } from "vitest";

import { buildWorkspaceJourney, type WorkspaceJourneyRows } from "./journey";

const EMPTY: WorkspaceJourneyRows = {
  agentAssertionCount: 0,
  edgeCount: 0,
  installations: [],
  nodeCount: 0,
  repositories: [],
  tokens: [],
};

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
  });

  test("a connected repository without nodes is waiting on its first scan", () => {
    const model = build({
      repositories: [{ full_name: "acme/app", last_scanned_commit_sha: null }],
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
      repositories: [
        { full_name: "acme/app", last_scanned_commit_sha: "a".repeat(40) },
      ],
    });
    expect(model.steps).toEqual({
      agent: "active",
      connect: "done",
      graph: "done",
    });
    expect(model.lastScannedCommitSha).toBe("a".repeat(40));
  });

  test("an active token completes the journey; revoked tokens do not", () => {
    const rows = {
      nodeCount: 42,
      repositories: [{ full_name: "acme/app", last_scanned_commit_sha: null }],
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
      repositories: [{ full_name: "acme/app", last_scanned_commit_sha: null }],
    });
    expect(model.installationRevoked).toBe(true);
    expect(model.steps.connect).toBe("done");
  });

  test("a local-ingest repository (no installation row) still connects", () => {
    const model = build({
      repositories: [
        { full_name: "local/notes", last_scanned_commit_sha: null },
      ],
    });
    expect(model.steps.connect).toBe("done");
    expect(model.installationRevoked).toBe(false);
  });
});
