import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ALL_MIGRATIONS,
  asServiceRole,
  createTestDatabase,
} from "./helpers/database";

/**
 * A node that agent memory points at can still leave the graph.
 *
 * Agent memory is append-only: a BEFORE DELETE trigger refuses to delete a
 * row, even for service_role (202608230004). Its node references were also
 * `on delete cascade`, so the scan that removed a node took the cascade into
 * that trigger and the whole scan transaction failed. Every retry removes
 * the same path again, so one memory entry about a file was enough to stop
 * that repository's scans for good. Files, ADR rationales, sections,
 * symbols, routes and directories all lose their nodes when their source
 * goes away, and any of them can be an anchor.
 *
 * The memory rows must come through unchanged: no delete, no rewrite, no
 * invalidation. What a missing anchor means for reads (stale, hidden) is
 * the memory-resume card's decision (RE-05); readers already skip an
 * endpoint or anchor they cannot resolve. What the foreign keys guaranteed
 * at write time — the node exists in the same tenant — still holds, and
 * with the keys gone the one legal update (the invalidation stamp) must
 * not be able to move a reference either (review R1, 2026-09-24): the old
 * update guard compared six columns and left the node columns unchecked.
 */

const USER = "a3333333-3333-4333-8333-333333333333";
const OTHER_USER = "a4444444-4444-4444-8444-444444444444";
const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);

function planArtifact(path: string) {
  return {
    classification: "code_metadata",
    digest: path.length.toString(16).padStart(2, "0").repeat(32),
    exportedSymbols: [],
    kind: "code_metadata",
    path,
    rationales: [],
    sizeBytes: 64,
    sourceBlobSha: SHA_A,
    sourceCommitSha: SHA_A,
    symbolEngine: null,
    todoItems: [],
  };
}

interface MemoryRow {
  id: string;
  anchor_node_id: string | null;
  text: string;
  invalidated_at: string | null;
}

interface AssertionRow {
  id: string;
  source_node_id: string;
  target_node_id: string;
  relation: string;
  invalidated_at: string | null;
}

