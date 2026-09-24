import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  selectSymbolNeighborhood,
  type McpEdgeData,
  type McpSymbolData,
} from "@alrescha/mcp";
import { describe, expect, it } from "vitest";

import { readSymbolLayer } from "../map/symbol-layer";
import { SupabaseMcpStore } from "./supabase-store";

/**
 * The symbol layer's requests, as the real client builds them (RE-04).
 *
 * PostgREST filters travel in the URL, so a request's length is a property of
 * what it asks for. Before this, the layer asked for a file's edges with every
 * symbol of the file in one `or` — twice — and a barrel like
 * `packages/core/src/index.ts`, which re-exports 485 names in this
 * repository, made that one request about 28,000 characters. The first
 * `search_index` after 47b32d2 failed with an error nobody could classify;
 * the probe (`docs/reports/re-04-search-failure.probe.mjs`) shows the
 * export-name query the symbol handoff asked for building an 8,568-character
 * edge request.
 *
 * Nothing here reaches a network. `fetch` is a small PostgREST reading the
 * five filter shapes these reads use, over in-memory tables, and it refuses a
 * URL past 8,000 characters the way a gateway does — postgrest-js's own
 * warning line, since Supabase publishes none. The claim under test is
 * stricter than that refusal: no request passes 4,096.
 */

type Row = Record<string, unknown>;

const URL_BUDGET = 4_096;
const GATEWAY_REFUSES_ABOVE = 8_000;
const WORKSPACE = "01M11Q24T11NG2SV2ZCE6P3CYV";
const REPOSITORY = "01M11QNPZ3CWTDF91B9A34F6VZ";
const PRINCIPAL = {
  scopes: ["mcp:read" as const],
  tokenId: "01M37AGCNNWJ57REQQYQF3TR19",
  userId: "owner",
  workspaceId: WORKSPACE,
};
const ulid = (n: number) => `01M2${String(n).padStart(22, "0")}`;
/** A barrel: 485 re-exported names, as `packages/core/src/index.ts` has here. */
const BARREL = ulid(1);
const BASES = ulid(2);
const BARREL_SYMBOLS = 485;

function symbolRow(n: number, file: string, line: number): Row {
  return {
    artifact_id: file,
    container: null,
    end_line: line,
    engine: "typescript-ast",
    id: ulid(10_000 + n),
    kind: "class",
    name: `Name${n}`,
    path: file === BARREL ? "packages/core/src/index.ts" : "src/bases.ts",
    repository_id: REPOSITORY,
    stable_key: `key-${n}`,
    start_line: line,
    workspace_id: WORKSPACE,
  };
}

function edgeRow(
  n: number,
  relation: "declares" | "extends",
  source: string,
  target: string,
): Row {
  return {
    confidence: 1,
    family: relation === "declares" ? "hierarchy" : "structure",
    id: ulid(50_000 + n),
    provenance: { method: "typescript-ast", tier: "resolved" },
    relation,
    source_node_id: source,
    target_node_id: target,
    workspace_id: WORKSPACE,
  };
}

/** The barrel's 485 symbols, three bases in another file, two `extends`. */
function tables(): Record<string, Row[]> {
  const barrel = Array.from({ length: BARREL_SYMBOLS }, (_, n) =>
    symbolRow(n, BARREL, n + 1),
  );
  const bases = [0, 1, 2].map((n) => symbolRow(900 + n, BASES, n + 1));
  const symbols = [...barrel, ...bases];
  const declares = symbols.map((row, n) =>
    edgeRow(n, "declares", String(row.artifact_id), String(row.id)),
  );
  return {
    artifacts: [BARREL, BASES].map((id) => ({ id, workspace_id: WORKSPACE })),
    symbol_edges: [
      ...declares,
      edgeRow(9_000, "extends", ulid(10_000), ulid(10_900)),
      edgeRow(9_001, "extends", ulid(10_001), ulid(10_901)),
    ],
    symbols,
  };
}

function matches(cell: unknown, filter: string): boolean {
  if (filter.startsWith("eq.")) return String(cell) === filter.slice(3);
  if (filter.startsWith("neq.")) return String(cell) !== filter.slice(4);
  if (filter.startsWith("in.(")) {
    return filter.slice(4, -1).split(",").includes(String(cell));
  }
  if (filter === "is.null") return cell === null || cell === undefined;
  throw new Error(`the emulated PostgREST does not read ${filter}`);
}

