import { describe, expect, it } from "vitest";

import {
  BRAIN_TABLE_COLUMNS,
  BRAIN_TABLE_ROWS,
  SAVED_QUERIES,
  SAVED_QUERY_IDS,
  queryWorkspaceBrain,
  savedQuery,
} from "../packages/mcp/src/index";
import { MCP_NODE_TYPES } from "../packages/mcp/src/store";
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

/**
 * The three facet filters (todo 21). They are the axes the map already
 * offers as chips, so an agent can ask the question a person clicks.
 */
describe("domain, unit and family filters", () => {
  const space = () =>
    workspace({
      artifacts: [
        artifact("apps/web/app/page.tsx"),
        artifact("apps/worker/src/queue.ts"),
        artifact("supabase/migrations/001_init.sql", { kind: "schema" }),
        artifact("docs/guide.md", { kind: "doc" }),
        artifact("tests/queue.test.ts"),
      ],
      edges: [
        edge("imports", "apps/worker/src/queue.ts", "apps/web/app/page.tsx"),
        {
          ...edge("references", "docs/guide.md", "apps/worker/src/queue.ts"),
          family: "doc",
        },
      ],
    });

  it("narrows by the area the map calls a domain", () => {
    expect(
      queryWorkspaceBrain(space(), { domains: ["frontend"] }).nodes.map(
        ({ path }) => path,
      ),
    ).toEqual(["apps/web/app/page.tsx"]);
    // A schema file is `database` wherever it lives — one deriver, so this
    // agrees with the chip on the graph rather than re-deciding.
    expect(
      queryWorkspaceBrain(space(), { domains: ["database"] }).nodes.map(
        ({ path }) => path,
      ),
    ).toEqual(["supabase/migrations/001_init.sql"]);
  });

  it("narrows by unit, which is the file's role and not its folder", () => {
    expect(
      queryWorkspaceBrain(space(), { units: ["test"] }).nodes.map(
        ({ path }) => path,
      ),
    ).toEqual(["tests/queue.test.ts"]);
    expect(
      queryWorkspaceBrain(space(), { units: ["doc"] }).nodes.map(
        ({ path }) => path,
      ),
    ).toEqual(["docs/guide.md"]);
  });

  it("narrows by the edge families a node actually touches", () => {
    expect(
      queryWorkspaceBrain(space(), { families: ["doc"] })
        .nodes.map(({ path }) => path)
        .sort(),
    ).toEqual(["apps/worker/src/queue.ts", "docs/guide.md"]);
  });

  it("answers none for a family with no edges, not everything", () => {
    // The same rule `get_neighbors` follows: an ignored filter would have
    // answered with the whole workspace, which is what makes a caller stop
    // trusting filters.
    expect(queryWorkspaceBrain(space(), { families: ["route"] }).nodes).toEqual(
      [],
    );
  });

  it("combines with the filters that were already there", () => {
    expect(
      queryWorkspaceBrain(space(), {
        domains: ["backend"],
        units: ["code"],
      }).nodes.map(({ path }) => path),
    ).toEqual(["apps/worker/src/queue.ts"]);
  });
});

/**
 * The four saved queries (todo 21). They are filters, not stored results —
 * running one is the same read as running it by hand, at the same zero cost.
 */
