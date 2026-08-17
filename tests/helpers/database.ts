import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { PGlite, type Transaction } from "@electric-sql/pglite";

const ROOT = resolve(import.meta.dirname, "../..");

const SUPABASE_TEST_BOOTSTRAP = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (
    id uuid primary key,
    email text unique,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );
  create or replace function auth.uid()
  returns uuid
  language sql
  stable
  set search_path = ''
  as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  $$;
`;

export const AUTH_TENANCY_MIGRATION =
  "supabase/migrations/202608100001_auth_tenancy.sql";
export const EVIDENCE_GRAPH_MIGRATION =
  "supabase/migrations/202608100002_evidence_graph_domain.sql";
export const GITHUB_APP_MIGRATION =
  "supabase/migrations/202608100003_github_app_webhooks.sql";
export const WORKER_CREDIT_MIGRATION =
  "supabase/migrations/202608100004_worker_credit_lifecycle.sql";
export const REPOSITORY_SCAN_MIGRATION =
  "supabase/migrations/202608100005_repository_scans.sql";
export const HOSTED_MCP_MIGRATION =
  "supabase/migrations/202608100006_hosted_mcp.sql";
export const AI_JUDGMENT_MIGRATION =
  "supabase/migrations/202608100007_ai_judgment.sql";
export const PILOT_INSTRUMENTATION_MIGRATION =
  "supabase/migrations/202608100008_pilot_instrumentation.sql";
export const RELEASE_HARDENING_MIGRATION =
  "supabase/migrations/202608100009_release_hardening.sql";
export const PROGRESS_DASHBOARD_MIGRATION =
  "supabase/migrations/202608100010_progress_dashboard.sql";
export const LIBRARY_MIGRATION =
  "supabase/migrations/202608100011_personal_library.sql";
export const RUN_LIFECYCLE_MIGRATION =
  "supabase/migrations/202608170001_run_lifecycle.sql";
export const LOCAL_INGEST_MIGRATION =
  "supabase/migrations/202608170002_local_ingest.sql";
export const RATIONALE_NODES_MIGRATION =
  "supabase/migrations/202608170003_rationale_nodes.sql";
export const TEAM_ROLES_MIGRATION =
  "supabase/migrations/202608170004_team_roles.sql";
export const PROMPT_CAPTURE_MIGRATION =
  "supabase/migrations/202608170005_prompt_capture.sql";
export const SYMBOL_ENGINE_MIGRATION =
  "supabase/migrations/202608170006_symbol_engine.sql";
export const LOCAL_INGEST_RUN_MIGRATION =
  "supabase/migrations/202608170007_local_ingest_run.sql";

/** Every migration, in order — the production `scripts/migrate.ts` set. */
export const ALL_MIGRATIONS = [
  "supabase/migrations/202608100001_auth_tenancy.sql",
  "supabase/migrations/202608100002_evidence_graph_domain.sql",
  "supabase/migrations/202608100003_github_app_webhooks.sql",
  "supabase/migrations/202608100004_worker_credit_lifecycle.sql",
  "supabase/migrations/202608100005_repository_scans.sql",
  "supabase/migrations/202608100006_hosted_mcp.sql",
  "supabase/migrations/202608100007_ai_judgment.sql",
  "supabase/migrations/202608100008_pilot_instrumentation.sql",
  "supabase/migrations/202608100009_release_hardening.sql",
  "supabase/migrations/202608100010_progress_dashboard.sql",
  "supabase/migrations/202608100011_personal_library.sql",
  "supabase/migrations/202608170001_run_lifecycle.sql",
  "supabase/migrations/202608170002_local_ingest.sql",
  RATIONALE_NODES_MIGRATION,
  TEAM_ROLES_MIGRATION,
  PROMPT_CAPTURE_MIGRATION,
  SYMBOL_ENGINE_MIGRATION,
  LOCAL_INGEST_RUN_MIGRATION,
] as const;

export async function createTestDatabase(
  migrations: readonly string[],
): Promise<PGlite> {
  const database = new PGlite();
  await database.waitReady;
  await database.exec(SUPABASE_TEST_BOOTSTRAP);

  for (const migration of migrations) {
    await database.exec(await readFile(resolve(ROOT, migration), "utf8"));
  }

  return database;
}

export async function asAuthenticatedUser<T>(
  database: PGlite,
  userId: string,
  callback: (transaction: Transaction) => Promise<T>,
): Promise<T> {
  return database.transaction(async (transaction) => {
    await transaction.query(
      "select set_config('request.jwt.claim.sub', $1, true)",
      [userId],
    );
    await transaction.exec("set local role authenticated");
    return callback(transaction);
  });
}
