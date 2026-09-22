import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  InMemoryMcpStore,
  SEARCH_INDEX_DEFAULT_LIMIT,
  createHostedMcpEndpoint,
  searchWorkspaceIndex,
  searchWorkspaceIndexPage,
} from "../packages/mcp/src/index";
import type {
  McpArtifactData,
  McpEdgeData,
  McpIndexEntryData,
  McpRepositoryData,
  McpSymbolData,
  McpWorkspaceData,
} from "../packages/mcp/src/index";

/**
 * RE-02 — what `search_index` is allowed to leave out, and what it has to
 * admit (research 2026-09-21 → execution plan RE-02).
 *
 * Four separate defects shared one cause: the cap ran before the filters.
 *
 * ⑴ `searchWorkspaceIndex` cut the ranking to 20 and `hosted.ts` applied
 *    `domain_filter` to what survived, so a workspace with 20 frontend and 5
 *    backend matches answered "no backend file matches auth" — a false
 *    negative that reads exactly like a true one.
 * ⑵ A query with no searchable term (`!!!`) tokenised to nothing, and an
 *    empty conjunction is true of everything, so punctuation returned the
 *    first 20 files in the workspace as if they were hits.
 * ⑶ The tool schema accepts `limit` 1–100 and could never return more than
 *    20 of them.
 * ⑷ `truncated` counted against the already-capped list, so the answer that
 *    dropped five backend files reported that it had dropped none.
 *
 * The fixtures below are the research probe's synthetic case
 * (`docs/reports/research-2026-09-21.probe.mjs`) carried onto both surfaces:
 * the ranking function, and the hosted tool as an MCP SDK client reaches it.
 */

const WORKSPACE_ID = "01K287J3D18V7A1MZG9E8D1Z01";
const OTHER_WORKSPACE_ID = "01K287J3D18V7A1MZG9E8D1Z02";
const USER_ID = "user-owner";
const OTHER_USER_ID = "user-neighbour";
const REPOSITORY_ID = "01K287J3D18V7A1MZG9E8D1Z10";
const SECOND_REPOSITORY_ID = "01K287J3D18V7A1MZG9E8D1Z20";

function artifact(input: {
  readonly content?: string;
  readonly id: string;
  readonly path: string;
  readonly symbols?: readonly string[];
  readonly title: string;
}): McpArtifactData {
  return {
    content: input.content ?? `body of ${input.path}`,
    headings: [],
    id: input.id,
    kind: "code_metadata",
    path: input.path,
    status: "active",
    summary: "",
    symbols: [...(input.symbols ?? [])],
    tags: [],
    title: input.title,
  };
}

function indexEntry(input: {
  readonly id: string;
  readonly nodeId: string;
  readonly path: string;
  readonly symbols?: readonly string[];
  readonly title: string;
}): McpIndexEntryData {
  return {
    headings: [],
    id: input.id,
    neighborIds: [],
    nodeId: input.nodeId,
    path: input.path,
    searchKey: `${input.path} ${input.title}`,
    symbols: [...(input.symbols ?? [])],
    tags: [],
    title: input.title,
    type: "artifact",
  };
}

function repository(
  id: string,
  files: readonly { path: string; title: string }[],
  prefix: string,
): McpRepositoryData {
  return {
    artifacts: files.map(({ path, title }, index) =>
      artifact({ id: `${prefix}n${index}`, path, title }),
    ),
    contextPacks: [],
    defaultBranch: "main",
    edges: [],
    evidence: [],
    findings: [],
    fullName: `fixture/${id}`,
    id,
    indexEntries: files.map(({ path, title }, index) =>
      indexEntry({
        id: `${prefix}i${index}`,
        nodeId: `${prefix}n${index}`,
        path,
        title,
      }),
    ),
    overview: "fixture",
    receipts: [],
    requirements: [],
  };
}

/** The probe's case: 20 frontend files and 5 backend files, all titled `auth`. */
const AUTH_FILES: readonly { path: string; title: string }[] = [
  ...Array.from({ length: 20 }, (_, i) => ({
    path: `apps/web/auth-${String(i).padStart(2, "0")}.ts`,
    title: "auth",
  })),
  ...Array.from({ length: 5 }, (_, i) => ({
    path: `packages/core/auth-${i}.ts`,
    title: "auth",
  })),
];

function authWorkspace(): McpWorkspaceData {
  return {
    id: WORKSPACE_ID,
    ownerUserId: USER_ID,
    repositories: [repository(REPOSITORY_ID, AUTH_FILES, "a")],
  };
}

