import { describe, expect, it } from "vitest";

import {
  SYMBOL_LAYER_LIMITS,
  selectSymbolNeighborhood,
  withSymbolNeighborhood,
  type McpEdgeData,
  type McpSymbolData,
  type McpWorkspaceData,
} from "./index";

/**
 * The neighbourhood rule (Phase 4 Wave F todo 26), on its own: what a set
 * of ids reaches in a pool, where it stops, and what it says when it had to
 * stop. Both stores hand this function their pool, so this is the one place
 * the rule is stated.
 */

const REPOSITORY = "repo";

function symbol(
  nodeId: string,
  file: string,
  name: string,
  line: number,
): McpSymbolData {
  return {
    artifactNodeId: file,
    container: null,
    endLine: line + 5,
    engine: "typescript-ast",
    kind: "class",
    name,
    nodeId,
    path: `${file}.ts`,
    repositoryId: REPOSITORY,
    stableKey: `key-${nodeId}`,
    startLine: line,
  };
}

function declares(file: string, target: string): McpEdgeData {
  return {
    confidence: 1,
    family: "hierarchy",
    id: `declares:${file}->${target}`,
    provenance: { method: "typescript-ast", reason: null, span: null },
    relation: "declares",
    sourceNodeId: file,
    targetNodeId: target,
    tier: "resolved",
  };
}

function extendsEdge(source: string, target: string): McpEdgeData {
  return {
    confidence: 1,
    family: "structure",
    id: `extends:${source}->${target}`,
    provenance: { method: "import-binding", reason: null, span: null },
    relation: "extends",
    sourceNodeId: source,
    targetNodeId: target,
    tier: "resolved",
  };
}

/** Three files; `b1 extends a1`, `c1 extends b1`. */
const POOL = {
  artifactIds: new Set(["fa", "fb", "fc"]),
  edges: [
    declares("fa", "a1"),
    declares("fa", "a2"),
    declares("fb", "b1"),
    declares("fc", "c1"),
    extendsEdge("b1", "a1"),
    extendsEdge("c1", "b1"),
  ],
  symbols: [
    symbol("a1", "fa", "A1", 1),
    symbol("a2", "fa", "A2", 10),
    symbol("b1", "fb", "B1", 1),
    symbol("c1", "fc", "C1", 1),
  ],
};

describe("selecting a symbol neighbourhood", () => {
  it("reaches a file's symbols, their declarations and one extends hop", () => {
    const result = selectSymbolNeighborhood(POOL, ["fb"]);
    // b1 and what it touches: its base a1 and its subclass c1 — not a2,
    // which shares a file with a1 but is two hops from anything named.
    expect(result.symbols.map(({ nodeId }) => nodeId)).toEqual([
      "a1",
      "b1",
      "c1",
    ]);
    expect(result.edges.map(({ id }) => id).sort()).toEqual(
      [
        "declares:fa->a1",
        "declares:fb->b1",
        "declares:fc->c1",
        "extends:b1->a1",
        "extends:c1->b1",
      ].sort(),
    );
    expect(result.truncated).toEqual([]);
    expect(result.unknownNodeIds).toEqual([]);
  });

  it("reaches a symbol's file and hop when the symbol itself is named", () => {
    const result = selectSymbolNeighborhood(POOL, ["a1"]);
    expect(result.symbols.map(({ nodeId }) => nodeId)).toEqual(["a1", "b1"]);
    expect(result.edges.map(({ id }) => id).sort()).toEqual([
      "declares:fa->a1",
      "declares:fb->b1",
      "extends:b1->a1",
    ]);
  });

  it("says which ids named nothing rather than answering empty for them", () => {
    const result = selectSymbolNeighborhood(POOL, ["zz", "fa", "yy"]);
    expect(result.unknownNodeIds).toEqual(["yy", "zz"]);
    expect(result.symbols.map(({ nodeId }) => nodeId)).toEqual([
      "a1",
      "a2",
      "b1",
    ]);
  });

  it("stops at the stated caps and says so", () => {
    const files = Array.from(
      { length: SYMBOL_LAYER_LIMITS.files + 1 },
      (_, index) => `f${index}`,
    );
    const many = selectSymbolNeighborhood(
      { artifactIds: new Set(files), edges: [], symbols: [] },
      files,
    );
    expect(many.truncated).toEqual([
      { limit: SYMBOL_LAYER_LIMITS.files, table: "files" },
    ]);

    const crowded = Array.from(
      { length: SYMBOL_LAYER_LIMITS.symbols + 1 },
      (_, index) => symbol(`s${index}`, "big", `S${index}`, index + 1),
    );
    const capped = selectSymbolNeighborhood(
      {
        artifactIds: new Set(["big"]),
        edges: crowded.map(({ nodeId }) => declares("big", nodeId)),
        symbols: crowded,
      },
      ["big"],
    );
    expect(capped.symbols).toHaveLength(SYMBOL_LAYER_LIMITS.symbols);
    expect(capped.edges).toHaveLength(SYMBOL_LAYER_LIMITS.symbols);
    expect(capped.truncated).toEqual([
      { limit: SYMBOL_LAYER_LIMITS.symbols, table: "symbols" },
    ]);
  });
});

describe("merging a neighbourhood into a workspace", () => {
  const workspace: McpWorkspaceData = {
    id: "ws",
    ownerUserId: "owner",
    repositories: [
      {
        artifacts: [],
        contextPacks: [],
        defaultBranch: "main",
        edges: [],
        evidence: [],
        findings: [],
        fullName: "x/y",
        id: REPOSITORY,
        indexEntries: [],
        overview: "",
        receipts: [],
        requirements: [],
      },
      {
        artifacts: [],
        contextPacks: [],
        defaultBranch: "main",
        edges: [],
        evidence: [],
        findings: [],
        fullName: "x/z",
        id: "other",
        indexEntries: [],
        overview: "",
        receipts: [],
        requirements: [],
      },
    ],
  };

  it("lands on the repository the symbols belong to, once", () => {
    const neighbourhood = selectSymbolNeighborhood(POOL, ["fb"]);
    const merged = withSymbolNeighborhood(
      withSymbolNeighborhood(workspace, neighbourhood),
      neighbourhood,
    );
    const [mine, other] = merged.repositories;
    expect(mine?.symbols?.map(({ nodeId }) => nodeId)).toEqual([
      "a1",
      "b1",
      "c1",
    ]);
    expect(mine?.symbolEdges).toHaveLength(5);
    expect(other?.symbols).toBeUndefined();
    // Nothing else moved.
    expect(merged.id).toBe("ws");
  });

  it("leaves a workspace untouched when nothing was found", () => {
    const empty = selectSymbolNeighborhood(POOL, ["nope"]);
    expect(withSymbolNeighborhood(workspace, empty)).toBe(workspace);
  });
});
