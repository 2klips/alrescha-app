import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ALL_MIGRATIONS,
  PRUNE_ACCESS_EVENTS_CRON_MIGRATION,
  createTestDatabase,
} from "./helpers/database";

const ROOT = resolve(import.meta.dirname, "..");
const USER = "44444444-4444-4444-8444-444444444444";
const TOKEN_ID = "01J0000000000000000000000P";

/**
 * pg_cron cannot run inside PGlite, so the schedule itself is proved in
 * production (`.omo/evidence/phase2c/followup-deployment-checklist.md`). What
 * is provable here is everything that must hold regardless of the scheduler:
 * the migration is a clean no-op without pg_cron, it is idempotent, and the
 * statement it hands to cron really enforces retention.
 */
describe("daily access-event prune schedule", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let migration: string;
  let workspace: string;

  beforeAll(async () => {
    migration = await readFile(
      resolve(ROOT, PRUNE_ACCESS_EVENTS_CRON_MIGRATION),
      "utf8",
    );
    database = await createTestDatabase(ALL_MIGRATIONS);
    await database.query(
      "insert into auth.users (id, email) values ($1, 'prune@example.test')",
      [USER],
    );
    const workspaces = await database.query<{ id: string }>(
      "select id from public.workspaces where owner_user_id = $1",
      [USER],
    );
    workspace = workspaces.rows[0]?.id ?? "";
    await database.query(
      `insert into public.mcp_tokens
        (id, workspace_id, token_hash, token_prefix, created_by)
       values ($1, $2, 'prune-schedule-token', 'sp_prn', $3)`,
      [TOKEN_ID, workspace, USER],
    );
  });

  afterAll(async () => database.close());

  it("applies as a no-op on a database without pg_cron", async () => {
    const cronSchema = await database.query<{ count: number }>(
      "select count(*)::integer as count from information_schema.schemata where schema_name = 'cron'",
    );
    const pruneFunction = await database.query<{ count: number }>(
      `select count(*)::integer as count
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'prune_expired_access_events'`,
    );

    expect(cronSchema.rows[0]?.count).toBe(0);
    expect(pruneFunction.rows[0]?.count).toBe(1);
  });

  it("re-applies without error", async () => {
    await expect(database.exec(migration)).resolves.toBeDefined();
    await expect(database.exec(migration)).resolves.toBeDefined();
  });

  it("schedules one fixed job name on a daily cron expression", () => {
    const scheduled = /'(alrescha_prune_access_events)',\s*'([^']+)'/.exec(
      migration,
    );
    const [, jobName, expression] = scheduled ?? [];

    expect(jobName).toBe("alrescha_prune_access_events");
    expect(expression?.split(" ")).toHaveLength(5);
    // Fixed minute and hour, every day-of-month/month/day-of-week.
    expect(expression?.split(" ").slice(2)).toEqual(["*", "*", "*"]);
    expect(migration).toContain(
      "where jobname = 'alrescha_prune_access_events'",
    );
  });

  it("hands cron a statement that really enforces retention", async () => {
    const command = /'(select public\.[a-z_]+\(\);)'/.exec(migration)?.[1];
    await database.query(
      `insert into public.access_events (id, workspace_id, token_id, tool, occurred_at)
       values
        ('01J0000000000000000000000Q', $1, $2, 'search_index', now() - interval '31 days'),
        ('01J0000000000000000000000R', $1, $2, 'search_index', now() - interval '2 days')`,
      [workspace, TOKEN_ID],
    );

    expect(command).toBe("select public.prune_expired_access_events();");
    const pruned = await database.query<{
      prune_expired_access_events: number;
    }>(command!);
    const remaining = await database.query<{ count: number }>(
      "select count(*)::integer as count from public.access_events where workspace_id = $1",
      [workspace],
    );

    expect(pruned.rows[0]?.prune_expired_access_events).toBe(1);
    expect(remaining.rows[0]?.count).toBe(1);
  });
});
