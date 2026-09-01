import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  InMemoryMcpStore,
  searchWorkspaceIndex,
  type McpPrincipal,
  type McpWorkspaceData,
} from "../packages/mcp/src/index";
import {
  AGENT_TARGETS,
  buildInstructionBlock,
  buildMcpConfigSnippet,
} from "../apps/web/lib/mcp/instruction-blocks";
import {
  ALL_MIGRATIONS,
  asAuthenticatedUser,
  asServiceRole,
  createTestDatabase,
} from "./helpers/database";

/**
 * Phase 3 Wave D todos 9-11 — bi-temporal agent memory.
 *
 * The property under test everywhere: nothing an agent writes is ever
 * deleted or rewritten; it is superseded with a timestamp, so history stays
 * answerable and reconciliation (Mem0's ADD/UPDATE/NOOP) stays deterministic.
 */

const USER_A = "a1111111-1111-4111-8111-111111111111";
const USER_B = "a2222222-2222-4222-8222-222222222222";

describe("agent assertions persist bi-temporally (todo 9)", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let workspaceId: string;
  let repositoryId: string;
  let tokenId: string;
  let nodeA: string;
  let nodeB: string;

  beforeEach(async () => {
    database = await createTestDatabase([...ALL_MIGRATIONS]);
    await database.query(
      "insert into auth.users (id, email) values ($1, 'mem-a@example.test'), ($2, 'mem-b@example.test')",
      [USER_A, USER_B],
    );
    const workspaces = await database.query<{
      id: string;
      owner_user_id: string;
    }>("select id, owner_user_id from public.workspaces");
    workspaceId =
      workspaces.rows.find(({ owner_user_id }) => owner_user_id === USER_A)
        ?.id ?? "";
    const repository = await database.query<{ id: string }>(
      "select public.ensure_local_repository($1, 'local/memory') as id",
      [workspaceId],
    );
    repositoryId = repository.rows[0]?.id ?? "";
    const token = await asServiceRole(database, (tx) =>
      tx.query<{ id: string }>(
        `insert into public.mcp_tokens
           (workspace_id, token_hash, token_prefix, name, created_by, scopes)
         values ($1, 'hash-memory-test', 'hash-memory-', 'memory test', $2,
                 array['mcp:read','mcp:write'])
         returning id`,
        [workspaceId, USER_A],
      ),
    );
    tokenId = token.rows[0]?.id ?? "";
    const nodes = await asServiceRole(database, (tx) =>
      tx.query<{ id: string }>(
        `insert into public.graph_nodes (workspace_id, repository_id, kind, label)
         values ($1, $2, 'artifact', 'src/a.ts'), ($1, $2, 'artifact', 'src/b.ts')
         returning id`,
        [workspaceId, repositoryId],
      ),
    );
    nodeA = nodes.rows[0]?.id ?? "";
    nodeB = nodes.rows[1]?.id ?? "";
  });

  afterEach(async () => {
    await database.close();
  });

  async function assertLink(relation: string): Promise<{
    id: string | null;
    invalidated_id: string | null;
    outcome: string;
  }> {
    const result = await database.query<{ payload: Record<string, string> }>(
      `select public.record_agent_assertion($1, $2, $3, $4, $5, $6, 'seen in tests') as payload`,
      [workspaceId, tokenId, USER_A, nodeA, nodeB, relation],
    );
    const payload = result.rows[0]?.payload ?? {};
    return {
      id: payload.id ?? null,
      invalidated_id: payload.invalidated_id ?? null,
      outcome: payload.outcome ?? "",
    };
  }

  it("reconciles: added, then noop, then superseded — history intact", async () => {
    const added = await assertLink("uses");
    expect(added.outcome).toBe("added");

    const repeated = await assertLink("uses");
    expect(repeated.outcome).toBe("noop");
    expect(repeated.id).toBe(added.id);

    const superseded = await assertLink("depends_on");
    expect(superseded.outcome).toBe("superseded");
    expect(superseded.invalidated_id).toBe(added.id);

    const rows = await asServiceRole(database, (tx) =>
      tx.query<{
        id: string;
        invalidated_at: string | null;
        invalidated_by: string | null;
        relation: string;
      }>(
        "select id, relation, invalidated_at, invalidated_by from public.agent_assertions order by valid_from, id",
      ),
    );
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows[0]).toMatchObject({
      id: added.id,
      invalidated_by: superseded.id,
      relation: "uses",
    });
    expect(rows.rows[0]?.invalidated_at).not.toBeNull();
    expect(rows.rows[1]).toMatchObject({
      invalidated_at: null,
      relation: "depends_on",
    });
  });

  it("answers time-travel: what was believed between the two writes", async () => {
    const added = await assertLink("uses");
    await database.query("select pg_sleep(0.01)");
    const midpoint = await database.query<{ now: string }>(
      "select now()::timestamptz as now",
    );
    await database.query("select pg_sleep(0.01)");
    await assertLink("depends_on");

    const believed = await asServiceRole(database, (tx) =>
      tx.query<{ relation: string }>(
        `select relation from public.agent_assertions
         where valid_from <= $1
           and (invalidated_at is null or invalidated_at > $1)`,
        [midpoint.rows[0]?.now],
      ),
    );
    expect(believed.rows).toEqual([{ relation: "uses" }]);
    expect(added.outcome).toBe("added");
  });

  it("physically refuses deletes and history rewrites", async () => {
    await assertLink("uses");
    await expect(
      asServiceRole(database, (tx) =>
        tx.query("delete from public.agent_assertions"),
      ),
    ).rejects.toThrow(/never deleted/);
    await expect(
      asServiceRole(database, (tx) =>
        tx.query("update public.agent_assertions set relation = 'produces'"),
      ),
    ).rejects.toThrow(/invalidated_at/);
  });

  it("rejects a node outside the workspace and keeps reads tenant-scoped", async () => {
    const foreign = await assertLink("uses");
    expect(foreign.outcome).toBe("added");

    const seenByB = await asAuthenticatedUser(database, USER_B, (tx) =>
      tx.query("select id from public.agent_assertions"),
    );
    expect(seenByB.rows).toEqual([]);

    const unknown = await database.query<{ payload: { outcome: string } }>(
      `select public.record_agent_assertion($1, $2, $3, 'NOPE', $4, 'uses', 'x') as payload`,
      [workspaceId, tokenId, USER_A, nodeB],
    );
    expect(unknown.rows[0]?.payload.outcome).toBe("unknown_node");
  });

  it("memory entries reconcile with a hard cap (todo 10)", async () => {
    async function write(
      key: string,
      text: string,
      remove = false,
    ): Promise<{ outcome: string }> {
      const result = await database.query<{ payload: { outcome: string } }>(
        `select public.write_memory_entry($1, $2, $3, $4, 'gotchas', $5, $6, $7) as payload`,
        [workspaceId, tokenId, USER_A, nodeA, key, text, remove],
      );
      return { outcome: result.rows[0]?.payload.outcome ?? "" };
    }

    expect(
      (await write("pglite", "PGlite는 드라이버 계층을 못 잡는다")).outcome,
    ).toBe("added");
    expect(
      (await write("pglite", "PGlite는 드라이버 계층을 못 잡는다")).outcome,
    ).toBe("noop");
    expect(
      (await write("pglite", "이음매 회귀 테스트로 고정할 것")).outcome,
    ).toBe("updated");
    expect((await write("pglite", "", true)).outcome).toBe("invalidated");
    expect((await write("pglite", "", true)).outcome).toBe("noop");

    for (let index = 0; index < 12; index += 1) {
      expect((await write(`fill-${index}`, `entry ${index}`)).outcome).toBe(
        "added",
      );
    }
    expect((await write("one-too-many", "over the cap")).outcome).toBe(
      "rejected_cap",
    );
  });
});

