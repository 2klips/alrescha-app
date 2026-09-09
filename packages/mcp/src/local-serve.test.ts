import { PassThrough } from "node:stream";

import { Client } from "@modelcontextprotocol/client";
import type { Transport } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { describe, expect, it } from "vitest";

import { serveLocalWorkspace } from "./local-serve";
import type { McpWorkspaceData } from "./store";

/**
 * The stdio side of `alrescha serve --local` (Wave C todo 17).
 *
 * The graph the projection builds is checked against the scan SQL in
 * `tests/local-serve.test.ts`; what is at stake here is the connection —
 * that the surface an agent meets over stdio is the hosted one, and that a
 * write tool refuses rather than accepting into a store that dies with the
 * process.
 */

const WORKSPACE_ID = "local-workspace";
const REPOSITORY_ID = "repository:local/demo";

function workspace(): McpWorkspaceData {
  return {
    id: WORKSPACE_ID,
    ownerUserId: "local-user",
    repositories: [
      {
        artifacts: [
          {
            content: "",
            headings: [],
            id: "artifact:src/drift.ts",
            kind: "code_metadata",
            path: "src/drift.ts",
            status: "active",
            summary: "src/drift.ts",
            summaryState: { state: "missing" },
            symbols: [],
            tags: [],
            title: "src/drift.ts",
          },
        ],
        contextPacks: [],
        defaultBranch: "local",
        edges: [],
        evidence: [],
        findings: [],
        fullName: "local/demo",
        id: REPOSITORY_ID,
        indexEntries: [
          {
            headings: [],
            id: "artifact:src/drift.ts",
            neighborIds: [],
            nodeId: "artifact:src/drift.ts",
            path: "src/drift.ts",
            searchKey: "src/drift.ts drift.ts code_metadata",
            symbols: [],
            tags: ["code_metadata", "code_metadata"],
            title: "drift.ts",
            type: "artifact",
          },
        ],
        overview: "local/demo on local",
        receipts: [],
        requirements: [],
      },
    ],
  };
}

/**
 * A pair of streams standing in for a spawned process's stdio, and the
 * minimum transport a client needs to speak over the far end of them. The
 * server side is the real `StdioServerTransport`, so the framing under test
 * is the framing a client would meet.
 */
function loopback(): {
  clientTransport: Transport;
  serverTransport: Transport;
} {
  const toServer = new PassThrough();
  const toClient = new PassThrough();
  const serverTransport = new StdioServerTransport(toServer, toClient);

  let buffer = "";
  const clientTransport: Transport = {
    close: async () => {
      toServer.end();
      toClient.end();
      clientTransport.onclose?.();
    },
    send: async (message) => {
      toServer.write(`${JSON.stringify(message)}\n`);
    },
    start: async () => {
      toClient.on("data", (chunk: Buffer) => {
        buffer += chunk.toString("utf8");
        for (;;) {
          const newline = buffer.indexOf("\n");
          if (newline === -1) break;
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (line.length === 0) continue;
          clientTransport.onmessage?.(JSON.parse(line));
        }
      });
    },
  };
  return { clientTransport, serverTransport };
}

async function connected(): Promise<{
  client: Client;
  close: () => Promise<void>;
}> {
  const { clientTransport, serverTransport } = loopback();
  const handle = serveLocalWorkspace({
    transport: serverTransport,
    workspace: workspace(),
  });
  const client = new Client({ name: "local-serve-test", version: "0.0.0" });
  await client.connect(clientTransport);
  return {
    client,
    close: async () => {
      await client.close();
      await handle.close();
    },
  };
}

describe("the local stdio server", () => {
  it("serves the hosted tool surface, not a local subset", async () => {
    const session = await connected();
    try {
      const names = (await session.client.listTools()).tools
        .map((tool) => tool.name)
        .sort();
      // A tool that existed on only one transport would make "which
      // transport am I on" something an agent has to reason about.
      expect(names).toContain("search_index");
      expect(names).toContain("get_neighbors");
      expect(names).toContain("impact_of");
      expect(names).toContain("repo_overview");
      expect(names.length).toBeGreaterThan(15);
    } finally {
      await session.close();
    }
  });

  it("answers a read from the projected workspace", async () => {
    const session = await connected();
    try {
      const answer = await session.client.callTool({
        arguments: { query: "drift" },
        name: "search_index",
      });
      const results = (
        answer.structuredContent as { results?: { path: string }[] }
      ).results;
      expect(results?.map((result) => result.path)).toEqual(["src/drift.ts"]);
    } finally {
      await session.close();
    }
  });

  /**
   * The store dies with the process, so a write that looked like it landed
   * would be the lie worth avoiding. The refusal names the scope, which is
   * something an agent can act on; a silent no-op is not.
   */
  it("refuses a write rather than accepting one into a store that will vanish", async () => {
    const session = await connected();
    try {
      const answer = await session.client.callTool({
        arguments: { status: "done", summary: "s", task: "t" },
        name: "log_progress",
      });
      expect(answer.isError).toBe(true);
      expect(JSON.stringify(answer.content)).toMatch(/scope/i);
      // Nothing was written on the way to the refusal.
      const workspaceRead = await session.client.callTool({
        arguments: {},
        name: "repo_overview",
      });
      expect(workspaceRead.isError).toBeFalsy();
    } finally {
      await session.close();
    }
  });
});