describe("agent memory survives the removal of the node it points at", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let workspaceId: string;
  let repositoryId: string;
  let tokenId: string;

  beforeEach(async () => {
    database = await createTestDatabase([...ALL_MIGRATIONS]);
    await database.query(
      "insert into auth.users (id, email) values ($1, 'anchor@example.test')",
      [USER],
    );
    const workspaces = await database.query<{ id: string }>(
      "select id from public.workspaces where owner_user_id = $1",
      [USER],
    );
    workspaceId = workspaces.rows[0]?.id ?? "";
    const repository = await database.query<{ id: string }>(
      "select public.ensure_local_repository($1, 'local/anchor') as id",
      [workspaceId],
    );
    repositoryId = repository.rows[0]?.id ?? "";
    const token = await asServiceRole(database, (tx) =>
      tx.query<{ id: string }>(
        `insert into public.mcp_tokens
           (workspace_id, token_hash, token_prefix, name, created_by, scopes)
         values ($1, 'hash-anchor-test', 'hash-anchor-', 'anchor test', $2,
                 array['mcp:read','mcp:write'])
         returning id`,
        [workspaceId, USER],
      ),
    );
    tokenId = token.rows[0]?.id ?? "";

    await apply({
      artifacts: ["src/a.ts", "src/b.ts", "src/c.ts"].map(planArtifact),
    });
  });

  afterEach(async () => {
    await database.close();
  });

  async function apply(plan: Record<string, unknown>): Promise<void> {
    await database.query(
      "select public.apply_repository_scan($1, $2, $3::jsonb)",
      [
        workspaceId,
        repositoryId,
        JSON.stringify({
          artifacts: [],
          codeLinks: [],
          commitSha: SHA_A,
          docLinks: [],
          removedPaths: [],
          skipped: [],
          touchedRows: 1,
          treeSha: SHA_B,
          unchangedPaths: [],
          ...plan,
        }),
      ],
    );
  }

  async function nodeOf(path: string): Promise<string> {
    const rows = await database.query<{ id: string }>(
      "select id from public.artifacts where workspace_id = $1 and path = $2",
      [workspaceId, path],
    );
    const id = rows.rows[0]?.id;
    if (!id) throw new Error(`no artifact node for ${path}`);
    return id;
  }

  async function writeMemory(
    anchor: string | null,
    key: string,
    text: string,
    remove = false,
  ): Promise<Record<string, string>> {
    const result = await database.query<{ payload: Record<string, string> }>(
      `select public.write_memory_entry($1, $2, $3, $4, 'gotchas', $5, $6, $7) as payload`,
      [workspaceId, tokenId, USER, anchor, key, text, remove],
    );
    return result.rows[0]?.payload ?? {};
  }

  async function assertLink(
    source: string,
    target: string,
    relation: string,
  ): Promise<Record<string, string>> {
    const result = await database.query<{ payload: Record<string, string> }>(
      `select public.record_agent_assertion($1, $2, $3, $4, $5, $6, 'seen in tests') as payload`,
      [workspaceId, tokenId, USER, source, target, relation],
    );
    return result.rows[0]?.payload ?? {};
  }

  async function memoryRows(): Promise<MemoryRow[]> {
    const rows = await database.query<MemoryRow>(
      `select id, anchor_node_id, text, invalidated_at::text as invalidated_at
       from public.memory_block_entries where workspace_id = $1 order by id`,
      [workspaceId],
    );
    return rows.rows;
  }

  async function assertionRows(): Promise<AssertionRow[]> {
    const rows = await database.query<AssertionRow>(
      `select id, source_node_id, target_node_id, relation,
              invalidated_at::text as invalidated_at
       from public.agent_assertions where workspace_id = $1 order by id`,
      [workspaceId],
    );
    return rows.rows;
  }

  async function nodeExists(id: string): Promise<boolean> {
    const rows = await database.query<{ found: boolean }>(
      "select exists (select 1 from public.graph_nodes where id = $1) as found",
      [id],
    );
    return rows.rows[0]?.found ?? false;
  }

  it("a scan that removes a memory entry's anchor succeeds and keeps the entry as written", async () => {
    const anchor = await nodeOf("src/a.ts");
    expect(
      (await writeMemory(anchor, "no-sync-io", "a.ts must not block")).outcome,
    ).toBe("added");
    const before = await memoryRows();

    await apply({
      commitSha: SHA_B,
      removedPaths: ["src/a.ts"],
      unchangedPaths: ["src/b.ts", "src/c.ts"],
    });

    expect(await nodeExists(anchor)).toBe(false);
    expect(await memoryRows()).toEqual(before);
    expect(before).toEqual([
      expect.objectContaining({ anchor_node_id: anchor, invalidated_at: null }),
    ]);
  });

  it("history rows on a removed anchor do not stop the scan either", async () => {
    const anchor = await nodeOf("src/a.ts");
    await writeMemory(anchor, "retry-policy", "first wording");
    expect(
      (await writeMemory(anchor, "retry-policy", "second wording")).outcome,
    ).toBe("updated");
    expect((await writeMemory(anchor, "retry-policy", "", true)).outcome).toBe(
      "invalidated",
    );
    const before = await memoryRows();
    expect(before.every((row) => row.invalidated_at !== null)).toBe(true);

    await apply({
      commitSha: SHA_B,
      removedPaths: ["src/a.ts"],
      unchangedPaths: ["src/b.ts", "src/c.ts"],
    });

    expect(await memoryRows()).toEqual(before);
  });

  it("a scan that removes either end of an assertion succeeds and keeps the assertion", async () => {
    const a = await nodeOf("src/a.ts");
    const b = await nodeOf("src/b.ts");
    const c = await nodeOf("src/c.ts");
    await assertLink(a, b, "uses");
    await assertLink(c, a, "uses");
    // A superseded pair leaves an invalidated row on the same endpoints.
    expect((await assertLink(c, a, "depends_on")).outcome).toBe("superseded");
    const before = await assertionRows();
    expect(before).toHaveLength(3);

    await apply({
      commitSha: SHA_B,
      removedPaths: ["src/a.ts"],
      unchangedPaths: ["src/b.ts", "src/c.ts"],
    });

    expect(await nodeExists(a)).toBe(false);
    expect(await assertionRows()).toEqual(before);
  });

  it("a rename — remove plus add in one scan — goes through with memory on the old path", async () => {
    const anchor = await nodeOf("src/a.ts");
    await writeMemory(anchor, "renamed-soon", "still about a.ts");
    await assertLink(anchor, await nodeOf("src/b.ts"), "depends_on");

    await apply({
      artifacts: [planArtifact("src/a2.ts")],
      commitSha: SHA_B,
      removedPaths: ["src/a.ts"],
      unchangedPaths: ["src/b.ts", "src/c.ts"],
    });

    const paths = await database.query<{ path: string }>(
      "select path from public.artifacts where workspace_id = $1 order by path",
      [workspaceId],
    );
    expect(paths.rows.map(({ path }) => path)).toEqual([
      "src/a2.ts",
      "src/b.ts",
      "src/c.ts",
    ]);
    expect(await memoryRows()).toHaveLength(1);
    expect(await assertionRows()).toHaveLength(1);
  });

  /** A real node in another user's workspace, and that workspace's repository. */
  async function otherTenantNode(): Promise<{
    node: string;
    repository: string;
  }> {
    await database.query(
      "insert into auth.users (id, email) values ($1, 'anchor-other@example.test')",
      [OTHER_USER],
    );
    const other = await database.query<{ id: string }>(
      "select id from public.workspaces where owner_user_id = $1",
      [OTHER_USER],
    );
    const otherWorkspace = other.rows[0]?.id ?? "";
    const otherRepository = await database.query<{ id: string }>(
      "select public.ensure_local_repository($1, 'local/other') as id",
      [otherWorkspace],
    );
    const repository = otherRepository.rows[0]?.id ?? "";
    const foreign = await asServiceRole(database, (tx) =>
      tx.query<{ id: string }>(
        `insert into public.graph_nodes (workspace_id, repository_id, kind, label)
         values ($1, $2, 'artifact', 'elsewhere.ts') returning id`,
        [otherWorkspace, repository],
      ),
    );
    return { node: foreign.rows[0]?.id ?? "", repository };
  }

  /** A direct service_role UPDATE, the path the MCP functions do not guard. */
  async function update(sql: string, params: unknown[]): Promise<void> {
    await asServiceRole(database, (tx) => tx.query(sql, params));
  }

  it("memory still refuses a node that does not exist in its tenant when written", async () => {
    const { node: foreignNode } = await otherTenantNode();
    const local = await nodeOf("src/b.ts");

    // The functions answer before writing, as they always did.
    expect((await writeMemory(foreignNode, "foreign", "nope")).outcome).toBe(
      "unknown_node",
    );
    expect((await assertLink(local, foreignNode, "uses")).outcome).toBe(
      "unknown_node",
    );

    // A direct insert that skips the functions is refused by the schema.
    await expect(
      asServiceRole(database, (tx) =>
        tx.query(
          `insert into public.memory_block_entries
             (workspace_id, anchor_node_id, name, entry_key, text, token_id, user_id)
           values ($1, $2, 'gotchas', 'direct', 'direct', $3, $4)`,
          [workspaceId, foreignNode, tokenId, USER],
        ),
      ),
    ).rejects.toThrow(/anchor/);
    await expect(
      asServiceRole(database, (tx) =>
        tx.query(
          `insert into public.agent_assertions
             (workspace_id, repository_id, source_node_id, target_node_id,
              relation, reason, token_id, user_id)
           values ($1, $2, $3, $4, 'uses', 'direct', $5, $6)`,
          [workspaceId, repositoryId, local, foreignNode, tokenId, USER],
        ),
      ),
    ).rejects.toThrow(/node/);
    // A workspace-level entry has no anchor to check.
    expect((await writeMemory(null, "workspace-wide", "fine")).outcome).toBe(
      "added",
    );
  });

  it("an invalidating update cannot move a memory entry's anchor or change what it says", async () => {
    const anchor = await nodeOf("src/a.ts");
    await writeMemory(anchor, "no-sync-io", "a.ts must not block");
    const { node: foreign } = await otherTenantNode();
    const before = await memoryRows();
    const id = before[0]?.id ?? "";

    for (const [column, value] of [
      ["anchor_node_id", "01K00000000000000000000000"], // never existed
      ["anchor_node_id", foreign], // another tenant's real node
      ["anchor_node_id", await nodeOf("src/b.ts")], // a real node, but not this one
      ["anchor_node_id", null], // file memory turned workspace-wide
      ["text", "rewritten while invalidating"],
      ["entry_key", "renamed-key"],
    ] as const) {
      await expect(
        update(
          `update public.memory_block_entries
           set invalidated_at = now(), ${column} = $2 where id = $1`,
          [id, value],
        ),
        `${column} = ${String(value)}`,
      ).rejects.toThrow(/must not rewrite history/);
    }
    expect(await memoryRows()).toEqual(before);
  });

  it("an invalidating update cannot move an assertion's source, target or repository", async () => {
    const a = await nodeOf("src/a.ts");
    const b = await nodeOf("src/b.ts");
    await assertLink(a, b, "uses");
    const { node: foreign, repository: foreignRepository } =
      await otherTenantNode();
    const secondRepository = await database.query<{ id: string }>(
      "select public.ensure_local_repository($1, 'local/second') as id",
      [workspaceId],
    );
    const before = await assertionRows();
    const id = before[0]?.id ?? "";

    for (const [column, value] of [
      ["target_node_id", foreign],
      ["target_node_id", "01K00000000000000000000000"],
      ["source_node_id", await nodeOf("src/c.ts")],
      ["repository_id", secondRepository.rows[0]?.id ?? ""],
      ["repository_id", foreignRepository],
      ["relation", "produces"],
      ["reason", "rewritten while invalidating"],
    ] as const) {
      await expect(
        update(
          `update public.agent_assertions
           set invalidated_at = now(), ${column} = $2 where id = $1`,
          [id, value],
        ),
        `${column} = ${value}`,
      ).rejects.toThrow(/must not rewrite history/);
    }
    expect(await assertionRows()).toEqual(before);
  });

  it("a pure invalidation still goes through, before and after the scan removes the node", async () => {
    const a = await nodeOf("src/a.ts");
    const b = await nodeOf("src/b.ts");
    const c = await nodeOf("src/c.ts");
    await writeMemory(a, "about-a", "a.ts is going away");
    await writeMemory(b, "about-b", "b.ts stays");
    await assertLink(a, b, "uses");
    await assertLink(b, c, "uses");
    const memory = new Map((await memoryRows()).map((row) => [row.text, row]));
    const assertions = await assertionRows();
    const fromA = assertions.find((row) => row.source_node_id === a);
    const fromB = assertions.find((row) => row.source_node_id === b);

    // Before any removal: the stamp alone, and the stamp with a superseder.
    await update(
      "update public.memory_block_entries set invalidated_at = now() where id = $1",
      [memory.get("b.ts stays")?.id],
    );
    await update(
      `update public.agent_assertions
       set invalidated_at = now(), invalidated_by = $2 where id = $1`,
      [fromB?.id, "01K00000000000000000000001"],
    );

    await apply({
      commitSha: SHA_B,
      removedPaths: ["src/a.ts"],
      unchangedPaths: ["src/b.ts", "src/c.ts"],
    });
    expect(await nodeExists(a)).toBe(false);

    // After the scan removed a.ts: the rows pointing at it can still be
    // invalidated, and nothing but the stamp changes.
    await update(
      "update public.memory_block_entries set invalidated_at = now() where id = $1",
      [memory.get("a.ts is going away")?.id],
    );
    await update(
      "update public.agent_assertions set invalidated_at = now() where id = $1",
      [fromA?.id],
    );

    const after = await memoryRows();
    expect(after.every((row) => row.invalidated_at !== null)).toBe(true);
    expect(
      after.map(({ id, anchor_node_id, text }) => ({
        id,
        anchor_node_id,
        text,
      })),
    ).toEqual(
      [...memory.values()].map(({ id, anchor_node_id, text }) => ({
        id,
        anchor_node_id,
        text,
      })),
    );
    const afterAssertions = await assertionRows();
    expect(afterAssertions.every((row) => row.invalidated_at !== null)).toBe(
      true,
    );
    expect(
      afterAssertions.map(
        ({ id, source_node_id, target_node_id, relation }) => ({
          id,
          source_node_id,
          target_node_id,
          relation,
        }),
      ),
    ).toEqual(
      assertions.map(({ id, source_node_id, target_node_id, relation }) => ({
        id,
        source_node_id,
        target_node_id,
        relation,
      })),
    );
    // Invalidated rows stay immutable, as before.
    await expect(
      update(
        "update public.memory_block_entries set invalidated_at = now() where id = $1",
        [memory.get("a.ts is going away")?.id],
      ),
    ).rejects.toThrow(/immutable/);
  });

  it("memory rows are still never deleted", async () => {
    const anchor = await nodeOf("src/a.ts");
    await writeMemory(anchor, "kept", "kept");

    await expect(
      asServiceRole(database, (tx) =>
        tx.query(
          "delete from public.memory_block_entries where workspace_id = $1",
          [workspaceId],
        ),
      ),
    ).rejects.toThrow(/never deleted/);
  });
});
