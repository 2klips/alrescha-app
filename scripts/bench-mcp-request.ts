/**
 * Hosted MCP per-request cost bench (perf research MT-10).
 *
 * The SDK calls the server factory on **every** request — `initialize`,
 * `tools/list` and every `tools/call` alike. Whatever that factory does is
 * therefore paid per request, before the handler that answers the question has
 * run at all. This script measures that overhead in isolation:
 *
 *   · the store is `InMemoryMcpStore` over a tiny fixture, so the *answer* is
 *     nearly free and what remains is the plumbing;
 *   · requests go through `endpoint.fetch` directly, so there is no socket, no
 *     TLS and no network in the number;
 *   · the JSON-RPC is posted raw rather than through an SDK `Client`, whose
 *     response cache would absorb a repeated `tools/list` and never reach the
 *     server at all — the number would then be a lie.
 *
 * Three cases:
 *
 *   1. `server/discover` — what every new agent session pays first.
 *   2. `tools/list`      — the pure plumbing path: build the server, register
 *                          every tool, emit the schema list.
 *   3. `tools/call`      — the same plumbing plus one of the cheapest read
 *                          tools, so the fixed overhead can be read against
 *                          real work.
 *
 * Usage:
 *   node --import tsx scripts/bench-mcp-request.ts [--requests 200]
 *
 * Timing is wall clock, so absolute numbers are host-specific — quote the host
 * with any figure taken from here.
 */

import os from "node:os";

import {
  createHostedMcpEndpoint,
  InMemoryMcpStore,
} from "../packages/mcp/src/index";
import type { McpWorkspaceData } from "../packages/mcp/src/index";

const WORKSPACE_ID = "01K287J3D18V7A1MZG9E8D1Y01";
const USER_ID = "user-owner";
const REPOSITORY_ID = "01K287J3D18V7A1MZG9E8D1Y10";
const WARMUP_REQUESTS = 20;
const PROTOCOL_VERSION = "2026-07-28";
const CLIENT_INFO = { name: "alrescha-bench", version: "1.0.0" } as const;

/** Small on purpose: this bench measures plumbing, not query cost. */
function workspaceFixture(): McpWorkspaceData {
  return {
    id: WORKSPACE_ID,
    ownerUserId: USER_ID,
    repositories: [
      {
        artifacts: [
          {
            content: "# CI evidence policy\nEvery requirement needs evidence.",
            headings: ["CI evidence policy"],
            id: "01K287J3D18V7A1MZG9E8D1Y11",
            kind: "spec",
            path: "spec/WORK_SPEC.md",
            status: "active",
            summary: "CI evidence requirements",
            symbols: [],
            tags: ["ci", "evidence"],
            title: "CI evidence policy",
          },
          {
            content: "export function ingestCiTestReports() {}",
            headings: [],
            id: "01K287J3D18V7A1MZG9E8D1Y12",
            kind: "code_metadata",
            path: "packages/core/src/evidence/ci-reports.ts",
            status: "active",
            summary: "CI report ingestion",
            symbols: ["ingestCiTestReports"],
            tags: ["ci"],
            title: "ingestCiTestReports",
          },
        ],
        contextPacks: [],
        defaultBranch: "main",
        edges: [],
        evidence: [],
        findings: [],
        fullName: "2klips/alrescha-app",
        id: REPOSITORY_ID,
        indexEntries: [],
        overview: "Alrescha app repository",
        receipts: [],
        requirements: [],
      },
    ],
  };
}

interface Percentiles {
  max: number;
  mean: number;
  p50: number;
  p95: number;
  samples: number;
  totalMs: number;
}

function percentiles(samples: readonly number[]): Percentiles {
  const sorted = [...samples].sort((left, right) => left - right);
  const at = (fraction: number) =>
    sorted[
      Math.min(sorted.length - 1, Math.floor(fraction * (sorted.length - 1)))
    ] as number;
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    max: sorted[sorted.length - 1] as number,
    mean: total / sorted.length,
    p50: at(0.5),
    p95: at(0.95),
    samples: sorted.length,
    totalMs: total,
  };
}