/** `count` frontend files that all match `widget`, for the boundary cases. */
function sizedWorkspace(count: number): McpWorkspaceData {
  return {
    id: WORKSPACE_ID,
    ownerUserId: USER_ID,
    repositories: [
      repository(
        REPOSITORY_ID,
        Array.from({ length: count }, (_, i) => ({
          path: `apps/web/widget-${String(i).padStart(3, "0")}.ts`,
          title: "widget",
        })),
        "w",
      ),
    ],
  };
}

describe("the ranking function's page", () => {
  it("applies the domain before the cap, not after it", () => {
    const page = searchWorkspaceIndexPage(authWorkspace(), {
      domain: "backend",
      query: "auth",
    });
    // The defect: these five ranked 21st–25th and the cap ate them before
    // anything asked what domain they were in.
    expect(page.results).toHaveLength(5);
    expect(
      page.results.every((hit) => hit.path.startsWith("packages/")),
    ).toBe(true);
    expect(page.eligible).toBe(5);
    expect(page.omitted).toBe(0);
  });

  it("returns nothing for a query with no searchable term", () => {
    for (const query of ["!!!", "...", "?? ??", "—"]) {
      const page = searchWorkspaceIndexPage(authWorkspace(), { query });
      expect(page.results, query).toEqual([]);
      expect(page.eligible, query).toBe(0);
      expect(page.omitted, query).toBe(0);
    }
  });

  it("returns nothing for a query that matches nothing", () => {
    const page = searchWorkspaceIndexPage(authWorkspace(), {
      query: "kubernetes",
    });
    expect(page.results).toEqual([]);
    expect(page.eligible).toBe(0);
    expect(page.omitted).toBe(0);
  });

  it("keeps the array-returning signature its callers already use", () => {
    // `graph-tools`, the benchmarks and four test files call this and index
    // the array. The default page is what they got before this change.
    const results = searchWorkspaceIndex(authWorkspace(), { query: "auth" });
    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(SEARCH_INDEX_DEFAULT_LIMIT);
    expect(results).toEqual(
      searchWorkspaceIndexPage(authWorkspace(), { query: "auth" }).results,
    );
  });

  it("counts the omission against what this read reached", () => {
    for (const [eligible, limit, returned] of [
      [19, undefined, 19],
      [20, undefined, 20],
      [21, undefined, 20],
      [100, undefined, 20],
      [19, 1, 1],
      [20, 1, 1],
      [21, 20, 20],
      [100, 20, 20],
      [19, 100, 19],
      [21, 100, 21],
      [100, 100, 100],
    ] as const) {
      const page = searchWorkspaceIndexPage(sizedWorkspace(eligible), {
        query: "widget",
        ...(limit === undefined ? {} : { limit }),
      });
      const label = `${eligible} eligible, limit ${String(limit)}`;
      expect(page.eligible, label).toBe(eligible);
      expect(page.results.length, label).toBe(returned);
      expect(page.omitted, label).toBe(eligible - returned);
    }
  });

  it("orders a smaller page as the prefix of a larger one", () => {
    const whole = searchWorkspaceIndexPage(sizedWorkspace(100), {
      limit: 100,
      query: "widget",
    }).results.map((hit) => hit.id);
    for (const limit of [1, 7, 20, 99]) {
      const page = searchWorkspaceIndexPage(sizedWorkspace(100), {
        limit,
        query: "widget",
      }).results.map((hit) => hit.id);
      expect(page, `limit ${limit}`).toEqual(whole.slice(0, limit));
    }
  });

  it("says its read was partial when the rows behind it were capped", () => {
    const complete = searchWorkspaceIndexPage(authWorkspace(), {
      query: "auth",
    });
    expect(complete.coverage).toEqual({ reason: null, result: "complete" });

    const capped = searchWorkspaceIndexPage(
      {
        ...authWorkspace(),
        coverage: {
          readConsistency: "revision-fenced",
          result: "partial",
          truncated: [{ limit: 2_000, table: "index_entries" }],
        },
      },
      { query: "auth" },
    );
    // `truncated: 0` on a capped read would read as "that is every match in
    // the repository", which this read cannot know.
    expect(capped.coverage.result).toBe("partial");
    expect(capped.coverage.reason).toContain("index_entries");
  });

  it("ignores a cap on rows this search never ranked", () => {
    const page = searchWorkspaceIndexPage(
      {
        ...authWorkspace(),
        coverage: {
          readConsistency: "revision-fenced",
          result: "partial",
          truncated: [{ limit: 2_000, table: "routes" }],
        },
      },
      { query: "auth" },
    );
    expect(page.coverage).toEqual({ reason: null, result: "complete" });
  });
});

