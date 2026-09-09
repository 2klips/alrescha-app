import { describe, expect, it } from "vitest";

import { getWorkspaceArtifact, queryWorkspaceBrain } from "./data-brain";
import {
  collectNeighbors,
  getNodeContent,
  impactOf,
  searchWorkspaceNodes,
  tracePath,
} from "./graph-tools";
import type {
  McpEdgeData,
  McpEdgeFamily,
  McpEdgeRelation,
  McpEdgeTier,
  McpRepositoryData,
  McpWorkspaceData,
} from "./store";

/**
 * A stored edge as the decoder delivers it (Codex remedy P0-D): the relation
 * plus the family, tier, confidence and provenance that used to be dropped
 * between the database and the tool answer.
 */
function edge(input: {
  readonly family?: McpEdgeFamily;
  readonly id: string;
  readonly reason?: string;
  readonly relation: McpEdgeRelation;
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly tier?: McpEdgeTier;
}): McpEdgeData {
  return {
    confidence: 1,
    family: input.family ?? "evidence",
    id: input.id,
    provenance: {
      method: null,
      reason: input.reason ?? "fixture",
      span: null,
    },
    relation: input.relation,
    sourceNodeId: input.sourceNodeId,
    targetNodeId: input.targetNodeId,
    tier: input.tier ?? "resolved",
  };
}

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
      edge({
        id: "01K200000000000000000000E1",
        relation: "implements",
        sourceNodeId: REQ,
        targetNodeId: CODE,
      }),
      edge({
        id: "01K200000000000000000000E2",
        relation: "tests",
        sourceNodeId: TEST,
        targetNodeId: CODE,
      }),
    ],
    evidence: [],
    findings: [],
    fullName: "alrescha/drifted-demo",
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
    expect(
      collectNeighbors(workspace(), "01K2000000000000000000XX99", 1),
    ).toBeNull();
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
            edge({
              id: "01K200000000000000000000E9",
              relation: "supports",
              sourceNodeId: REQ,
              targetNodeId: TEST,
            }),
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
    expect(
      getNodeContent(workspace(), "01K2000000000000000000XX99"),
    ).toBeNull();
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

describe("impactOf affectedRoutes (Phase 4 Wave A′ todo 6)", () => {
  const ROUTE = "01K200000000000000000000E1";
  const LAYOUT = "01K200000000000000000000F1";

  function withRoutes(): McpWorkspaceData {
    const base = repository();
    return {
      id: WORKSPACE_ID,
      ownerUserId: USER_ID,
      repositories: [
        {
          ...base,
          artifacts: [
            ...base.artifacts,
            {
              content: "",
              headings: [],
              id: LAYOUT,
              kind: "code_metadata",
              path: "apps/web/app/layout.tsx",
              status: "active",
              summary: "",
              symbols: [],
              tags: [],
              title: "layout.tsx",
            },
          ],
          edges: [
            ...base.edges,
            edge({
              id: "01K200000000000000000000E2",
              relation: "handles",
              sourceNodeId: ROUTE,
              targetNodeId: CODE,
            }),
            edge({
              id: "01K200000000000000000000E3",
              relation: "handles",
              sourceNodeId: ROUTE,
              targetNodeId: LAYOUT,
            }),
          ],
          routes: [
            { methods: [], nodeId: ROUTE, tier: "resolved", url: "/auth" },
            {
              methods: ["GET"],
              nodeId: "01K200000000000000000000E4",
              tier: "reference",
              url: "/health",
            },
          ],
        },
      ],
    };
  }

  it("names the URLs a change reaches, and only those", () => {
    const impact = impactOf(withRoutes(), CODE, 2)!;

    // Editing the file that serves `/auth` affects `/auth`. `/health` is
    // served by something else and is not in the answer — "what does this
    // break" is a question about screens, and a wrong screen is worse than
    // no screen.
    expect(impact.affectedRoutes).toEqual([
      { methods: [], nodeId: ROUTE, tier: "resolved", url: "/auth" },
    ]);
  });

  it("answers for a route node itself", () => {
    const impact = impactOf(withRoutes(), ROUTE, 1)!;

    expect(impact.affectedRoutes.map(({ url }) => url)).toEqual(["/auth"]);
    // Its handlers are its dependencies: the page and every layout above it.
    expect(impact.dependencies.nodeIds).toEqual([CODE, LAYOUT].sort());
  });

  it("says nothing about routes on a workspace that has none", () => {
    const impact = impactOf(workspace(), CODE, 2)!;

    expect(impact.affectedRoutes).toEqual([]);
  });
});

/**
 * Codex remedy P0-D. A neighbourhood used to answer with four fields per
 * edge, so "these two nodes are connected" arrived with no way to ask how
 * anyone knows — and with no way to tell an absence from an exclusion.
 */
