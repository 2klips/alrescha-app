import { describe, expect, it } from "vitest";

import {
  collectNeighbors,
  getNodeContent,
  impactOf,
  searchWorkspaceNodes,
  tracePath,
} from "./graph-tools";
import type { McpRepositoryData, McpWorkspaceData } from "./store";

const WORKSPACE_ID = "01K200000000000000000000W1";
const USER_ID = "10000000-0000-4000-8000-000000000001";

const DOC = "01K200000000000000000000A1";
const REQ = "01K200000000000000000000B1";
const CODE = "01K200000000000000000000C1";
const TEST = "01K200000000000000000000D1";

function repository(): McpRepositoryData {
  return {
    artifacts: [
      {
        content: "요구사항 R-07을 정의하는 스펙 문서",
        headings: ["R-07"],
        id: DOC,
        kind: "spec",
        path: "spec/auth.md",
        status: "active",
        summary: "인증 스펙",
        symbols: [],
        tags: ["auth"],
        title: "인증 스펙",
      },
      {
        content: "세션 갱신 구현",
        headings: [],
        id: CODE,
        kind: "code_metadata",
        path: "src/session.ts",
        status: "active",
        summary: "세션 구현",
        symbols: ["renewSession"],
        tags: ["auth"],
        title: "renewSession",
      },
      {
        content: "세션 테스트",
        headings: [],
        id: TEST,
        kind: "code_metadata",
        path: "tests/session.test.ts",
        status: "active",
        summary: "세션 테스트",
        symbols: ["sessionSuite"],
        tags: ["auth", "test"],
        title: "sessionSuite",
      },
    ],
    contextPacks: [],
    defaultBranch: "main",
    edges: [
      {
        id: "01K200000000000000000000E1",
        relation: "implements",
        sourceNodeId: REQ,
        targetNodeId: CODE,
      },
      {
        id: "01K200000000000000000000E2",
        relation: "tests",
        sourceNodeId: TEST,
        targetNodeId: CODE,
      },
    ],
    evidence: [],
    findings: [],
    fullName: "arr/drifted-demo",
    id: "01K200000000000000000000R1",
    indexEntries: [
      {
        headings: ["R-07"],
        id: "01K200000000000000000000I1",
        neighborIds: [REQ],
        nodeId: DOC,
        path: "spec/auth.md",
        searchKey: "auth spec R-07",
        symbols: [],
        tags: ["auth"],
        title: "인증 스펙",
        type: "artifact",
      },
    ],
    overview: "demo",
    receipts: [],
    requirements: [
      {
        id: REQ,
        sourceArtifactId: DOC,
        statement: "세션은 15분마다 갱신되어야 한다.",
        status: "active",
      },
    ],
  };
}

function workspace(): McpWorkspaceData {
  return {
    id: WORKSPACE_ID,
    ownerUserId: USER_ID,
    repositories: [repository()],
  };
}

describe("collectNeighbors", () => {
  it("expands one hop over stored and derived edges", () => {
    const result = collectNeighbors(workspace(), REQ, 1);
    expect(result).not.toBeNull();
    expect(result!.nodes.map(({ id }) => id).sort()).toEqual(
      [DOC, REQ, CODE].sort(),
    );
    const derived = result!.edges.find((edge) => edge.derived);
    expect(derived).toMatchObject({
      relation: "references",
      sourceNodeId: DOC,
      targetNodeId: REQ,
    });
  });

  it("reaches the test artifact only at depth 2 from the doc", () => {
    const depth1 = collectNeighbors(workspace(), DOC, 1)!;
    expect(depth1.nodes.map(({ id }) => id)).not.toContain(CODE);
    const depth2 = collectNeighbors(workspace(), DOC, 2)!;
    expect(depth2.nodes.map(({ id }) => id)).toContain(CODE);
    expect(depth2.nodes.map(({ id }) => id)).not.toContain(TEST);
  });

  it("applies the relation filter", () => {
    const implementsOnly = collectNeighbors(workspace(), CODE, 1, [
      "implements",
    ])!;
    expect(implementsOnly.nodes.map(({ id }) => id).sort()).toEqual(
      [REQ, CODE].sort(),
    );
  });

  it("returns null for an unknown node", () => {
    expect(collectNeighbors(workspace(), "01K2000000000000000000XX99", 1)).toBeNull();
  });
});