function compareCells(left: unknown, right: unknown): number {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

/** A PostgREST over `data`, behind a gateway that refuses long URLs. */
function postgrest(
  data: Record<string, Row[]>,
  seen: string[],
  answer?: (url: URL) => Response | null,
): typeof fetch {
  return async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    seen.push(url.toString());
    const override = answer?.(url);
    if (override) return override;
    if (url.toString().length > GATEWAY_REFUSES_ABOVE) {
      return new Response("URI too long\n", { status: 414 });
    }
    const table = url.pathname.split("/").at(-1) ?? "";
    let rows = [...(data[table] ?? [])];
    let limit: number | null = null;
    let order: string[] = [];
    for (const [key, value] of url.searchParams) {
      if (key === "select") continue;
      if (key === "limit") {
        limit = Number(value);
      } else if (key === "order") {
        order = value.split(",").map((term) => term.replace(/\.asc$/, ""));
      } else if (key === "or") {
        const clauses = [...value.matchAll(/(\w+)\.in\.\(([^)]*)\)/g)].map(
          ([, column, list]) => ({
            column: column ?? "",
            ids: new Set((list ?? "").split(",")),
          }),
        );
        rows = rows.filter((row) =>
          clauses.some(({ column, ids }) => ids.has(String(row[column]))),
        );
      } else {
        rows = rows.filter((row) => matches(row[key], value));
      }
    }
    rows.sort((left, right) => {
      for (const column of order) {
        const compared = compareCells(left[column], right[column]);
        if (compared !== 0) return compared;
      }
      return 0;
    });
    if (limit !== null) rows = rows.slice(0, limit);
    return new Response(JSON.stringify(rows), {
      headers: { "content-type": "application/json" },
      status: 200,
    });
  };
}

function client(fetchImpl: typeof fetch): SupabaseClient {
  return createClient("https://abcdefghijklmnopqrst.supabase.co", "key", {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: fetchImpl },
  });
}

const longest = (urls: readonly string[]) =>
  Math.max(...urls.map((url) => url.length));

/** The neighbourhood rule over the same rows, as the in-memory store runs it. */
function expectedNeighbourhood(data: Record<string, Row[]>, ids: string[]) {
  const symbols: McpSymbolData[] = (data.symbols ?? []).map((row) => ({
    artifactNodeId: String(row.artifact_id),
    container: null,
    endLine: Number(row.end_line),
    engine: String(row.engine),
    kind: String(row.kind),
    name: String(row.name),
    nodeId: String(row.id),
    path: String(row.path),
    repositoryId: String(row.repository_id),
    stableKey: String(row.stable_key),
    startLine: Number(row.start_line),
  }));
  const edges = (data.symbol_edges ?? []).map(
    (row) =>
      ({
        confidence: 1,
        family: row.family,
        id: String(row.id),
        provenance: { method: "typescript-ast", reason: null, span: null },
        relation: row.relation,
        sourceNodeId: String(row.source_node_id),
        targetNodeId: String(row.target_node_id),
        tier: "resolved",
      }) as McpEdgeData,
  );
  return selectSymbolNeighborhood(
    {
      artifactIds: new Set((data.artifacts ?? []).map((row) => String(row.id))),
      edges,
      symbols,
    },
    ids,
  );
}