describe("neighbourhood provenance", () => {
  it("carries each edge's family, tier, confidence and reason", () => {
    const result = collectNeighbors(workspace(), CODE, 1);
    expect(result?.edges.length).toBeGreaterThan(0);
    for (const edge of result?.edges ?? []) {
      expect([edge.id, edge.family]).toEqual([edge.id, expect.any(String)]);
      expect([edge.id, edge.tier]).toEqual([edge.id, expect.any(String)]);
      expect([
        edge.id,
        edge.provenance.reason !== null || edge.provenance.span !== null,
      ]).toEqual([edge.id, true]);
    }
  });

  it("reports what the read left out, so an absence is not assumed", () => {
    const base = workspace();
    const withHierarchy: McpWorkspaceData = {
      ...base,
      repositories: [
        {
          ...base.repositories[0]!,
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

    expect(collectNeighbors(withHierarchy, CODE, 1)?.omissions).toEqual([
      {
        count: 875,
        reason: "the directory hierarchy is excluded",
        relation: "contains",
      },
    ]);
    // A workspace that omitted nothing says so with an empty list, which is
    // a different statement from "there is nothing else".
    expect(collectNeighbors(base, CODE, 1)?.omissions).toEqual([]);
  });

  it("labels a derived edge as derived and says what derived it", () => {
    const derived = collectNeighbors(workspace(), REQ, 1)?.edges.find(
      (edge) => edge.derived,
    );
    expect(derived?.provenance.reason).toBe(
      "the document this requirement was read from",
    );
    expect(derived?.tier).toBe("resolved");
  });
});

/**
 * Codex remedy §9.1 and P0-B. A path is not a name one repository owns, and
 * a negative answer is only as good as the edge read behind it.
 */
describe("targeted reads and what they can claim", () => {
  it("reports every repository that answers to a path instead of picking one", () => {
    const base = workspace();
    const first = base.repositories[0]!;
    const twoRepositories: McpWorkspaceData = {
      ...base,
      repositories: [
        first,
        {
          ...first,
          fullName: "2klips/other",
          id: "01K200000000000000000000R2",
        },
      ],
    };

    const result = getWorkspaceArtifact(twoRepositories, {
      path: "src/session.ts",
    });
    expect(result.artifact).toBeNull();
    expect(result.ambiguous?.path).toBe("src/session.ts");
    expect(
      result.ambiguous?.candidates.map(({ repositoryId }) => repositoryId),
    ).toEqual([first.id, "01K200000000000000000000R2"]);

    // An id cannot be ambiguous — ids are unique — so the same workspace
    // answers an id selector outright.
    expect(
      getWorkspaceArtifact(twoRepositories, { id: CODE }).artifact?.id,
    ).toBe(CODE);
  });

  it("answers from the targeted matches, not from the budgeted page", () => {
    const base = workspace();
    const emptied: McpWorkspaceData = {
      ...base,
      repositories: [{ ...base.repositories[0]!, artifacts: [] }],
    };
    const artifact = base.repositories[0]!.artifacts[0]!;

    // The workspace read carried no artifacts at all — the row budget ran
    // out before this one. The lookup still finds it.
    expect(
      getWorkspaceArtifact(emptied, { path: artifact.path }).artifact,
    ).toBeNull();
    expect(
      getWorkspaceArtifact(emptied, { path: artifact.path }, [
        {
          artifact,
          repositoryFullName: base.repositories[0]!.fullName,
          repositoryId: base.repositories[0]!.id,
        },
      ]).artifact?.id,
    ).toBe(artifact.id);
  });

  it("will not call an absence established when the edge read ran out", () => {
    const base = workspace();
    const complete = queryWorkspaceBrain(base, { withoutRelations: ["tests"] });
    expect(complete.coverage).toEqual({ result: "complete", unanswered: [] });

    const partial = queryWorkspaceBrain(
      {
        ...base,
        coverage: {
          readConsistency: "unproven",
          result: "partial",
          truncated: [{ limit: 2_000, table: "edges" }],
        },
      },
      { withoutRelations: ["tests"] },
    );
    expect(partial.nodes.length).toBeGreaterThan(0);
    expect(partial.coverage.result).toBe("partial");
    expect(partial.coverage.unanswered[0]?.filter).toBe("withoutRelations");
    expect(partial.coverage.unanswered[0]?.reason).toMatch(/row budget/);

    // A query that asks nothing about relations is unaffected by the same
    // truncation: coverage is about the question, not only the read.
    expect(
      queryWorkspaceBrain(
        {
          ...base,
          coverage: {
            readConsistency: "unproven",
            result: "partial",
            truncated: [{ limit: 2_000, table: "edges" }],
          },
        },
        { types: ["artifact"] },
      ).coverage.result,
    ).toBe("complete");
  });
});
