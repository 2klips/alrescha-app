import { describe, expect, it } from "vitest";

import {
  BRAIN_TABLE_COLUMNS,
  BRAIN_TABLE_ROWS,
  queryWorkspaceBrain,
} from "../packages/mcp/src/index";
import type {
  McpArtifactData,
  McpEdgeData,
  McpWorkspaceData,
} from "../packages/mcp/src/store";

/**
 * `query_brain`'s new filters (Phase 4 Wave D todo 21).
 *
 * The tool could ask about types, statuses and relations. It could not ask
 * the two questions an agent actually opens with — *which files are risky*
 * and *which files nobody has described* — and it could not return anything
 * a person reads without paging through JSON.
 *
 * The 보완's rule holds throughout: a **negative** answer from an incomplete
 * read is `unknown`, not "none", and the reason says which read fell short.
 */

const WORKSPACE = "01KB00000000000000000000W1";
const REPOSITORY = "01KB00000000000000000000R1";

function artifact(
  path: string,
  overrides: Partial<McpArtifactData> = {},
): McpArtifactData {
  return {
    blobSha: "b".repeat(40),
    content: "",
    headings: [],
    id: `node:${path}`,
    kind: "code_metadata",
    path,
    status: "active",
    summary: path,
    summaryState: { state: "missing" },
    symbols: [],
    tags: [],
    title: path,
    ...overrides,
  };
}

function edge(
  relation: McpEdgeData["relation"],
  from: string,
  to: string,
): McpEdgeData {
  return {
    confidence: 1,
    family: "structure",
    id: `${relation}:${from}->${to}`,
    provenance: { method: null, reason: "fixture", span: null },
    relation,
    sourceNodeId: `node:${from}`,
    targetNodeId: `node:${to}`,
    tier: "resolved",
  };
}

function workspace(input: {
  artifacts: McpArtifactData[];
  edges?: McpEdgeData[];
  truncated?: { limit: number; table: string }[];
}): McpWorkspaceData {
  return {
    ...(input.truncated
      ? {
          coverage: {
            readConsistency: "single-statement" as const,
            result: "partial" as const,
            truncated: input.truncated,
          },
        }
      : {}),
    id: WORKSPACE,
    ownerUserId: "owner",
    repositories: [
      {
        artifacts: input.artifacts,
        contextPacks: [],
        defaultBranch: "main",
        edges: input.edges ?? [],
        evidence: [],
        findings: [],
        fullName: "owner/repo",
        id: REPOSITORY,
        indexEntries: [],
        overview: "owner/repo on main",
        receipts: [],
        requirements: [],
      },
    ],
  };
}

const CURRENT = {
  grade: "inferred" as const,
  sourceBlobSha: "b".repeat(40),
  state: "current" as const,
  text: "what this file does",
};