describe("the symbol layer's requests stay under a gateway's line", () => {
  it("would ask for a barrel's edges in one refused request", async () => {
    // The request the layer made at 47b32d2, as the real client makes it,
    // and what a gateway that refuses long URLs hands back for it.
    const list = Array.from({ length: BARREL_SYMBOLS }, (_, n) =>
      ulid(10_000 + n),
    ).join(",");
    const seen: string[] = [];
    const once = await client(postgrest(tables(), seen))
      .from("symbol_edges")
      .select(
        "id, source_node_id, target_node_id, relation, family, confidence, provenance",
      )
      .eq("workspace_id", WORKSPACE)
      .or(`source_node_id.in.(${list}),target_node_id.in.(${list})`)
      .order("id", { ascending: true })
      .limit(20_001);
    expect(longest(seen)).toBeGreaterThan(GATEWAY_REFUSES_ABOVE);
    expect(once.status).toBe(414);
    // Not JSON, so the client passes the body through as the message: no
    // code, no "timeout" — a failure a classifier looking for either would
    // file under "other". That the first post-deploy search failed this way
    // is the leading explanation, not an observed fact.
    expect(once.error?.message).toBe("URI too long\n");
  });

  it("answers a barrel's neighbourhood with no request past 4 KB", async () => {
    const data = tables();
    const seen: string[] = [];
    const store = new SupabaseMcpStore(client(postgrest(data, seen)));
    const layer = await store.loadSymbolNeighborhood(PRINCIPAL, {
      nodeIds: [BARREL],
    });

    expect(longest(seen)).toBeLessThanOrEqual(URL_BUDGET);
    // The same answer the rule gives over the same rows in memory: batching
    // changed the requests, not the neighbourhood.
    const expected = expectedNeighbourhood(data, [BARREL]);
    expect(layer.symbols.map(({ nodeId }) => nodeId)).toEqual(
      expected.symbols.map(({ nodeId }) => nodeId),
    );
    expect(layer.edges.map(({ id }) => id).sort()).toEqual(
      expected.edges.map(({ id }) => id).sort(),
    );
    // 485 + the two bases the `extends` reach, and their declarations.
    expect(layer.symbols).toHaveLength(BARREL_SYMBOLS + 2);
    expect(layer.edges).toHaveLength(BARREL_SYMBOLS + 2 + 2);
    expect(layer.truncated).toEqual([]);
  });

  it("answers a full search page's symbols with no request past 4 KB", async () => {
    const data = tables();
    const seen: string[] = [];
    const store = new SupabaseMcpStore(client(postgrest(data, seen)));
    // `limit: 100` is the most one search page can name.
    const pages = [
      BARREL,
      ...Array.from({ length: 99 }, (_, n) => ulid(3 + n)),
    ];
    const read = await store.loadFileSymbols(PRINCIPAL, { fileIds: pages });

    expect(longest(seen)).toBeLessThanOrEqual(URL_BUDGET);
    expect(
      seen.every((url) => new URL(url).pathname.endsWith("/symbols")),
    ).toBe(true);
    expect(read.symbols).toHaveLength(BARREL_SYMBOLS);
    expect(read.symbols[0]?.startLine).toBe(1);
  });

  it("draws the map's halo for a barrel with no request past 4 KB", async () => {
    const data = tables();
    const seen: string[] = [];
    const layer = await readSymbolLayer(client(postgrest(data, seen)), [
      BARREL,
    ]);

    expect(longest(seen)).toBeLessThanOrEqual(URL_BUDGET);
    expect(layer.symbols).toHaveLength(BARREL_SYMBOLS);
    expect(
      layer.edges.filter(({ relation }) => relation === "declares"),
    ).toHaveLength(BARREL_SYMBOLS);
    expect(
      layer.edges.filter(({ relation }) => relation === "extends"),
    ).toHaveLength(2);
    expect(new Set(layer.edges.map(({ id }) => id)).size).toBe(
      layer.edges.length,
    );
    expect(layer.truncated).toEqual([]);
  });

  it("tags a refused request with its status, as the real client reports it", async () => {
    const refused = new SupabaseMcpStore(
      client(
        postgrest(
          tables(),
          [],
          () => new Response("URI too long\n", { status: 414 }),
        ),
      ),
    );
    await expect(
      refused.loadFileSymbols(PRINCIPAL, { fileIds: [BARREL] }),
    ).rejects.toThrow(
      /^\[HTTP 414\] MCP file symbol query failed: URI too long/,
    );

    const timedOut = new SupabaseMcpStore(
      client(
        postgrest(tables(), [], () =>
          Response.json(
            {
              code: "57014",
              details: null,
              hint: null,
              message: "canceling statement due to statement timeout",
            },
            { status: 500 },
          ),
        ),
      ),
    );
    await expect(
      timedOut.loadSymbolNeighborhood(PRINCIPAL, { nodeIds: [BARREL] }),
    ).rejects.toThrow(
      /^\[HTTP 500 57014\] MCP symbol file lookup failed: canceling statement/,
    );
  });
});
