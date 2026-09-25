import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  AGENT_TARGETS,
  buildInstructionBlock,
} from "../apps/web/lib/mcp/instruction-blocks";
import { routeQuery } from "../packages/core/src/index";
import {
  InMemoryMcpStore,
  createHostedMcpEndpoint,
} from "../packages/mcp/src/index";

/**
 * RE-04 — every surface that tells an agent which tool to call may only name
 * tools the server has.
 *
 * Todo 22 ⑵ pinned the shared flow against the catalogue after one copy kept
 * teaching three removed tools. Two copies were outside it: the snippet the
 * MCP settings page hands a user to paste into CLAUDE.md or AGENTS.md, which
 * still said `search_nodes` and `get_node_content`, and `routeQuery`, whose
 * graph route still recommended `search_nodes`. An agent that follows either
 * calls a tool that answers "not found" and goes back to grep.
 */

const USER = "user-guidance";
const WORKSPACE = "01K287J3D18V7A1MZG9E8D1G01";
let client: Client;
let catalogue: Set<string>;

beforeAll(async () => {
  const store = new InMemoryMcpStore({
    workspaces: [{ id: WORKSPACE, ownerUserId: USER, repositories: [] }],
  });
  const issued = await store.issueAccessToken({
    actorUserId: USER,
    name: "Guidance",
    scopes: ["mcp:read"],
    workspaceId: WORKSPACE,
  });
  client = new Client(
    { name: "re-04-guidance", version: "1.0.0" },
    {
      cachePartition: issued.secret.slice(0, 12),
      versionNegotiation: { mode: { pin: "2026-07-28" } },
    },
  );
  await client.connect(
    new StreamableHTTPClientTransport(
      new URL("https://mcp.alrescha.test/mcp"),
      {
        authProvider: { token: async () => issued.secret },
        fetch: createHostedMcpEndpoint({ store }).fetch,
      },
    ),
  );
  catalogue = new Set((await client.listTools()).tools.map(({ name }) => name));
});

afterAll(async () => {
  await client.close();
});

/** Backticked snake_case names — how both surfaces write a tool. */
function namedTools(text: string): string[] {
  return [
    ...new Set(
      [...text.matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)].map(
        ([, name]) => name ?? "",
      ),
    ),
  ];
}

describe("tools an agent is told to call", () => {
  it("are all in the catalogue, in every instruction block the settings page hands out", () => {
    for (const target of AGENT_TARGETS) {
      const named = namedTools(buildInstructionBlock(target).snippet);
      expect(named.length).toBeGreaterThan(0);
      expect(named.filter((tool) => !catalogue.has(tool))).toEqual([]);
    }
  });

  it("are all in the catalogue, on either route the router can recommend", () => {
    for (const question of [
      "README 파일 어디 있어?",
      "이 요구사항이 바뀌면 영향을 받는 테스트는?",
    ]) {
      const decision = routeQuery(question);
      for (const tool of [
        ...decision.recommendedTools,
        ...decision.fallback.tools,
      ]) {
        expect({ tool, served: catalogue.has(tool) }).toEqual({
          served: true,
          tool,
        });
      }
    }
  });
});