describe("query_brain filters", () => {
  it("finds files with and without a current description", () => {
    const space = workspace({
      artifacts: [
        artifact("src/described.ts", {
          content: CURRENT.text,
          summaryState: CURRENT,
        }),
        artifact("src/undescribed.ts"),
        artifact("src/stale.ts", {
          summaryState: {
            currentBlobSha: "b".repeat(40),
            sourceBlobSha: "c".repeat(40),
            state: "stale",
            text: "an older description",
          },
        }),
      ],
    });

    expect(
      queryWorkspaceBrain(space, { hasSummary: true }).nodes.map(
        ({ path }) => path,
      ),
    ).toEqual(["src/described.ts"]);
    // Stale prose is served to nobody, so it reads as no summary here — the
    // same rule every other surface applies (S1).
    expect(
      queryWorkspaceBrain(space, { hasSummary: false }).nodes.map(
        ({ path }) => path,
      ),
    ).toEqual(["src/stale.ts", "src/undescribed.ts"]);
  });

  it("matches a path glob segment-wise", () => {
    const space = workspace({
      artifacts: [
        artifact("src/a.ts"),
        artifact("src/deep/b.ts"),
        artifact("tests/a.test.ts"),
      ],
    });

    expect(
      queryWorkspaceBrain(space, { pathGlob: "src/*.ts" }).nodes.map(
        ({ path }) => path,
      ),
    ).toEqual(["src/a.ts"]);
    expect(
      queryWorkspaceBrain(space, { pathGlob: "src/**/*.ts" }).nodes.map(
        ({ path }) => path,
      ),
    ).toEqual(["src/a.ts", "src/deep/b.ts"]);
    expect(
      queryWorkspaceBrain(space, { pathGlob: "**/*.test.ts" }).nodes.map(
        ({ path }) => path,
      ),
    ).toEqual(["tests/a.test.ts"]);
  });

  it("treats a glob's punctuation as literal, not as a pattern", () => {
    const space = workspace({
      artifacts: [artifact("src/a.ts"), artifact("srcXa.ts")],
    });

    // The dot is a dot: a glob is not a regex the caller supplies (OQ-054).
    expect(
      queryWorkspaceBrain(space, { pathGlob: "src/a.ts" }).nodes.map(
        ({ path }) => path,
      ),
    ).toEqual(["src/a.ts"]);
  });

  it("ranks by risk when asked, and says which signal it could not see", () => {
    const space = workspace({
      artifacts: [
        artifact("src/hub.ts"),
        artifact("src/leaf.ts"),
        artifact("src/quiet.ts", {
          content: CURRENT.text,
          summaryState: CURRENT,
        }),
      ],
      edges: [
        edge("imports", "src/leaf.ts", "src/hub.ts"),
        edge("tests", "src/leaf.ts", "src/quiet.ts"),
      ],
    });

    const result = queryWorkspaceBrain(space, { sortBy: "risk" });
    // The hub carries fan-in and no test edge; the tested file carries
    // neither, so it sorts last.
    expect(result.nodes[0]?.path).toBe("src/hub.ts");
    expect(result.nodes.at(-1)?.path).toBe("src/quiet.ts");

    // The screen's map counts co-change and this read cannot, so the answer
    // says so rather than being quietly a different ranking.
    expect(result.coverage.result).toBe("partial");
    expect(
      result.coverage.unanswered.find(({ filter }) => filter === "sortBy")
        ?.reason,
    ).toMatch(/co-change/);
  });

  /**
   * 보완 R-01: an absence established from an incomplete read is not an
   * absence. This already held for relation filters; the risk sort must not
   * quietly claim otherwise either.
   */
  it("reports a negative relation query as unanswered when the read was cut", () => {
    const space = workspace({
      artifacts: [artifact("src/a.ts")],
      truncated: [{ limit: 2000, table: "edges" }],
    });

    const result = queryWorkspaceBrain(space, {
      withoutRelations: ["tests"],
    });
    expect(result.coverage.result).toBe("partial");
    expect(result.coverage.unanswered.map(({ filter }) => filter)).toContain(
      "withoutRelations",
    );
    // The filter still runs — the caller gets rows and a warning, not an
    // error and nothing.
    expect(result.nodes).toHaveLength(1);
  });

  it("says complete when nothing was cut", () => {
    const result = queryWorkspaceBrain(
      workspace({ artifacts: [artifact("src/a.ts")] }),
      { withoutRelations: ["tests"] },
    );

    expect(result.coverage).toEqual({ result: "complete", unanswered: [] });
  });
});

describe("query_brain tabular output", () => {
  it("renders six columns and no table unless asked", () => {
    const space = workspace({ artifacts: [artifact("src/a.ts")] });

    expect(queryWorkspaceBrain(space, {}).table).toBeUndefined();
    const table = queryWorkspaceBrain(space, { format: "table" }).table;
    expect(table?.columns).toEqual([...BRAIN_TABLE_COLUMNS]);
    expect(table?.columns).toHaveLength(6);
    expect(table?.rows[0]).toHaveLength(6);
    expect(table?.rows[0]?.[1]).toBe("src/a.ts");
    expect(table?.truncated).toBe(0);
  });

  it("caps the rows and says how many it left out", () => {
    const space = workspace({
      artifacts: Array.from({ length: BRAIN_TABLE_ROWS + 7 }, (_, at) =>
        artifact(`src/f${String(at).padStart(3, "0")}.ts`),
      ),
    });

    const table = queryWorkspaceBrain(space, { format: "table" }).table;
    expect(table?.rows).toHaveLength(BRAIN_TABLE_ROWS);
    // A table is for reading; the count is how a caller knows to narrow the
    // filter rather than assuming it saw everything.
    expect(table?.truncated).toBe(7);
    expect(queryWorkspaceBrain(space, { format: "table" }).nodes).toHaveLength(
      BRAIN_TABLE_ROWS + 7,
    );
  });

  it("keeps every cell on one line", () => {
    const space = workspace({
      artifacts: [
        artifact("src/a.ts", { title: `wrapped\n  label\twith  spaces` }),
      ],
    });

    const row = queryWorkspaceBrain(space, { format: "table" }).table?.rows[0];
    expect(row?.[2]).toBe("wrapped label with spaces");
    for (const cell of row ?? []) expect(cell).not.toMatch(/[\n\t]/);
  });

  it("carries the risk score in the table only when it ranked by it", () => {
    const space = workspace({
      artifacts: [artifact("src/a.ts")],
    });

    expect(
      queryWorkspaceBrain(space, { format: "table" }).table?.rows[0]?.[5],
    ).toBe("");
    expect(
      Number(
        queryWorkspaceBrain(space, { format: "table", sortBy: "risk" }).table
          ?.rows[0]?.[5],
      ),
    ).toBeGreaterThan(0);
  });
});