function report(label: string, stats: Percentiles): void {
  const fixed = (value: number) => value.toFixed(3).padStart(8);
  console.log(
    `[mcp] ${label.padEnd(16)} n=${String(stats.samples).padStart(4)}` +
      ` p50=${fixed(stats.p50)}ms p95=${fixed(stats.p95)}ms` +
      ` max=${fixed(stats.max)}ms mean=${fixed(stats.mean)}ms`,
  );
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const index = argv.indexOf("--requests");
  const requests = Number(index >= 0 ? argv[index + 1] : 200);
  if (!Number.isSafeInteger(requests) || requests < 1) {
    throw new Error("--requests must be a positive integer");
  }

  const cpu = os.cpus()[0]?.model ?? "unknown";
  console.log(
    `[host] ${cpu.trim()} · ${os.cpus().length} threads · node ${process.version}` +
      ` · ${os.platform()} ${os.release()}`,
  );
  console.log(`[bench] requests=${requests} warmup=${WARMUP_REQUESTS}`);

  const store = new InMemoryMcpStore({ workspaces: [workspaceFixture()] });
  const issued = await store.issueAccessToken({
    actorUserId: USER_ID,
    name: "bench",
    scopes: ["mcp:read", "mcp:write"],
    workspaceId: WORKSPACE_ID,
  });
  const endpoint = createHostedMcpEndpoint({ store });

  /**
   * Raw JSON-RPC, exactly what the SDK client puts on the wire (captured from
   * `StreamableHTTPClientTransport`). Going through a `Client` instead would
   * measure its response cache, which absorbs a repeated `tools/list` without
   * ever reaching the server.
   */
  let id = 0;
  const call = async (
    method: string,
    params?: Record<string, unknown>,
  ): Promise<void> => {
    id += 1;
    const name = params?.["name"];
    const response = await endpoint.fetch(
      new Request("https://mcp.alrescha.test/mcp", {
        body: JSON.stringify({
          id,
          jsonrpc: "2.0",
          method,
          params: {
            _meta: {
              "io.modelcontextprotocol/clientCapabilities": {},
              "io.modelcontextprotocol/clientInfo": CLIENT_INFO,
              "io.modelcontextprotocol/protocolVersion": PROTOCOL_VERSION,
            },
            ...(params ?? {}),
          },
        }),
        headers: {
          accept: "application/json, text/event-stream",
          authorization: `Bearer ${issued.secret}`,
          "content-type": "application/json",
          "mcp-method": method,
          "mcp-protocol-version": PROTOCOL_VERSION,
          // The server rejects a body/header disagreement, so a tools/call
          // must name its tool in the header too.
          ...(typeof name === "string" ? { "mcp-name": name } : {}),
        },
        method: "POST",
      }),
    );
    if (!response.ok) {
      throw new Error(
        `${method} answered ${response.status}: ${await response.text()}`,
      );
    }
    const body = (await response.json()) as { error?: { message: string } };
    if (body.error) throw new Error(`${method}: ${body.error.message}`);
  };

  const cases: [string, () => Promise<void>][] = [
    ["server/discover", () => call("server/discover")],
    ["tools/list", () => call("tools/list")],
    [
      "tools/call",
      () =>
        call("tools/call", {
          arguments: { query: "ci evidence" },
          name: "search_index",
        }),
    ],
  ];

  for (const [label, run] of cases) {
    for (let i = 0; i < WARMUP_REQUESTS; i += 1) await run();
    const samples: number[] = [];
    for (let i = 0; i < requests; i += 1) {
      const start = performance.now();
      await run();
      samples.push(performance.now() - start);
    }
    report(label, percentiles(samples));
  }
}

await main();