/** The same rules through the tool, as an MCP SDK client reaches it. */
describe("search_index over the hosted contract", () => {
  const clients: Client[] = [];

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close()));
  });

  async function connect(
    store: InMemoryMcpStore,
    workspaceId = WORKSPACE_ID,
    actorUserId = USER_ID,
  ) {
    const issued = await store.issueAccessToken({
      actorUserId,
      name: "RE-02",
      scopes: ["mcp:read"],
      workspaceId,
    });
    const endpoint = createHostedMcpEndpoint({ store });
    const client = new Client(
      { name: "re-02-contract-test", version: "1.0.0" },
      {
        cachePartition: issued.secret.slice(0, 12),
        versionNegotiation: { mode: { pin: "2026-07-28" } },
      },
    );
    const transport = new StreamableHTTPClientTransport(
      new URL("https://mcp.alrescha.test/mcp"),
      { authProvider: { token: async () => issued.secret }, fetch: endpoint.fetch },
    );
    clients.push(client);
    await client.connect(transport);
    return client;
  }

  async function search(
    client: Client,
    args: Record<string, unknown>,
  ): Promise<{
    query: string;
    results: {
      excerpt?: string;
      excerptAbsence?: { reason: string };
      nodeId: string;
      path: string;
      repositoryId: string;
      symbols?: { name: string; nodeId: string; span: string }[];
      title?: string;
      type: string;
    }[];
    truncated: number;
  }> {
    const answer = await client.callTool({ arguments: args, name: "search_index" });
    return answer.structuredContent as never;
  }

  it("recovers the backend matches a frontend-heavy ranking used to hide", async () => {
    const client = await connect(
      new InMemoryMcpStore({ workspaces: [authWorkspace()] }),
    );
    const backend = await search(client, {
      domain_filter: "backend",
      include_excerpt: false,
      query: "auth",
    });
    expect(backend.results).toHaveLength(5);
    expect(
      backend.results.every(({ path }) => path.startsWith("packages/core/")),
    ).toBe(true);
    expect(backend.truncated).toBe(0);

    const frontend = await search(client, {
      domain_filter: "frontend",
      include_excerpt: false,
      query: "auth",
    });
    expect(frontend.results).toHaveLength(20);
    expect(frontend.truncated).toBe(0);
  });

  it("reports the omission against every eligible candidate it reached", async () => {
    const client = await connect(
      new InMemoryMcpStore({ workspaces: [authWorkspace()] }),
    );
    const capped = await search(client, {
      include_excerpt: false,
      query: "auth",
    });
    expect(capped.results).toHaveLength(20);
    // The defect reported 0: it subtracted the page from the already-capped
    // list rather than from what matched.
    expect(capped.truncated).toBe(5);

    const whole = await search(client, {
      include_excerpt: false,
      limit: 100,
      query: "auth",
    });
    expect(whole.results).toHaveLength(25);
    expect(whole.truncated).toBe(0);

    const one = await search(client, {
      include_excerpt: false,
      limit: 1,
      query: "auth",
    });
    expect(one.results).toHaveLength(1);
    expect(one.truncated).toBe(24);
    expect(one.results[0]?.path).toBe(whole.results[0]?.path);
  });

  it("honours a limit the schema already accepted", async () => {
    const client = await connect(
      new InMemoryMcpStore({ workspaces: [sizedWorkspace(100)] }),
    );
    for (const [limit, expected] of [
      [1, 1],
      [19, 19],
      [20, 20],
      [21, 21],
      [100, 100],
    ] as const) {
      const page = await search(client, {
        include_excerpt: false,
        limit,
        query: "widget",
      });
      expect(page.results.length, `limit ${limit}`).toBe(expected);
      expect(page.truncated, `limit ${limit}`).toBe(100 - expected);
    }
    const byDefault = await search(client, {
      include_excerpt: false,
      query: "widget",
    });
    expect(byDefault.results).toHaveLength(SEARCH_INDEX_DEFAULT_LIMIT);
    expect(byDefault.truncated).toBe(80);
  });

  it("answers a query with no searchable term with nothing", async () => {
    const client = await connect(
      new InMemoryMcpStore({ workspaces: [authWorkspace()] }),
    );
    for (const query of ["!!!", "...", "###"]) {
      const page = await search(client, { include_excerpt: false, query });
      expect(page.results, query).toEqual([]);
      expect(page.truncated, query).toBe(0);
    }
    // Blank stays a schema error rather than an empty page: the tool never
    // accepted it and this change is not the place to start.
    const blank = await client.callTool({
      arguments: { query: "   " },
      name: "search_index",
    });
    expect(blank.isError).toBe(true);
    expect(JSON.stringify(blank.content)).toContain("Input validation error");
  });

  it("still finds identifiers, punctuation-laced names and Korean", async () => {
    const files = [
      { path: "apps/web/foo.ts", title: "foo.ts" },
      { path: "packages/core/interop.ts", title: "C# interop bridge" },
      { path: "apps/web/auth-middleware.ts", title: "인증 미들웨어" },
      { path: "packages/core/order_total.ts", title: "order_total" },
    ];
    const client = await connect(
      new InMemoryMcpStore({
        workspaces: [
          {
            id: WORKSPACE_ID,
            ownerUserId: USER_ID,
            repositories: [repository(REPOSITORY_ID, files, "s")],
          },
        ],
      }),
    );
    for (const [query, path] of [
      ["foo.ts", "apps/web/foo.ts"],
      ["C# interop", "packages/core/interop.ts"],
      ["인증", "apps/web/auth-middleware.ts"],
      ["미들웨어", "apps/web/auth-middleware.ts"],
      ["order_total", "packages/core/order_total.ts"],
    ] as const) {
      const page = await search(client, { include_excerpt: false, query });
      expect(page.results.map((r) => r.path), query).toContain(path);
    }
  });

  it("keeps memory in the domain its path implies", async () => {
    const store = new InMemoryMcpStore({
      workspaces: [
        {
          ...authWorkspace(),
          memoryEntries: [
            {
              anchorNodeId: null,
              anchorPath: null,
              entryKey: "auth-rollout",
              id: "01K287J3D18V7A1MZG9E8D1Z91",
              name: "decisions",
              text: "auth sessions stay server-side",
              updatedAt: "2026-09-21T00:00:00.000Z",
            },
            {
              anchorNodeId: "an0",
              anchorPath: "packages/core/auth-0.ts",
              entryKey: "auth-anchored",
              id: "01K287J3D18V7A1MZG9E8D1Z92",
              name: "decisions",
              text: "auth helper is the only entry point",
              updatedAt: "2026-09-21T00:00:00.000Z",
            },
          ],
        },
      ],
    });
    const client = await connect(store);

    const memoryOnly = await search(client, {
      include_excerpt: false,
      limit: 100,
      query: "auth",
      type_filter: "memory",
    });
    expect(memoryOnly.results.map(({ type }) => type)).toEqual([
      "memory",
      "memory",
    ]);

    // An unanchored entry has no repository path; its synthetic
    // `memory/<block>/<key>` path derives `unclassified`, and an anchored one
    // inherits the domain of the file it hangs off. Stated here because a
    // domain filter that silently dropped every note would be the same class
    // of false negative this card exists to remove.
    const unclassified = await search(client, {
      domain_filter: "unclassified",
      include_excerpt: false,
      limit: 100,
      query: "auth",
    });
    expect(unclassified.results.map(({ path }) => path)).toEqual([
      "memory/decisions/auth-rollout",
    ]);

    const backend = await search(client, {
      domain_filter: "backend",
      include_excerpt: false,
      limit: 100,
      query: "auth",
    });
    expect(
      backend.results.filter(({ type }) => type === "memory"),
    ).toHaveLength(1);
    expect(backend.results).toHaveLength(6);
  });

  it("does not merge two repositories that share a path", async () => {
    const shared = [{ path: "src/auth.ts", title: "auth" }];
    const client = await connect(
      new InMemoryMcpStore({
        workspaces: [
          {
            id: WORKSPACE_ID,
            ownerUserId: USER_ID,
            repositories: [
              repository(REPOSITORY_ID, shared, "p"),
              repository(SECOND_REPOSITORY_ID, shared, "q"),
            ],
          },
        ],
      }),
    );
    const page = await search(client, {
      include_excerpt: false,
      limit: 100,
      query: "auth",
    });
    expect(page.results).toHaveLength(2);
    expect(page.results.map(({ repositoryId }) => repositoryId).sort()).toEqual(
      [REPOSITORY_ID, SECOND_REPOSITORY_ID].sort(),
    );
    // Same score, same path: the id breaks the tie, so the order is stable.
    expect(page.results.map(({ nodeId }) => nodeId)).toEqual(["pn0", "qn0"]);
  });

  it("keeps one tenant's matches out of another's answer", async () => {
    const store = new InMemoryMcpStore({
      workspaces: [
        authWorkspace(),
        {
          id: OTHER_WORKSPACE_ID,
          ownerUserId: OTHER_USER_ID,
          repositories: [
            repository(
              "01K287J3D18V7A1MZG9E8D1Z30",
              [{ path: "packages/core/auth-other.ts", title: "auth" }],
              "o",
            ),
          ],
        },
      ],
    });
    const mine = await connect(store);
    const theirs = await connect(store, OTHER_WORKSPACE_ID, OTHER_USER_ID);

    const ours = await search(mine, {
      domain_filter: "backend",
      include_excerpt: false,
      limit: 100,
      query: "auth",
    });
    expect(ours.results.map(({ path }) => path)).not.toContain(
      "packages/core/auth-other.ts",
    );
    const other = await search(theirs, {
      domain_filter: "backend",
      include_excerpt: false,
      limit: 100,
      query: "auth",
    });
    expect(other.results.map(({ path }) => path)).toEqual([
      "packages/core/auth-other.ts",
    ]);
  });

  it("keeps the excerpt controls and the stale-summary block", async () => {
    const stale = artifact({
      content: "",
      id: "en0",
      path: "packages/core/session.ts",
      title: "session.ts",
    });
    const client = await connect(
      new InMemoryMcpStore({
        workspaces: [
          {
            id: WORKSPACE_ID,
            ownerUserId: USER_ID,
            repositories: [
              {
                ...repository(
                  REPOSITORY_ID,
                  [
                    { path: "apps/web/notes.ts", title: "session notes" },
                    { path: "packages/core/session.ts", title: "session.ts" },
                  ],
                  "e",
                ),
                artifacts: [
                  artifact({
                    content: "a long body ".repeat(40),
                    id: "en0",
                    path: "apps/web/notes.ts",
                    title: "session notes",
                  }),
                  {
                    ...stale,
                    id: "en1",
                    summaryState: {
                      currentBlobSha: "b".repeat(40),
                      sourceBlobSha: "c".repeat(40),
                      state: "stale",
                      text: "the description of an older version",
                    },
                  },
                ],
              },
            ],
          },
        ],
      }),
    );

    const bare = await search(client, {
      include_excerpt: false,
      limit: 100,
      query: "session",
    });
    expect(bare.results.every((r) => r.excerpt === undefined)).toBe(true);
    expect(bare.results.every((r) => r.title === undefined)).toBe(true);

    const clipped = await search(client, {
      excerpt_chars: 12,
      limit: 100,
      query: "session",
    });
    expect(
      clipped.results.every(({ excerpt }) => (excerpt ?? "").length <= 12),
    ).toBe(true);

    const withProse = await search(client, { limit: 100, query: "session" });
    const staleHit = withProse.results.find(({ nodeId }) => nodeId === "en1");
    // Prose written for an older blob never reaches a reader, so the excerpt
    // is empty and says why. The domain filter must not change that.
    expect(staleHit?.excerpt).toBe("");
    expect(staleHit?.excerptAbsence?.reason).toBeTruthy();

    const staleUnderFilter = await search(client, {
      domain_filter: "backend",
      limit: 100,
      query: "session",
    });
    expect(staleUnderFilter.results).toHaveLength(1);
    expect(staleUnderFilter.results[0]?.excerptAbsence?.reason).toBeTruthy();
  });
});

