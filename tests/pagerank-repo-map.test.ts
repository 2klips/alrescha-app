import { describe, expect, it } from "vitest";

import { personalizedPageRank } from "../packages/core/src/index";
import {
  buildGraphSchema,
  buildRepoMap,
  searchWorkspaceIndex,
} from "../packages/mcp/src/index";
import type {
  McpArtifactData,
  McpIndexEntryData,
  McpWorkspaceData,
} from "../packages/mcp/src/store";

/**
 * Phase 3 Wave B todo 5 — personalized PageRank, the repo map, the schema
 * card, and the in-tier connectivity rerank. All deterministic, no LLM.
 */

describe("personalized pagerank", () => {
  const nodes = ["hub", "a", "b", "leaf", "island"];
  const edges = [
    { source: "hub", target: "a" },
    { source: "hub", target: "b" },
    { source: "hub", target: "leaf" },
    { source: "a", target: "b" },
  ];

  it("uniform walk surfaces the hub; results are max-normalized", () => {
    const rank = personalizedPageRank({ edges, nodes });
    expect(rank.get("hub")).toBe(1);
    expect(rank.get("a")).toBeLessThan(1);
    expect(rank.get("island")).toBeLessThan(rank.get("leaf") ?? 0);
  });

  it("seeds bias the walk toward the seed's neighborhood", () => {
    const uniform = personalizedPageRank({ edges, nodes });
    const seeded = personalizedPageRank({ edges, nodes, seeds: ["a"] });
    expect(seeded.get("a")).toBe(1);
    // b sits next to the seed; leaf is only reachable through the hub.
    expect(seeded.get("b") ?? 0).toBeGreaterThan(seeded.get("leaf") ?? 0);
    expect(seeded.get("a") ?? 0).toBeGreaterThan(uniform.get("a") ?? 0);
  });

  it("is deterministic and safe on empty and dangling graphs", () => {
    expect(personalizedPageRank({ edges: [], nodes: [] }).size).toBe(0);
    const dangling = personalizedPageRank({
      edges: [],
      nodes: ["x", "y"],
    });
    expect(dangling.get("x")).toBe(dangling.get("y"));
    const first = personalizedPageRank({ edges, nodes, seeds: ["hub"] });
    const second = personalizedPageRank({ edges, nodes, seeds: ["hub"] });
    expect([...first.entries()]).toEqual([...second.entries()]);
  });
});

function artifact(
  id: string,
  path: string,
  symbols: readonly string[],
): McpArtifactData {
  return {
    content: `stored summary of ${path}`,
    headings: [],
    id,
    kind: "code_metadata",
    path,
    status: "active",
    summary: "",
    symbols: [...symbols],
    tags: [],
    title: path,
  };
}

function indexEntry(
  nodeId: string,
  path: string,
  neighborIds: readonly string[] = [],
): McpIndexEntryData {
  return {
    headings: [],
    id: `entry-${nodeId}`,
    neighborIds: [...neighborIds],
    nodeId,
    path,
    searchKey: path,
    symbols: [],
    tags: [],
    title: path,
    type: "artifact",
  };
}

function workspace(): McpWorkspaceData {
  return {
    id: "ws",
    ownerUserId: "user",
    repositories: [
      {
        artifacts: [
          artifact("hub", "src/core.ts", ["run", "parse", "emit"]),
          artifact("a", "src/a.ts", ["alpha"]),
          artifact("b", "src/b.ts", ["beta"]),
          artifact("lonely", "docs/lonely.md", []),
        ],
        contextPacks: [],
        defaultBranch: "main",
        edges: [
          {
            id: "e1",
            relation: "imports",
            sourceNodeId: "a",
            targetNodeId: "hub",
          },
          {
            id: "e2",
            relation: "imports",
            sourceNodeId: "b",
            targetNodeId: "hub",
          },
          {
            id: "e3",
            relation: "calls",
            sourceNodeId: "a",
            targetNodeId: "b",
          },
          {
            id: "e4",
            relation: "references",
            sourceNodeId: "lonely",
            targetNodeId: "hub",
          },
        ],
        evidence: [],
        findings: [],
        fullName: "2klips/map-fixture",
        id: "repo",
        indexEntries: [
          indexEntry("a", "src/a.ts", ["b", "lonely"]),
          indexEntry("b", "src/b.ts"),
          indexEntry("lonely", "docs/lonely.md"),
        ],
        overview: "",
        receipts: [],
        requirements: [],
      },
    ],
  };
}

describe("repo map (Wave B todo 5)", () => {
  it("ranks the hub first without focus and lists exported symbols", () => {
    const map = buildRepoMap(workspace(), {});
    expect(map.entries[0]?.path).toBe("src/core.ts");
    expect(map.entries[0]?.line).toContain("run, parse, emit");
    expect(map.omittedCount).toBe(0);
    expect(map.tokenEstimate).toBeLessThanOrEqual(map.tokenBudget);
  });

  it("focus seeds pull the focused neighborhood up", () => {
    const map = buildRepoMap(workspace(), { focus: ["alpha"] });
    expect(map.focusMatched).toEqual(["a"]);
    expect(map.entries[0]?.path).toBe("src/a.ts");
  });

  it("packs greedily into the budget and reports what was cut", () => {
    const wide = workspace();
    const repository = wide.repositories[0]!;
    for (let index = 0; index < 60; index += 1) {
      repository.artifacts.push(
        artifact(
          `filler-${index}`,
          `packages/deeply/nested/module-${index}/service-implementation.ts`,
          ["handleRequest", "buildResponse", "validateInput"],
        ),
      );
    }
    const map = buildRepoMap(wide, { tokenBudget: 100 });
    expect(map.entries.length).toBeLessThan(repository.artifacts.length);
    expect(map.omittedCount).toBeGreaterThan(0);
    expect(map.text).toContain("more files over the");
    expect(map.tokenEstimate).toBeLessThanOrEqual(150);
  });
});

describe("graph schema card (Wave B todo 5)", () => {
  it("counts node kinds and edge relations, and teaches the id-first flow", () => {
    const schema = buildGraphSchema(workspace());
    expect(schema.nodeCounts).toEqual({ artifact: 4 });
    expect(schema.relationCounts).toEqual({
      calls: 1,
      imports: 2,
      references: 1,
    });
    expect(schema.text).toContain("2klips/map-fixture (4 files)");
    expect(schema.text).toContain("search_nodes");
  });
});

describe("connectivity rerank (Wave B todo 5)", () => {
  it("reorders inside a tier without overturning a lexical winner", () => {
    const results = searchWorkspaceIndex(workspace(), { query: "src/a.ts" });
    const paths = results.map(({ path }) => path);

    // The exact lexical hit stays on top whatever the graph says.
    expect(paths[0]).toBe("src/a.ts");
    // b and lonely are both graph-neighbor tier; b is edge-connected to the
    // seed and rises above the unconnected lonely.
    expect(paths.indexOf("src/b.ts")).toBeLessThan(
      paths.indexOf("docs/lonely.md"),
    );

    const byPath = new Map(results.map((result) => [result.path, result]));
    expect(byPath.get("src/b.ts")?.rank).toBe("graph-neighbor");
    expect(byPath.get("docs/lonely.md")?.rank).toBe("graph-neighbor");
    // Bonus stays under the tier gap: no graph-neighbor outranks a direct hit.
    expect(byPath.get("src/b.ts")?.score ?? 0).toBeLessThan(
      byPath.get("src/a.ts")?.score ?? 0,
    );
  });
});
