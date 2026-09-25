import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ALL_MIGRATIONS,
  FORCE_RLS_REMAINING_TABLES_MIGRATION,
  createTestDatabase,
} from "./helpers/database";

const ROOT = resolve(import.meta.dirname, "..");

/**
 * OQ-028. The repo convention is that a table turns RLS on and forces it, as
 * a pair. Three tables shipped with only the `enable` half
 * (202608170003_rationale_nodes.sql, 202608240002_concept_graph.sql,
 * 202608240003_module_summaries.sql) and production reflected exactly that:
 * 43 tables in `public` with RLS on, 40 with it forced (measured read-only
 * 2026-09-03). The fix sat unmerged while eight newer tables repeated the
 * omission; 202609240001 forces all eleven.
 *
 * These are catalog assertions on purpose. What `force` changes is whether
 * RLS applies to the table's OWNER, and the owner here is PGlite's
 * superuser, which bypasses RLS forced or not — the behaviour the flag buys
 * is not reachable from this harness, so the flag itself is what to check.
 * The first test asserts the convention rather than the three names: any
 * later table that enables RLS without forcing it fails here, and the
 * failure names it.
 */
describe("row level security is forced wherever it is enabled (OQ-028)", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;

  beforeAll(async () => {
    database = await createTestDatabase(ALL_MIGRATIONS);
  });

  afterAll(async () => database.close());

  it("leaves no table in public with RLS enabled but not forced", async () => {
    const unforced = await database.query<{ relname: string }>(
      `select c.relname from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relkind in ('r', 'p')
         and c.relrowsecurity
         and not c.relforcerowsecurity
       order by c.relname`,
    );

    expect(unforced.rows).toEqual([]);
  });

  it("has RLS enabled on every table in public, so the check above is not vacuous", async () => {
    const withoutRls = await database.query<{ relname: string }>(
      `select c.relname from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relkind in ('r', 'p')
         and not c.relrowsecurity
       order by c.relname`,
    );
    const forced = await database.query<{ count: number }>(
      `select count(*)::integer as count from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relkind in ('r', 'p')
         and c.relrowsecurity
         and c.relforcerowsecurity`,
    );

    expect(withoutRls.rows).toEqual([]);
    // 43 is the production count measured on 2026-09-03; the schema only
    // grows, so this floor holds without pinning the test to a table count.
    expect(forced.rows[0]?.count).toBeGreaterThanOrEqual(43);
  });

  it("re-applies without error", async () => {
    const migration = await readFile(
      resolve(ROOT, FORCE_RLS_REMAINING_TABLES_MIGRATION),
      "utf8",
    );

    await expect(database.exec(migration)).resolves.toBeDefined();
    await expect(database.exec(migration)).resolves.toBeDefined();
  });
});