/** The symbol layer todo 26 added, unchanged by the filter order. */
describe("search_index and the symbol layer", () => {
  const clients: Client[] = [];

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close()));
  });

  const FILE_COUNT = 25;
  const SYMBOLS_PER_FILE = 10;

  function symbolFixture(): McpWorkspaceData {
    const files = Array.from({ length: FILE_COUNT }, (_, i) => ({
      path:
        i < 20
          ? `apps/web/parser-${String(i).padStart(2, "0")}.ts`
          : `packages/core/parser-${i}.ts`,
      title: "parser",
    }));
    const names = (file: number) =>
      Array.from(
        { length: SYMBOLS_PER_FILE },
        (_, s) => `parserHelper${file}_${s}`,
      );
    const symbols: McpSymbolData[] = [];
    const symbolEdges: McpEdgeData[] = [];
    files.forEach((file, index) => {
      names(index).forEach((name, s) => {
        const nodeId = `sym-${index}-${s}`;
        symbols.push({
          artifactNodeId: `yn${index}`,
          container: null,
          endLine: s * 10 + 9,
          engine: "typescript-ast",
          kind: "function",
          name,
          nodeId,
          path: file.path,
          repositoryId: REPOSITORY_ID,
          stableKey: `key-${nodeId}`,
          startLine: s * 10 + 1,
        });
        symbolEdges.push({
          confidence: 1,
          family: "hierarchy",
          id: `declares:yn${index}->${nodeId}`,
          provenance: { method: "typescript-ast", reason: null, span: null },
          relation: "declares",
          sourceNodeId: `yn${index}`,
          targetNodeId: nodeId,
          tier: "resolved",
        });
      });
    });
    const base = repository(REPOSITORY_ID, files, "y");
    return {
      id: WORKSPACE_ID,
      ownerUserId: USER_ID,
      repositories: [
        {
          ...base,
          indexEntries: base.indexEntries.map((entry, index) => ({
            ...entry,
            symbols: names(index),
          })),
          symbolEdges,
          symbols,
        },
      ],
    };
  }

  it("reads the layer for the files it answers with, and no others", async () => {
    const store = new InMemoryMcpStore({ workspaces: [symbolFixture()] });
    const spy = vi.spyOn(store, "loadSymbolNeighborhood");
    const issued = await store.issueAccessToken({
      actorUserId: USER_ID,
      name: "RE-02 symbols",
      scopes: ["mcp:read"],
      workspaceId: WORKSPACE_ID,
    });
    const endpoint = createHostedMcpEndpoint({ store });
    const client = new Client(
      { name: "re-02-symbol-test", version: "1.0.0" },
      {
        cachePartition: issued.secret.slice(0, 12),
        versionNegotiation: { mode: { pin: "2026-07-28" } },
      },
    );
    clients.push(client);
    await client.connect(
      new StreamableHTTPClientTransport(
        new URL("https://mcp.alrescha.test/mcp"),
        {
          authProvider: { token: async () => issued.secret },
          fetch: endpoint.fetch,
        },
      ),
    );

    const answer = await client.callTool({
      arguments: {
        domain_filter: "backend",
        include_excerpt: false,
        query: "parserHelper20_0",
      },
      name: "search_index",
    });
    const page = answer.structuredContent as {
      results: {
        nodeId: string;
        symbols?: { name: string; nodeId: string; span: string }[];
      }[];
      truncated: number;
    };
    // A backend file whose symbol matched — reachable only because the
    // domain now narrows the candidates before the cap.
    const hit = page.results.find(({ nodeId }) => nodeId === "yn20");
    expect(hit?.symbols).toEqual([
      {
        kind: "function",
        name: "parserHelper20_0",
        nodeId: "sym-20-0",
        span: "packages/core/parser-20.ts:1-9",
      },
    ]);
    // The lazy read is scoped to the files that made the page, never to the
    // whole ranking and never to the workspace.
    const readIds = spy.mock.calls.flatMap(
      ([, input]) => (input as { nodeIds: readonly string[] }).nodeIds,
    );
    expect(readIds).toEqual(["yn20"]);
    spy.mockRestore();
  });

  it("keeps the per-file symbol cap", async () => {
    const store = new InMemoryMcpStore({ workspaces: [symbolFixture()] });
    const issued = await store.issueAccessToken({
      actorUserId: USER_ID,
      name: "RE-02 symbol cap",
      scopes: ["mcp:read"],
      workspaceId: WORKSPACE_ID,
    });
    const endpoint = createHostedMcpEndpoint({ store });
    const client = new Client(
      { name: "re-02-symbol-cap", version: "1.0.0" },
      {
        cachePartition: issued.secret.slice(0, 12),
        versionNegotiation: { mode: { pin: "2026-07-28" } },
      },
    );
    clients.push(client);
    await client.connect(
      new StreamableHTTPClientTransport(
        new URL("https://mcp.alrescha.test/mcp"),
        {
          authProvider: { token: async () => issued.secret },
          fetch: endpoint.fetch,
        },
      ),
    );

    // `parserHelper20` is a substring of all ten of that file's symbols.
    const answer = await client.callTool({
      arguments: {
        domain_filter: "backend",
        include_excerpt: false,
        query: "parserHelper20",
      },
      name: "search_index",
    });
    const page = answer.structuredContent as {
      results: { nodeId: string; symbols?: unknown[] }[];
    };
    const hit = page.results.find(({ nodeId }) => nodeId === "yn20");
    expect(hit?.symbols).toHaveLength(8);
  });
});
