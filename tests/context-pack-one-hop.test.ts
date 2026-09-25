import { describe, expect, it } from "vitest";

import { selectWorkspaceContextPack } from "../packages/mcp/src/index";
import type {
  McpEdgeData,
  McpEdgeRelation,
  McpWorkspaceData,
} from "../packages/mcp/src/index";

/**
 * The code cards a context pack carries are the code its chosen documents
 * point at — one hop, whatever order the edges were read in.
 *
 * The selection loop used to test membership in the set it was growing, so a
 * file one edge added could pull in its own neighbour a few edges later: how
 * far the pack reached depended on row order, not on the graph. Measured on
 * this repository, 33 of 36 packs saturated the 20-card cap with the same
 * first path for every task (tests/change-brief.test.ts). A requirement the
 * document states counts as part of the document, so code implementing it is
 * still one hop away.
 */

const DOC = "01K3CP0000000000000000D001";
const A = "01K3CP0000000000000000A001";
const B = "01K3CP0000000000000000B001";
const C = "01K3CP0000000000000000C001";
const R = "01K3CP0000000000000000R001";
const REQ = "01K3CP000000000000000RQ001";

function edge(
  id: string,
  sourceNodeId: string,
  targetNodeId: string,
  relation: McpEdgeRelation,
): McpEdgeData {
  return {
    confidence: null,
    family: null,
    id,
    provenance: { method: null, reason: "fixture", span: null },
    relation,
    sourceNodeId,
    targetNodeId,
    tier: null,
  };
}

const EDGES: readonly McpEdgeData[] = [
  edge("e1", DOC, A, "depends_on"), // the document points at a
  edge("e2", A, B, "imports"), // a's neighbour: two hops from the document
  edge("e3", B, C, "imports"), // three hops
  edge("e4", R, REQ, "implements"), // r implements what the document states
];

function workspace(edges: readonly McpEdgeData[]): McpWorkspaceData {
  const artifact = (id: string, path: string, kind: string) => ({
    content: kind === "spec" ? "The restore procedure and its checks." : "",
    headings: [],
    id,
    kind,
    path,
    status: "active",
    summary: "",
    symbols: [],
    tags: [],
    title: path,
  });
  return {
    id: "01K3CP000000000000000WS001",
    ownerUserId: "user-context-pack",
    repositories: [
      {
        artifacts: [
          artifact(DOC, "spec/restore.md", "spec"),
          artifact(A, "src/a.ts", "code_metadata"),
          artifact(B, "src/b.ts", "code_metadata"),
          artifact(C, "src/c.ts", "code_metadata"),
          artifact(R, "src/r.ts", "code_metadata"),
        ],
        contextPacks: [],
        defaultBranch: "main",
        edges: [...edges],
        evidence: [],
        findings: [],
        fullName: "fixture/context-pack",
        id: "01K3CP000000000000000RP001",
        indexEntries: [],
        overview: "",
        receipts: [],
        requirements: [
          {
            id: REQ,
            sourceArtifactId: DOC,
            statement: "A restore is checked before it is trusted.",
            status: "active",
          },
        ],
      },
    ],
  };
}

function cards(edges: readonly McpEdgeData[]) {
  const pack = selectWorkspaceContextPack(workspace(edges), {
    taskDescription: "restore procedure",
    tokenBudget: 4_000,
  });
  return {
    documents: pack.readingOrder.map(({ id }) => id),
    paths: pack.codeCards.map(({ path }) => path),
  };
}

describe("a context pack's code cards", () => {
  it("are one hop from the chosen documents, whatever the edge order", () => {
    const forward = cards(EDGES);
    const backward = cards([...EDGES].reverse());

    expect(forward.documents).toEqual([DOC]);
    expect(backward.documents).toEqual([DOC]);
    expect(forward.paths).toEqual(["src/a.ts", "src/r.ts"]);
    expect(backward.paths).toEqual(forward.paths);
  });
});
