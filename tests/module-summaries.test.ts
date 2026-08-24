import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ALL_MIGRATIONS,
  asServiceRole,
  createTestDatabase,
} from "./helpers/database";

/**
 * Phase 3 Wave C todo 8 — lazy module summaries at the database: the enqueue
 * is idempotent per (module, digest) and inherits the credit shape, and the
 * cache upserts by module key.
 */

const USER_A = "a1111111-1111-4111-8111-111111111111";

describe("module summaries (Wave C todo 8)", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let workspaceId: string;
  let repositoryId: string;

  beforeEach(async () => {
    database = await createTestDatabase([...ALL_MIGRATIONS]);
    await database.query(
      "insert into auth.users (id, email) values ($1, 'modules@example.test')",
      [USER_A],
    );
    const workspaces = await database.query<{ id: string }>(
      "select id from public.workspaces",
    );
    workspaceId = workspaces.rows[0]?.id ?? "";
    const repository = await database.query<{ id: string }>(
      "select public.ensure_local_repository($1, 'local/modules') as id",
      [workspaceId],
    );
    repositoryId = repository.rows[0]?.id ?? "";
  });

  afterEach(async () => {
    await database.close();
  });

  async function enqueue(
    digest: string,
    billing: "byok" | "credits" = "credits",
  ): Promise<string | null> {
    const result = await database.query<{ id: string | null }>(
      `select public.enqueue_module_summary_job(
         $1, $2, 'module:src/auth/login.ts',
         array['src/auth/login.ts','src/auth/session.ts'], $3,
         'anthropic', $4
       ) as id`,
      [workspaceId, repositoryId, digest, billing],
    );
    return result.rows[0]?.id ?? null;
  }

  it("enqueues once per (module, digest) with the credit shape of the mode", async () => {
    const first = await enqueue("d1");
    const repeat = await enqueue("d1");
    expect(repeat).toBe(first);

    const job = await database.query<{
      credit_cost: number;
      kind: string;
      payload: { memberPaths?: string[]; moduleKey?: string };
    }>("select kind, credit_cost, payload from public.jobs where id = $1", [
      first,
    ]);
    expect(job.rows[0]).toMatchObject({ credit_cost: 1, kind: "enrich" });
    expect(job.rows[0]?.payload.moduleKey).toBe("module:src/auth/login.ts");
    expect(job.rows[0]?.payload.memberPaths).toEqual([
      "src/auth/login.ts",
      "src/auth/session.ts",
    ]);

    // A moved digest is new work; BYOK carries no credit cost.
    const moved = await enqueue("d2", "byok");
    expect(moved).not.toBe(first);
    const byok = await database.query<{ credit_cost: number }>(
      "select credit_cost from public.jobs where id = $1",
      [moved],
    );
    expect(byok.rows[0]?.credit_cost).toBe(0);
  });

  it("apply_module_summary upserts by module key", async () => {
    const apply = (digest: string, summary: string) =>
      database.query(
        `select public.apply_module_summary(
           $1, $2, 'module:src/auth/login.ts', 'src/auth',
           array['src/auth/login.ts','src/auth/session.ts'], $3, $4,
           'claude-sonnet-5', 'anthropic'
         )`,
        [workspaceId, repositoryId, digest, summary],
      );
    await apply("d1", "First prose.");
    await apply("d2", "Fresher prose.");

    const rows = await asServiceRole(database, (tx) =>
      tx.query<{ grade: string; member_digest: string; summary: string }>(
        "select summary, member_digest, grade from public.module_summaries",
      ),
    );
    expect(rows.rows).toEqual([
      { grade: "inferred", member_digest: "d2", summary: "Fresher prose." },
    ]);
  });
});
