import { describe, expect, it } from "vitest";

import { impactOf } from "../packages/mcp/src/graph-tools";
import type {
  McpEdgeData,
  McpEdgeRelation,
  McpRepositoryData,
  McpWorkspaceData,
} from "../packages/mcp/src/store";

/**
 * Directional impact (Codex remedy P0-C / R-03, step S4).
 *
 * `impact_of` answered with an undirected depth-2 neighbourhood and called it
 * impact. With `A imports B` and `C imports B`, that made changing A reach C
 * — and C has never heard of A. What a change actually reaches is the set of
 * consumers found by walking `imports` and `calls` **backwards**, and nothing
 * else: a folder containing a file, a README naming it and a co-change are
 * all real edges and none of them means "editing this breaks that".
 *
 * The old answer is unchanged and still the default. This is the shape of the
 * one you get by asking for it (OQ-052).
 */

const WORKSPACE_ID = "01K200000000000000000000W1";
const USER_ID = "10000000-0000-4000-8000-000000000001";
const REPOSITORY_ID = "01K200000000000000000000R1";

function node(suffix: string): string {
  return `01K20000000000000000000${suffix}`;
}

const A = node("0A1");
const B = node("0B1");
const C = node("0C1");
const D = node("0D1");
const README = node("0E1");
const TEST = node("0F1");

function edge(input: {
  readonly relation: McpEdgeRelation;
  readonly source: string;
  readonly target: string;
}): McpEdgeData {
  return {
    confidence: 1,
    family: input.relation === "references" ? "doc" : "structure",
    id: `${input.source}-${input.relation}-${input.target}`,
    provenance: { method: null, reason: "fixture", span: null },
    relation: input.relation,
    sourceNodeId: input.source,
    targetNodeId: input.target,
    tier: "resolved",
  };
}

function artifact(id: string, path: string) {
  return {
    blobSha: "a".repeat(40),
    content: "",
    headings: [],
    id,
    kind: "code_metadata",
    path,
    status: "active",
    summary: path,
    symbols: [],
    tags: [],
    title: path,
  };
}

function workspaceOf(edges: readonly McpEdgeData[]): McpWorkspaceData {
  const repository: McpRepositoryData = {
    artifacts: [
      artifact(A, "src/a.ts"),
      artifact(B, "src/b.ts"),
      artifact(C, "src/c.ts"),
      artifact(D, "src/d.ts"),
      artifact(README, "README.md"),
      artifact(TEST, "tests/b.test.ts"),
    ],
    contextPacks: [],
    defaultBranch: "main",
    edges: [...edges],
    evidence: [],
    findings: [],
    fullName: "2klips/impact",
    id: REPOSITORY_ID,
    indexEntries: [],
    overview: "impact fixture",
    receipts: [],
    requirements: [],
  };
  return {
    id: WORKSPACE_ID,
    ownerUserId: USER_ID,
    repositories: [repository],
  };
}

function candidatesFor(
  workspace: McpWorkspaceData,
  nodeId: string,
): readonly string[] {
  const report = impactOf(workspace, nodeId, 2, "dependency-impact");
  return (report?.dependencyImpact?.candidates ?? []).map(
    ({ nodeId: id }) => id,
  );
}

/** `A imports B`, `C imports B` — the shape the remedy names first. */
const SHARED_LIBRARY = workspaceOf([
  edge({ relation: "imports", source: A, target: B }),
  edge({ relation: "imports", source: C, target: B }),
]);