describe("tracePath", () => {
  it("finds the golden 3-hop chain doc → requirement → code → test", () => {
    const path = tracePath(workspace(), DOC, TEST, 4);
    expect(path).not.toBeNull();
    expect(path!.hops).toBe(3);
    expect(path!.nodeIds).toEqual([DOC, REQ, CODE, TEST]);
    expect(path!.explain).toEqual([
      `${DOC} -references*-> ${REQ}`,
      `${REQ} -implements-> ${CODE}`,
      `${TEST} -tests-> ${CODE}`,
    ]);
  });

  it("respects the depth bound", () => {
    expect(tracePath(workspace(), DOC, TEST, 2)).toBeNull();
  });

  it("is deterministic across equal-length paths (lowest edge order wins)", () => {
    const base = workspace();
    const diamond: McpWorkspaceData = {
      ...base,
      repositories: [
        {
          ...base.repositories[0]!,
          edges: [
            ...base.repositories[0]!.edges,
            // A second, id-later route REQ -supports-> TEST making REQ→TEST
            // reachable in 1 hop two ways at depth 2 from DOC.
            {
              id: "01K200000000000000000000E9",
              relation: "supports",
              sourceNodeId: REQ,
              targetNodeId: TEST,
            },
          ],
        },
      ],
    };
    const first = tracePath(diamond, DOC, TEST, 4);
    const second = tracePath(diamond, DOC, TEST, 4);
    expect(first).toEqual(second);
    expect(first!.hops).toBe(2);
    expect(first!.nodeIds).toEqual([DOC, REQ, TEST]);
  });

  it("returns a zero-hop path for identical endpoints", () => {
    expect(tracePath(workspace(), REQ, REQ, 4)).toEqual({
      edges: [],
      explain: [],
      hops: 0,
      nodeIds: [REQ],
    });
  });
});

describe("impactOf", () => {
  it("splits direct dependents, dependencies, and the transitive closure", () => {
    const impact = impactOf(workspace(), CODE, 2)!;
    expect(impact.dependents.nodeIds).toEqual([REQ, TEST].sort());
    expect(impact.dependencies.nodeIds).toEqual([]);
    // Depth-2 from CODE reaches DOC through REQ — transitive, not direct.
    expect(impact.transitiveNodeIds).toEqual([DOC]);
  });

  it("returns null for an unknown node", () => {
    expect(impactOf(workspace(), "01K2000000000000000000XX99", 2)).toBeNull();
  });
});

describe("getNodeContent", () => {
  it("serves the stored statement for a requirement", () => {
    expect(getNodeContent(workspace(), REQ)).toEqual({
      content: "세션은 15분마다 갱신되어야 한다.",
      id: REQ,
      kind: "requirement",
      path: "spec/auth.md",
      repositoryId: "01K200000000000000000000R1",
      type: "requirement",
    });
  });

  it("returns null for an unknown node", () => {
    expect(getNodeContent(workspace(), "01K2000000000000000000XX99")).toBeNull();
  });
});

describe("searchWorkspaceNodes", () => {
  it("keeps the index ranking but strips every body-shaped field", () => {
    const results = searchWorkspaceNodes(workspace(), "auth spec");
    expect(results.length).toBeGreaterThan(0);
    for (const result of results) {
      expect(Object.keys(result).sort()).toEqual([
        "neighborIds",
        "nodeId",
        "path",
        "rank",
        "repositoryId",
        "score",
        "type",
      ]);
    }
    const serialized = JSON.stringify(results);
    expect(serialized).not.toContain("excerpt");
    expect(serialized).not.toContain("스펙 문서");
  });
});
