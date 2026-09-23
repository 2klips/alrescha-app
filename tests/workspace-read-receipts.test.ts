import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  InMemoryMcpStore,
  createHostedMcpEndpoint,
} from "../packages/mcp/src/index";
import type {
  McpReceiptData,
  McpWorkspaceData,
} from "../packages/mcp/src/index";

/**
 * RE-04 B-01 — the common workspace read, at the pilot's receipt shape.
 *
 * Every `search_index`, `get_artifact`, `get_neighbors` and `impact_of` call
 * loads the workspace, and that load carried `receipts.summary`: 330 rows,
 * 40,101,144 bytes on the pilot (read-only count, 2026-09-23). No tool used
 * it. The four tools ran into statement timeouts on that read.
 *
 * The fixture is synthetic: 330 receipts whose summaries are in-toto-shaped
 * statements of the pilot's average size (40,101,144 / 330 ≈ 121,519 bytes).
 * No production row is copied. What it pins is *what is read*, not how long
 * it takes — timing on a laptop says nothing about the hosted database.
 */

const WORKSPACE = "01K400000000000000000000W1";
const USER = "10000000-0000-4000-8000-000000000041";
const REPO = "01K400000000000000000000R1";
const RECEIPTS = 330;
const SUMMARY_BYTES = 121_519;

function statement(index: number): Record<string, unknown> {
  const subject: { digest: { sha256: string }; name: string }[] = [];
  let size = 0;
  for (let i = 0; size < SUMMARY_BYTES - 400; i += 1) {
    const entry = {
      digest: {
        sha256: (index * 100_000 + i).toString(16).padStart(64, "0"),
      },
      name: `src/synthetic/module-${String(i).padStart(6, "0")}.ts`,
    };
    size += JSON.stringify(entry).length + 1;
    subject.push(entry);
  }
  return {
    findings: { open_total: 3, opened: 1, resolved: 0 },
    statement: {
      _type: "https://in-toto.io/Statement/v1",
      predicate: { synthetic: true },
      predicateType: "https://alrescha.test/receipt/v1",
      subject,
    },
  };
}

function receipts(): McpReceiptData[] {
  return Array.from({ length: RECEIPTS }, (_, index) => ({
    commitSha: index.toString(16).padStart(40, "0"),
    digest: null,
    id: `01K40000000000000000${String(index).padStart(6, "0")}`,
    status: "generated",
    summary: statement(index),
  }));
}

function workspace(): McpWorkspaceData {
  return {
    id: WORKSPACE,
    ownerUserId: USER,
    repositories: [
      {
        artifacts: [
          {
            blobSha: "a".repeat(40),
            content: "",
            headings: [],
            id: "01K400000000000000000000A1",
            kind: "code_metadata",
            path: "src/receipt-reader.ts",
            status: "active",
            summary: "",
            symbols: [],
            tags: [],
            title: "receipt reader",
          },
        ],
        contextPacks: [],
        defaultBranch: "main",
        edges: [],
        evidence: [],
        findings: [],
        fullName: "2klips/alrescha-app",
        id: REPO,
        indexEntries: [
          {
            headings: [],
            id: "01K400000000000000000000I1",
            neighborIds: [],
            nodeId: "01K400000000000000000000A1",
            path: "src/receipt-reader.ts",
            searchKey: "src/receipt-reader.ts receipt reader",
            symbols: [],
            tags: [],
            title: "receipt reader",
            type: "artifact",
          },
        ],
        overview: "receipt fixture",
        receipts: receipts(),
        requirements: [],
      },
    ],
  };
}