function workspaceFixture(): McpWorkspaceData {
  return {
    id: "ws",
    memoryEntries: [],
    ownerUserId: USER_A,
    repositories: [
      {
        artifacts: [
          {
            content: "",
            headings: [],
            id: "node-a",
            kind: "code_metadata",
            path: "src/a.ts",
            status: "active",
            summary: "",
            symbols: [],
            tags: [],
            title: "src/a.ts",
          },
          {
            content: "",
            headings: [],
            id: "node-b",
            kind: "code_metadata",
            path: "src/b.ts",
            status: "active",
            summary: "",
            symbols: [],
            tags: [],
            title: "src/b.ts",
          },
        ],
        contextPacks: [],
        defaultBranch: "main",
        edges: [],
        evidence: [],
        findings: [],
        fullName: "2klips/memory-fixture",
        id: "repo",
        indexEntries: [],
        overview: "",
        receipts: [],
        requirements: [],
      },
    ],
  };
}

describe("in-memory store mirrors the reconciliation (todos 9-10)", () => {
  const principal: McpPrincipal = {
    scopes: ["mcp:read", "mcp:write"],
    tokenId: "token",
    userId: USER_A,
    workspaceId: "ws",
  };

  it("assertLink: added / noop / superseded, unknown nodes rejected", async () => {
    const store = new InMemoryMcpStore({ workspaces: [workspaceFixture()] });
    const added = await store.assertLink(principal, {
      reason: "a uses b",
      relation: "uses",
      sourceNodeId: "node-a",
      targetNodeId: "node-b",
    });
    expect(added.outcome).toBe("added");
    expect(
      (
        await store.assertLink(principal, {
          reason: "again",
          relation: "uses",
          sourceNodeId: "node-a",
          targetNodeId: "node-b",
        })
      ).outcome,
    ).toBe("noop");
    const superseded = await store.assertLink(principal, {
      reason: "actually depends",
      relation: "depends_on",
      sourceNodeId: "node-a",
      targetNodeId: "node-b",
    });
    expect(superseded.outcome).toBe("superseded");
    expect(superseded.invalidatedId).toBe(added.id);
    expect(
      (
        await store.assertLink(principal, {
          reason: "x",
          relation: "uses",
          sourceNodeId: "node-a",
          targetNodeId: "missing",
        })
      ).outcome,
    ).toBe("unknown_node");
  });

  it("memory entries surface through search next to code", async () => {
    const store = new InMemoryMcpStore({ workspaces: [workspaceFixture()] });
    await store.writeMemory(principal, {
      anchorNodeId: "node-a",
      entryKey: "session-cookies",
      name: "gotchas",
      text: "Supabase cookies must be written by @supabase/ssr, not by hand",
    });
    const workspace = await store.loadWorkspace(principal);
    expect(workspace.memoryEntries).toHaveLength(1);
    expect(workspace.memoryEntries?.[0]).toMatchObject({
      anchorPath: "src/a.ts",
      entryKey: "session-cookies",
      name: "gotchas",
    });

    const results = searchWorkspaceIndex(workspace, {
      query: "session cookies",
    });
    const memoryHit = results.find((result) => result.type === "memory");
    expect(memoryHit).toMatchObject({
      neighborIds: ["node-a"],
      path: "src/a.ts",
      title: "gotchas: session-cookies",
    });
  });
});

describe("instruction blocks (todo 11)", () => {
  it("every target gets a delimited snippet naming the graph-first flow", () => {
    for (const target of AGENT_TARGETS) {
      const block = buildInstructionBlock(target);
      expect(block.snippet).toContain("alrescha:instructions:start");
      expect(block.snippet).toContain("alrescha:instructions:end");
      expect(block.snippet).toContain("Alrescha knowledge graph");
      expect(block.snippet).toContain("get_graph_schema");
      expect(block.snippet).toContain("memory_write");
      expect(block.snippet).toContain("assert_link");
    }
    expect(buildInstructionBlock("claude").filename).toBe("CLAUDE.md");
    expect(buildInstructionBlock("codex").filename).toBe("AGENTS.md");
    expect(buildInstructionBlock("cursor").filename).toBe(
      ".cursor/rules/alrescha.mdc",
    );
  });

  it("the MCP config snippet points at this deployment's endpoint", () => {
    const config = buildMcpConfigSnippet("https://alrescha.example/");
    expect(config).toContain('"alrescha": {');
    expect(config).toContain('"url": "https://alrescha.example/api/mcp"');
    expect(config).toContain("<ALRESCHA_MCP_TOKEN>");
  });
});
