import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ALL_MIGRATIONS,
  asAuthenticatedUser,
  asServiceRole,
  createTestDatabase,
} from "./helpers/database";

/**
 * The bounded, keyset-paged edge read (Codex remedy P0-B / R-01, step S3).
 *
 * S2b bounded the PostgREST reads and made a truncated answer say so. It
 * could not say how to continue, and it could not bound anything but rows.
 * This runs against real PostgreSQL — PGlite, the same engine, with the same
 * roles and the same privileges — so the boundary cases are answers rather
 * than assertions about a fake query builder.
 *
 * The cases the remedy names, in order: the 999/1,000/1,001 boundary, a
 * transport cap smaller than the page, page-to-page continuation, and the
 * function's own permission.
 */

const USER = "75000000-0000-4000-8000-000000000001";
const OTHER_USER = "75000000-0000-4000-8000-000000000002";
const SHA = "a".repeat(40);

interface EdgePage {
  coverage: {
    byteBudget: number;
    result: "complete" | "partial";
    rowBudget: number;
    stoppedBy: "bytes" | "rows" | null;
  };
  edges: { id: string; relation: string }[];
  exactCount: number | null;
  hasMore: boolean;
  nextCursor: string | null;
}

describe("read_edge_page", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let workspaceId: string;
  let repositoryId: string;

  beforeEach(async () => {
    database = await createTestDatabase([...ALL_MIGRATIONS]);
    await database.query(
      "insert into auth.users (id, email) values ($1, 'paging@example.test')",
      [USER],
    );
    const workspaces = await database.query<{ id: string }>(
      "select id from public.workspaces",
    );
    workspaceId = workspaces.rows[0]?.id ?? "";
    const repository = await database.query<{ id: string }>(
      "select public.ensure_local_repository($1, 'local/paging') as id",
      [workspaceId],
    );
    repositoryId = repository.rows[0]?.id ?? "";
  });

  afterEach(async () => {
    await database.close();
  });

  /**
   * `count` artifacts in a chain, giving `count - 1` `imports` edges — real
   * rows through the real apply path, so the paging walks what a scan
   * actually writes.
   */
  async function seedEdges(count: number): Promise<void> {
    const paths = Array.from(
      { length: count },
      (_unused, index) => `src/file-${index.toString().padStart(5, "0")}.ts`,
    );
    await database.query(
      "select public.apply_repository_scan($1, $2, $3::jsonb)",
      [
        workspaceId,
        repositoryId,
        JSON.stringify({
          artifacts: paths.map((path, index) => ({
            classification: "code_metadata",
            digest: index.toString(16).padStart(64, "0"),
            exportedSymbols: [],
            kind: "code_metadata",
            path,
            rationales: [],
            sizeBytes: 64,
            sourceBlobSha: SHA,
            sourceCommitSha: SHA,
            symbolEngine: "typescript-ast",
            todoItems: [],
          })),
          codeLinks: paths.slice(1).map((path, index) => ({
            kind: "imports",
            method: "module-resolution",
            sourcePath: path,
            span: { endLine: 1, startLine: 1 },
            symbols: [],
            targetPath: paths[index] ?? "",
            tier: "resolved",
          })),
          commitSha: SHA,
          docLinks: [],
          linkScope: "full",
          removedPaths: [],
          routes: [],
          schemaLinks: [],
          schemaObjects: [],
          sectionLinks: [],
          sections: [],
          skipped: [],
          touchedRows: paths.length,
          treeSha: "b".repeat(40),
          unchangedPaths: [],
        }),
      ],
    );
  }

  async function page(input: {
    after?: string | null;
    byteBudget?: number;
    rowBudget?: number;
  }): Promise<EdgePage> {
    return asServiceRole(database, async (transaction) => {
      const result = await transaction.query<{ page: EdgePage }>(
        "select public.read_edge_page($1, $2, $3, $4, $5) as page",
        [
          workspaceId,
          repositoryId,
          input.after ?? null,
          input.rowBudget ?? 500,
          input.byteBudget ?? 262_144,
        ],
      );
      return result.rows[0]?.page as EdgePage;
    });
  }

  async function edgeCount(): Promise<number> {
    const rows = await database.query<{ count: string }>(
      "select count(*)::text as count from public.edges where workspace_id = $1",
      [workspaceId],
    );
    return Number(rows.rows[0]?.count ?? "0");
  }

  /**
   * Leave exactly `count` edges, lowest ids first. A scan writes structure
   * and hierarchy edges together, and the boundary under test is about
   * paging over N rows — not about which writer produced them.
   */
  async function trimEdgesTo(count: number): Promise<void> {
    await database.query(
      `delete from public.edges
       where workspace_id = $1
         and id not in (
           select id from public.edges where workspace_id = $1
           order by id limit $2
         )`,
      [workspaceId, count],
    );
  }

  /**
   * The function feeds the same row decoder the table select feeds, so it
   * returns column names rather than a second naming convention. The first
   * draft returned camelCase and omitted `repository_id`, which decoded to
   * an error and would have filtered every edge out of its repository.
   */
  it("returns rows in the shape the decoder reads", async () => {
    await seedEdges(3);
    const first = await page({ rowBudget: 10 });

    expect(Object.keys(first.edges[0] ?? {}).sort()).toEqual([
      "confidence",
      "family",
      "id",
      "provenance",
      "relation",
      "repository_id",
      "source_node_id",
      "target_node_id",
    ]);
  });

  it("reads one page past nothing and calls it complete", async () => {
    await seedEdges(4);
    const first = await page({ rowBudget: 100 });

    expect(first.edges.length).toBe(await edgeCount());
    expect(first.hasMore).toBe(false);
    expect(first.coverage).toMatchObject({
      result: "complete",
      rowBudget: 100,
      stoppedBy: null,
    });
    // A count nobody paid for is not reported (REMEDY §5.2).
    expect(first.exactCount).toBeNull();
  });

  /**
   * The boundary the remedy names. A budget of `n` must answer the same way
   * at `n - 1`, `n` and `n + 1` rows — and the only one of the three that
   * says `hasMore` is the last.
   */
  it.each([
    [99, false],
    [100, false],
    [101, true],
  ])(
    "with %i edges against a budget of 100, hasMore is %s",
    async (rowCount, expected) => {
      await seedEdges(120);
      await trimEdgesTo(rowCount);
      expect(await edgeCount()).toBe(rowCount);

      const first = await page({ rowBudget: 100 });
      expect(first.edges).toHaveLength(Math.min(rowCount, 100));
      expect(first.hasMore).toBe(expected);
      expect(first.coverage.stoppedBy).toBe(expected ? "rows" : null);
    },
  );

  it("walks every edge across pages without repeating or skipping one", async () => {
    await seedEdges(251);
    const total = await edgeCount();
    expect(total).toBeGreaterThan(250);

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let request = 0; request < 20; request += 1) {
      const current: EdgePage = await page({ after: cursor, rowBudget: 40 });
      seen.push(...current.edges.map(({ id }) => id));
      if (!current.hasMore) break;
      // A keyset resumes from the last row it returned; an offset would
      // re-read and could skip or repeat when the table changes.
      expect(current.nextCursor).toBe(current.edges.at(-1)?.id);
      cursor = current.nextCursor;
    }

    expect(seen).toHaveLength(total);
    expect(new Set(seen).size).toBe(total);
    expect([...seen].sort()).toEqual(seen);
  });

  it("stops on the byte budget before the row budget, and says which", async () => {
    await seedEdges(60);
    // Small enough that a handful of rows exhausts it, large enough to hold
    // more than one: a transport cap below the page size (REMEDY §5.2).
    const limited = await page({ byteBudget: 1_024, rowBudget: 500 });

    expect(limited.edges.length).toBeGreaterThan(0);
    expect(limited.edges.length).toBeLessThan(await edgeCount());
    expect(limited.hasMore).toBe(true);
    expect(limited.coverage.stoppedBy).toBe("bytes");
    // And the caller can still continue from where the bytes ran out.
    const next = await page({
      after: limited.nextCursor,
      byteBudget: 1_024,
      rowBudget: 500,
    });
    expect(next.edges[0]?.id).not.toBe(limited.edges[0]?.id);
  });

  it("returns an empty page rather than an error past the last row", async () => {
    await seedEdges(4);
    const all = await page({ rowBudget: 100 });
    const past = await page({ after: all.nextCursor, rowBudget: 100 });

    expect(past.edges).toEqual([]);
    expect(past.hasMore).toBe(false);
    expect(past.nextCursor).toBeNull();
  });

  it("never answers for a workspace the caller did not name", async () => {
    await seedEdges(4);
    const other = await asServiceRole(database, async (transaction) => {
      const result = await transaction.query<{ page: EdgePage }>(
        "select public.read_edge_page($1, $2, $3, $4, $5) as page",
        ["01K200000000000000000000W9", null, null, 100, 262_144],
      );
      return result.rows[0]?.page as EdgePage;
    });

    expect(other.edges).toEqual([]);
    expect(other.hasMore).toBe(false);
  });

  /**
   * `security invoker` is not a tenant boundary on its own (REMEDY §5.5).
   * What keeps this function server-side is that only `service_role` may
   * execute it — a signed-in user reaches the graph through RLS on the
   * tables, not through this.
   */
  it("is executable by the server role and by nobody else", async () => {
    await seedEdges(4);
    await expect(
      asAuthenticatedUser(database, USER, async (transaction) =>
        transaction.query("select public.read_edge_page($1, $2, $3, $4, $5)", [
          workspaceId,
          repositoryId,
          null,
          10,
          262_144,
        ]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it("still respects row-level security for a caller that has it", async () => {
    await seedEdges(4);
    await database.query(
      "insert into auth.users (id, email) values ($1, 'other@example.test')",
      [OTHER_USER],
    );

    // The owner sees their own edges through RLS on the table.
    const mine = await asAuthenticatedUser(
      database,
      USER,
      async (transaction) =>
        transaction.query<{ count: string }>(
          "select count(*)::text as count from public.edges",
        ),
    );
    expect(Number(mine.rows[0]?.count ?? "0")).toBeGreaterThan(0);

    // Another signed-in user sees none of them.
    const theirs = await asAuthenticatedUser(
      database,
      OTHER_USER,
      async (transaction) =>
        transaction.query<{ count: string }>(
          "select count(*)::text as count from public.edges",
        ),
    );
    expect(theirs.rows[0]?.count).toBe("0");
  });
});
