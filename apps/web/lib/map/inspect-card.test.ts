import { moduleMemberDigest } from "@alrescha/core";
import { describe, expect, it } from "vitest";

import {
  artifactInspectorCard,
  conceptInspectorCard,
  moduleCardForPath,
  type ModuleCardInputs,
} from "./inspect-card";

/**
 * The inspector's cards, as pure builders (Phase 4 Wave D todo 19 ⑴). The
 * route reads rows; these decide what the rows say, and each rule is one
 * that already exists — the shared artifact card, the module member digest
 * `explain_module` compares, a concept summary that is a model's prose.
 */

const A = { blobSha: "a".repeat(40), id: "n-a", path: "src/a.ts" };
const B = { blobSha: "b".repeat(40), id: "n-b", path: "src/b.ts" };
const LONE = { blobSha: "c".repeat(40), id: "n-c", path: "docs/lone.md" };

function inputs(
  summaries: ModuleCardInputs["summaries"] = [],
): ModuleCardInputs {
  return {
    artifacts: [A, B, LONE],
    edges: [
      { relation: "imports", sourceNodeId: "n-a", targetNodeId: "n-b" },
      // A doc reference is not structure: it must not pull the file in.
      { relation: "references", sourceNodeId: "n-c", targetNodeId: "n-a" },
    ],
    summaries,
  };
}

describe("moduleCardForPath", () => {
  it("is null for a file outside every import/call cluster — a fact, not a missing card", () => {
    expect(moduleCardForPath(inputs(), "docs/lone.md")).toBeNull();
  });

  it("is pending when the cluster has no cached prose", () => {
    expect(moduleCardForPath(inputs(), "src/a.ts")).toEqual({
      key: "module:src/a.ts",
      memberCount: 2,
      members: ["src/a.ts", "src/b.ts"],
      name: "src",
      state: "pending",
      summary: null,
    });
  });

  it("is ready when the cached digest matches the members as scanned now, stale when it does not", () => {
    const digest = moduleMemberDigest([
      { blobSha: A.blobSha, path: A.path },
      { blobSha: B.blobSha, path: B.path },
    ]);
    const cached = {
      memberDigest: digest,
      memberPaths: ["src/a.ts", "src/b.ts"],
      moduleKey: "module:src/a.ts",
      name: "src",
      summary: "Two files that share one job.",
    };
    expect(moduleCardForPath(inputs([cached]), "src/b.ts")).toMatchObject({
      state: "ready",
      summary: "Two files that share one job.",
    });
    expect(
      moduleCardForPath(
        inputs([{ ...cached, memberDigest: "0".repeat(32) }]),
        "src/b.ts",
      ),
    ).toMatchObject({
      state: "stale",
      // Stale prose is still shown; the state says what it is.
      summary: "Two files that share one job.",
    });
  });
});

describe("artifactInspectorCard", () => {
  it("is the shared card: exports sorted, no body, and the absence for a missing summary", () => {
    const card = artifactInspectorCard({
      exported_symbols: [{ name: "zeta" }, { name: "alpha" }],
      kind: "code_metadata",
      last_seen_commit_sha: "1".repeat(40),
      path: "src/a.ts",
      source_blob_sha: "a".repeat(40),
      summary: null,
      summary_blob_sha: null,
    });
    expect(card.path).toBe("src/a.ts");
    expect(card.exports).toEqual(["alpha", "zeta"]);
    expect(card.summary).toEqual({ state: "missing" });
  });

  it("serves a summary only when it was written for the blob the scan last saw", () => {
    const row = {
      exported_symbols: [],
      kind: "spec",
      last_seen_commit_sha: "1".repeat(40),
      path: "spec.md",
      source_blob_sha: "a".repeat(40),
      summary: "What the spec says.",
      summary_blob_sha: "a".repeat(40),
    };
    expect(artifactInspectorCard(row).summary).toMatchObject({
      grade: "inferred",
      state: "current",
      text: "What the spec says.",
    });
    expect(
      artifactInspectorCard({ ...row, summary_blob_sha: "b".repeat(40) })
        .summary.state,
    ).toBe("stale");
  });
});

describe("conceptInspectorCard", () => {
  it("carries the synthesis as written, members sorted and counted, an unknown kind read as concept", () => {
    expect(
      conceptInspectorCard({
        id: "c1",
        kind: "system",
        member_paths: ["src/b.ts", "src/a.ts"],
        name: "Job queue",
        slug: "job-queue",
        summary: "A queue.",
      }),
    ).toEqual({
      id: "c1",
      kind: "system",
      memberCount: 2,
      members: ["src/a.ts", "src/b.ts"],
      name: "Job queue",
      slug: "job-queue",
      summary: "A queue.",
    });
    expect(
      conceptInspectorCard({
        id: "c2",
        kind: "mystery",
        member_paths: null,
        name: "x",
        slug: "x",
        summary: "y",
      }),
    ).toMatchObject({ kind: "concept", memberCount: 0, members: [] });
  });
});