describe("dependency impact", () => {
  it("does not reach a sibling consumer of a shared library", () => {
    // C imports B. So does A. Changing A tells C nothing.
    expect(candidatesFor(SHARED_LIBRARY, A)).toEqual([]);
  });

  it("reaches both consumers when the shared library itself changes", () => {
    expect(candidatesFor(SHARED_LIBRARY, B)).toEqual([A, C].sort());
  });

  it("follows a real chain transitively and records the path back", () => {
    // D imports C imports B: changing B reaches C at one hop and D at two.
    const chain = workspaceOf([
      edge({ relation: "imports", source: C, target: B }),
      edge({ relation: "imports", source: D, target: C }),
    ]);
    const report = impactOf(chain, B, 2, "dependency-impact");
    expect(report?.dependencyImpact?.candidates).toEqual([
      expect.objectContaining({ distance: 1, nodeId: C, path: "src/c.ts" }),
      expect.objectContaining({ distance: 2, nodeId: D, path: "src/d.ts" }),
    ]);
    // The path is the evidence: nearest edge first, back to the change.
    expect(
      report?.dependencyImpact?.candidates[1]?.via.map(
        ({ sourceNodeId, targetNodeId }) => `${sourceNodeId}->${targetNodeId}`,
      ),
    ).toEqual([`${D}->${C}`, `${C}->${B}`]);
    expect(report?.dependencyImpact?.complete).toBe(true);
  });

  it("will not travel through a document that names both files", () => {
    // The README references A and C. That connects them for discovery and
    // says nothing about one breaking the other.
    const viaReadme = workspaceOf([
      edge({ relation: "references", source: README, target: A }),
      edge({ relation: "references", source: README, target: C }),
    ]);
    expect(candidatesFor(viaReadme, A)).toEqual([]);

    // And the old mode still connects them, which is the point of keeping
    // both: proximity is a real question with a real answer.
    const related = impactOf(viaReadme, A, 2);
    expect(related?.transitiveNodeIds).toContain(C);
    expect(related?.dependencyImpact).toBeNull();
    expect(related?.mode).toBe("related-neighborhood");
  });

  it("terminates on a cycle instead of walking it forever", () => {
    const cycle = workspaceOf([
      edge({ relation: "imports", source: A, target: B }),
      edge({ relation: "imports", source: B, target: C }),
      edge({ relation: "imports", source: C, target: A }),
    ]);
    const report = impactOf(cycle, B, 2, "dependency-impact");
    // Every other node is reached exactly once, and B is not its own
    // consumer even though the cycle comes back to it.
    expect(
      (report?.dependencyImpact?.candidates ?? []).map(({ nodeId }) => nodeId),
    ).toEqual([A, C]);
    expect(report?.dependencyImpact?.complete).toBe(true);
  });

  it("collects a test as related and stops expanding there", () => {
    // The test imports B and is imported by nothing. `D imports TEST` would
    // be absurd, so the terminal rule is asserted by what the test *is*: a
    // consumer that appears in relatedTests and contributes no further hop.
    const tested = workspaceOf([
      edge({ relation: "imports", source: TEST, target: B }),
      edge({ relation: "tests", source: TEST, target: B }),
      edge({ relation: "imports", source: C, target: B }),
    ]);
    const report = impactOf(tested, B, 2, "dependency-impact");

    expect(report?.dependencyImpact?.relatedTests).toEqual([TEST]);
    expect(
      (report?.dependencyImpact?.candidates ?? []).map(({ nodeId }) => nodeId),
    ).toEqual([C, TEST].sort());
  });

  it("reaches nothing through an import that never resolved", () => {
    // An unresolved import produces no edge at all, upstream. Nothing here
    // invents one from proximity.
    expect(candidatesFor(workspaceOf([]), B)).toEqual([]);
  });

  it("says which relations the read could not carry", () => {
    const withOmission: McpWorkspaceData = {
      ...SHARED_LIBRARY,
      repositories: [
        {
          ...SHARED_LIBRARY.repositories[0]!,
          edgeOmissions: [
            {
              count: 875,
              reason: "the directory hierarchy is excluded",
              relation: "contains",
            },
          ],
        },
      ],
    };
    const report = impactOf(withOmission, B, 2, "dependency-impact");
    expect(report?.omissions).toEqual([
      {
        count: 875,
        reason: "the directory hierarchy is excluded",
        relation: "contains",
      },
    ]);
  });

  it("keeps the old answer byte for byte when the mode is not asked for", () => {
    const before = impactOf(SHARED_LIBRARY, B, 2);
    expect(before?.mode).toBe("related-neighborhood");
    expect(before?.dependencyImpact).toBeNull();
    expect(before?.semanticsVersion).toBe(2);
    // The legacy fields are unchanged in both modes: an existing caller gets
    // the same answer to the same call (REMEDY §7.3).
    const after = impactOf(SHARED_LIBRARY, B, 2, "dependency-impact");
    expect(after?.dependents).toEqual(before?.dependents);
    expect(after?.dependencies).toEqual(before?.dependencies);
    expect(after?.transitiveNodeIds).toEqual(before?.transitiveNodeIds);
  });
});