describe("the workspace read at the pilot's receipt shape", () => {
  const clients: Client[] = [];

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close()));
  });

  async function connect(store: InMemoryMcpStore) {
    const issued = await store.issueAccessToken({
      actorUserId: USER,
      name: "RE-04 B-01",
      scopes: ["mcp:read"],
      workspaceId: WORKSPACE,
    });
    const endpoint = createHostedMcpEndpoint({ store });
    const client = new Client(
      { name: "re-04-b01", version: "1.0.0" },
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
    return client;
  }

  it("builds a fixture the size of the pilot's summaries", () => {
    const bytes = receipts().reduce(
      (total, { summary }) => total + JSON.stringify(summary).length,
      0,
    );
    // Within 1% of the counted 40,101,144 bytes — otherwise the test below
    // would be measuring a different problem.
    expect(Math.abs(bytes - 40_101_144) / 40_101_144).toBeLessThan(0.01);
  });

  it("carries every receipt and no summary on the common read", async () => {
    const store = new InMemoryMcpStore({ workspaces: [workspace()] });
    const read = await store.loadWorkspace({
      scopes: ["mcp:read"],
      tokenId: "t",
      userId: USER,
      workspaceId: WORKSPACE,
    });
    const carried = read.repositories[0]?.receipts ?? [];
    // Every receipt is still there — the counts, the brain nodes and the
    // graph nodes built from them are unchanged.
    expect(carried).toHaveLength(RECEIPTS);
    expect(carried.every((receipt) => !("summary" in receipt))).toBe(true);
    const bytes = JSON.stringify(carried).length;
    // Ids, commits, statuses: tens of kilobytes, where the summaries were
    // forty megabytes.
    expect(bytes).toBeLessThan(100_000);
  });

  it("keeps the four blocked tools off the summaries", async () => {
    const store = new InMemoryMcpStore({ workspaces: [workspace()] });
    const summaries = vi.spyOn(store, "loadReceiptSummaries");
    const client = await connect(store);
    for (const [name, args] of [
      ["search_index", { query: "receipt" }],
      ["get_artifact", { path: "src/receipt-reader.ts" }],
      ["get_artifact", { include_change_brief: true, path: "src/receipt-reader.ts" }],
      ["get_neighbors", { node_id: "01K400000000000000000000A1" }],
      ["impact_of", { node_id: "01K400000000000000000000A1" }],
    ] as const) {
      const answer = await client.callTool({ arguments: args, name });
      expect(answer.isError, name).not.toBe(true);
      // Whatever the answer is, it holds no statement body.
      expect(JSON.stringify(answer.structuredContent), name).not.toContain(
        "in-toto.io/Statement",
      );
    }
    expect(summaries).not.toHaveBeenCalled();
    summaries.mockRestore();
  });

  it("still hands the resource every summary", async () => {
    const store = new InMemoryMcpStore({ workspaces: [workspace()] });
    const client = await connect(store);
    const resource = await client.readResource({
      uri: `alrescha://workspace/${WORKSPACE}/receipts-summary`,
    });
    const [content] = resource.contents;
    const payload = JSON.parse(
      content && "text" in content ? content.text : "{}",
    ) as {
      receipts: { id: string; repositoryId: string; summary: unknown }[];
      truncated?: unknown;
      workspaceId: string;
    };
    expect(payload.workspaceId).toBe(WORKSPACE);
    expect(payload.receipts).toHaveLength(RECEIPTS);
    expect(payload.truncated).toBeUndefined();
    expect(payload.receipts[0]).toMatchObject({
      repositoryId: REPO,
      summary: statement(0),
    });
  });

  it("keeps one tenant's summaries out of another's resource", async () => {
    const OTHER = "01K400000000000000000000W2";
    const OTHER_USER = "10000000-0000-4000-8000-000000000042";
    const store = new InMemoryMcpStore({
      workspaces: [
        workspace(),
        { id: OTHER, ownerUserId: OTHER_USER, repositories: [] },
      ],
    });
    const issued = await store.issueAccessToken({
      actorUserId: OTHER_USER,
      name: "neighbour",
      scopes: ["mcp:read"],
      workspaceId: OTHER,
    });
    const read = await store.loadReceiptSummaries({
      scopes: ["mcp:read"],
      tokenId: issued.record.id,
      userId: OTHER_USER,
      workspaceId: OTHER,
    });
    expect(read.receipts).toEqual([]);
    await expect(
      store.loadReceiptSummaries({
        scopes: ["mcp:read"],
        tokenId: issued.record.id,
        userId: OTHER_USER,
        workspaceId: WORKSPACE,
      }),
    ).rejects.toThrow("Workspace access denied");
  });
});