describe("saved queries", () => {
  const space = () =>
    workspace({
      artifacts: [
        artifact("src/tested.ts"),
        artifact("src/untested.ts"),
        artifact("src/documented.ts", {
          content: CURRENT.text,
          summaryState: CURRENT,
        }),
        artifact("tests/tested.test.ts"),
        artifact("docs/guide.md", { kind: "doc" }),
      ],
      edges: [
        edge("tests", "tests/tested.test.ts", "src/tested.ts"),
        {
          ...edge("references", "docs/guide.md", "src/tested.ts"),
          family: "doc",
        },
      ],
    });

  it("names four and only four, with stable ids", () => {
    expect(SAVED_QUERIES.map(({ id }) => id)).toEqual([...SAVED_QUERY_IDS]);
    expect(SAVED_QUERIES).toHaveLength(4);
    // Every one of them must say what its answer means; a saved query whose
    // title is the only explanation is a number without provenance.
    expect(
      SAVED_QUERIES.every(({ description }) => description.length > 30),
    ).toBe(true);
  });

  it("finds code no test points at", () => {
    expect(
      queryWorkspaceBrain(space(), savedQuery("untested-code").filter)
        .nodes.map(({ path }) => path)
        .sort(),
    ).toEqual(["src/documented.ts", "src/untested.ts"]);
  });

  it("finds code that neither a document nor a summary describes", () => {
    // `src/tested.ts` is referenced by the guide, `src/documented.ts` has a
    // current summary, and the test file is unit `test` rather than `code` —
    // so the query is narrower than "files with no prose anywhere".
    expect(
      queryWorkspaceBrain(space(), savedQuery("undocumented-code").filter)
        .nodes.map(({ path }) => path)
        .sort(),
    ).toEqual(["src/untested.ts"]);
  });

  it("caps the risk query at ten and says how many it dropped", () => {
    const many = workspace({
      artifacts: Array.from({ length: 14 }, (_unused, index) =>
        artifact(`src/file-${index}.ts`),
      ),
      edges: Array.from({ length: 14 }, (_unused, index) =>
        edge("imports", `src/file-${index}.ts`, "src/file-0.ts"),
      ),
    });
    const result = queryWorkspaceBrain(many, savedQuery("risk-top-10").filter);

    expect(result.nodes.length).toBeLessThanOrEqual(10);
    expect(result.droppedByLimit).toBeGreaterThan(0);
    expect(result.nodes.length + result.droppedByLimit).toBe(14);
  });

  it("marks the three negative queries as unreliable on a short read", () => {
    // 보완 R-01: "no `tests` edge" from a truncated edge read is unknown,
    // not none. The flag is how a screen knows to look at `coverage`.
    expect(
      SAVED_QUERIES.filter(({ negative }) => negative).map(({ id }) => id),
    ).toEqual([
      "untested-code",
      "undocumented-code",
      "unimplemented-requirements",
    ]);
    const short = workspace({
      artifacts: [artifact("src/a.ts")],
      truncated: [{ limit: 1, table: "edges" }],
    });

    expect(
      queryWorkspaceBrain(short, savedQuery("untested-code").filter).coverage,
    ).toMatchObject({ result: "partial" });
  });
});

/**
 * Reading todos (todo 21). Not a new tool: an agent that already knows how
 * to ask this graph a question should not have to learn a second way to ask
 * about work.
 */
describe("query_brain(types: ['todo'])", () => {
  const withTodos = (): McpWorkspaceData => ({
    ...workspace({ artifacts: [artifact("src/a.ts")] }),
    todos: [
      {
        createdAt: "2026-09-01T00:00:00Z",
        id: "todo:1",
        repositoryId: REPOSITORY,
        sourceEventId: "",
        sourceKey: "spec/plan.md#1",
        sourcePath: "spec/plan.md",
        status: "open",
        title: "Wire the CI evidence source",
        updatedAt: "2026-09-01T00:00:00Z",
        workspaceId: WORKSPACE,
      },
      {
        createdAt: "2026-09-02T00:00:00Z",
        id: "todo:2",
        // A checkbox nobody has tied to a repository. Carried, not dropped
        // and not given a repository it does not have.
        repositoryId: null,
        sourceEventId: "",
        sourceKey: "NOTES.md#4",
        sourcePath: "NOTES.md",
        status: "done",
        title: "Decide the pricing tiers",
        updatedAt: "2026-09-02T00:00:00Z",
        workspaceId: WORKSPACE,
      },
    ],
  });

  it("returns todos as nodes, with their status", () => {
    expect(
      queryWorkspaceBrain(withTodos(), { types: ["todo"] }).nodes.map(
        ({ id, label, status }) => [id, status, label],
      ),
      // Ordered by the same rule as every other node — type, then path —
      // so `NOTES.md` precedes `spec/plan.md` and a todo does not get a
      // sort of its own.
    ).toEqual([
      ["todo:2", "done", "Decide the pricing tiers"],
      ["todo:1", "open", "Wire the CI evidence source"],
    ]);
  });

  it("narrows by status, the way a board does", () => {
    expect(
      queryWorkspaceBrain(withTodos(), {
        statuses: ["open"],
        types: ["todo"],
      }).nodes.map(({ id }) => id),
    ).toEqual(["todo:1"]);
  });

  it("reaches them by the document the checkbox lives in", () => {
    expect(
      queryWorkspaceBrain(withTodos(), {
        pathGlob: "spec/*.md",
        types: ["todo"],
      }).nodes.map(({ id }) => id),
    ).toEqual(["todo:1"]);
  });

  it("leaves them out of every other query", () => {
    // A `todo` is not an artifact and must not quietly join a file listing.
    expect(
      queryWorkspaceBrain(withTodos(), { types: ["artifact"] }).nodes.map(
        ({ type }) => type,
      ),
    ).toEqual(["artifact"]);
  });

  it("is part of the vocabulary, not a special case beside it", () => {
    // The sync rule: one array, and every reader of it agrees.
    expect(MCP_NODE_TYPES).toContain("todo");
  });
});
