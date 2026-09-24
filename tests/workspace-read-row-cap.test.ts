import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { PGlite } from "@electric-sql/pglite";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SupabaseMcpStore } from "../apps/web/lib/mcp/supabase-store";
import { createLocalRepositorySource } from "../packages/cli/src/local-source";
import { scanRepository } from "../packages/core/src/index";
import type { McpPrincipal } from "../packages/mcp/src/index";
import { ALL_MIGRATIONS, createTestDatabase } from "./helpers/database";
import { postgrestOverPglite } from "./helpers/postgrest-pglite";

/**
 * RE-04 — a workspace read past the server's row cap.
 *
 * PostgREST answers with at most `max_rows` rows and says nothing about it;
 * Supabase's default, and this repository's `supabase/config.toml`, is
 * 1,000. Every bounded read in `loadWorkspace` asks for 2,001 rows so that a
 * 2,001st can say "there are more". A server that stops at 1,000 never sends
 * it, and the read reports itself complete. The pilot has about 1,010
 * artifacts and index entries and some 1,600 graph nodes, and its map — which
 * asks for 2,000 nodes — drew exactly 1,000 on 2026-09-23 and 2026-09-24.
 * That is circumstantial: the hosted setting was not read.
 *
 * The emulated cap is 5 so a 15-file fixture crosses it; the rule is the
 * same at 1,000. The data is the production SQL's own projection of the
 * fixture (`apply_repository_scan`), read by the real client and store.
 */

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const USER = "78000000-0000-4000-8000-0000000000c1";
const CAP = 5;

let database: PGlite;
let workspaceId = "";
let principal: McpPrincipal;

function storeWith(maxRows: number) {
  const emulator = postgrestOverPglite(database, {
    maxRows,
    role: "service_role",
  });
  const client = createClient(
    "https://abcdefghijklmnopqrst.supabase.co",
    "key",
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: emulator.fetch },
    },
  );
  return { emulator, store: new SupabaseMcpStore(client) };
}

async function count(sql: string): Promise<number> {
  const result = await database.query<{ n: number }>(sql, [workspaceId]);
  return result.rows[0]?.n ?? 0;
}

beforeAll(async () => {
  database = await createTestDatabase([...ALL_MIGRATIONS]);
  await database.query(
    "insert into auth.users (id, email) values ($1, 'row-cap@example.test')",
    [USER],
  );
  const workspaces = await database.query<{ id: string }>(
    "select id from public.workspaces",
  );
  workspaceId = workspaces.rows[0]?.id ?? "";
  const repository = await database.query<{ id: string }>(
    "select public.ensure_local_repository($1, $2) as id",
    [workspaceId, "local/drifted-demo"],
  );
  const { commitSha, source } = await createLocalRepositorySource(
    resolve(repoRoot, "fixtures/drifted-demo"),
  );
  const plan = await scanRepository({ commitSha, mode: "full", source });
  await database.query(
    "select public.apply_repository_scan($1, $2, $3::jsonb)",
    [workspaceId, repository.rows[0]?.id ?? "", JSON.stringify(plan)],
  );
  principal = {
    scopes: ["mcp:read"],
    tokenId: "01K287J3D18V7A1MZG9E8D1Y10",
    userId: USER,
    workspaceId,
  };
});

afterAll(async () => {
  await database.close();
});

describe("a workspace read past the server's row cap", () => {
  it("has more rows than the cap to read", async () => {
    // Not a tautology: a fixture under the cap would pass everything below.
    expect(
      await count(
        "select count(*)::int as n from public.index_entries where workspace_id = $1",
      ),
    ).toBeGreaterThan(CAP * 2);
  });

  it("reads every row of each table, or says which one it stopped on", async () => {
    const { store } = storeWith(CAP);
    const workspace = await store.loadWorkspace(principal);
    const repository = workspace.repositories[0];
    const stopped = new Set(
      (workspace.coverage?.truncated ?? []).map(({ table }) => table),
    );
    const expectations: [string, number, number][] = [
      [
        "index_entries",
        repository?.indexEntries.length ?? 0,
        await count(
          "select count(*)::int as n from public.index_entries where workspace_id = $1",
        ),
      ],
      [
        "artifacts",
        repository?.artifacts.length ?? 0,
        await count(
          "select count(*)::int as n from public.artifacts where workspace_id = $1",
        ),
      ],
    ];
    for (const [table, read, stored] of expectations) {
      // A read that kept less than the table holds must name the table.
      expect({ table, whole: read === stored || stopped.has(table) }).toEqual({
        table,
        whole: true,
      });
    }
    // Under a 2,000-row budget nothing here should stop at all.
    expect(workspace.coverage?.truncated).toEqual([]);
    expect(repository?.indexEntries).toHaveLength(expectations[0]?.[2] ?? -1);
    expect(repository?.artifacts).toHaveLength(expectations[1]?.[2] ?? -1);
  });

  it("names every node by its label, not only the first page's", async () => {
    const { store } = storeWith(CAP);
    const workspace = await store.loadWorkspace(principal);
    const labelled = await database.query<{ id: string; label: string }>(
      "select id, label from public.graph_nodes where workspace_id = $1 and kind = 'artifact'",
      [workspaceId],
    );
    const byId = new Map(labelled.rows.map((row) => [row.id, row.label]));
    // An artifact whose node label the read never saw falls back to its
    // path; every one of them has a label to find.
    for (const artifact of workspace.repositories[0]?.artifacts ?? []) {
      expect(artifact.title).toBe(byId.get(artifact.id));
    }
  });

  it("carries the tenant predicate on every page it asks for", async () => {
    const { emulator, store } = storeWith(CAP);
    await store.loadWorkspace(principal);
    const pages = emulator.requests.filter(
      ({ kind, name }) => kind === "table" && name === "index_entries",
    );
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      expect(new URL(page.url).searchParams.get("workspace_id")).toBe(
        `eq.${workspaceId}`,
      );
      expect(page.rows ?? 0).toBeLessThanOrEqual(CAP);
    }
  });

  it("reads all of a search hit's symbols past the cap", async () => {
    const heaviest = await database.query<{ artifact_id: string; n: number }>(
      `select artifact_id, count(*)::int as n from public.symbols
       where workspace_id = $1 group by artifact_id order by n desc limit 1`,
      [workspaceId],
    );
    const file = heaviest.rows[0];
    if (!file) throw new Error("the fixture declares no symbol");
    expect(file.n).toBeGreaterThan(1);
    const { store } = storeWith(file.n - 1);
    const read = await store.loadFileSymbols(principal, {
      fileIds: [file.artifact_id],
    });
    expect(read.symbols).toHaveLength(file.n);
    expect(read.truncated).toEqual([]);
  });

  it("reads the same workspace with no cap as it does under one", async () => {
    const capped = await storeWith(CAP).store.loadWorkspace(principal);
    const whole = await storeWith(1_000_000).store.loadWorkspace(principal);
    const ids = (workspace: typeof capped) =>
      (workspace.repositories[0]?.indexEntries ?? []).map(({ id }) => id);
    expect(ids(capped)).toEqual(ids(whole));
  });
});
