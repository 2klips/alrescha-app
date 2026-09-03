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
export const COACHING_JOB_KIND_MIGRATION =
  "supabase/migrations/202608180003_coaching_job_kind.sql";
export const FINDING_FINGERPRINT_MIGRATION =
  "supabase/migrations/202608210001_finding_fingerprints.sql";
export const DEPENDENCY_AUDIT_MIGRATION =
  "supabase/migrations/202608180002_dependency_audit_uploads.sql";
export const RULED_OUT_MIGRATION =
  "supabase/migrations/202608180001_ruled_out_attempts.sql";
export const PROMPT_CAPTURE_MCP_MIGRATION =
  "supabase/migrations/202608170008_prompt_capture_mcp.sql";
export const RATIONALE_READ_GRANTS_MIGRATION =
  "supabase/migrations/202608230001_rationale_read_grants.sql";
export const CODE_LINK_EDGES_MIGRATION =
  "supabase/migrations/202608230002_code_link_edges.sql";
export const FILE_CO_CHANGES_MIGRATION =
  "supabase/migrations/202608230003_file_co_changes.sql";
export const AGENT_MEMORY_MIGRATION =
  "supabase/migrations/202608230004_agent_memory.sql";
export const ENRICH_PASS_MIGRATION =
  "supabase/migrations/202608240001_enrich_pass.sql";
export const CONCEPT_GRAPH_MIGRATION =
  "supabase/migrations/202608240002_concept_graph.sql";
export const MODULE_SUMMARIES_MIGRATION =
  "supabase/migrations/202608240003_module_summaries.sql";
export const DISCARD_DEV_RECEIPTS_MIGRATION =
  "supabase/migrations/202608260001_discard_dev_receipts.sql";
export const DISCARD_ARR_TOOLS_RECEIPTS_MIGRATION =
  "supabase/migrations/202608260002_discard_arr_tools_receipts.sql";
export const BOUND_INDEX_ENTRY_SEARCH_KEYS_MIGRATION =
  "supabase/migrations/202608270001_bound_index_entry_search_keys.sql";
export const INITPLAN_SELECT_POLICIES_MIGRATION =
  "supabase/migrations/202608300001_initplan_select_policies.sql";
export const ACCESS_EVENTS_OCCURRED_IDX_MIGRATION =
  "supabase/migrations/202608300002_access_events_occurred_idx.sql";
export const PROMPT_COACHING_MIGRATION =
  "supabase/migrations/202608310001_prompt_coaching.sql";
export const JUDGMENT_COACHING_ENQUEUE_MIGRATION =
  "supabase/migrations/202608310002_judgment_coaching_enqueue.sql";
export const ALRESCHA_REPOSITORY_IDENTITY_MIGRATION =
  "supabase/migrations/202609010001_alrescha_repository_identity.sql";
export const RETRY_AFTER_TERMINAL_FAILURE_MIGRATION =
  "supabase/migrations/202609020001_retry_after_terminal_failure.sql";
export const REQUIREMENT_JUDGMENT_ENQUEUE_MIGRATION =
  "supabase/migrations/202609020002_requirement_judgment_enqueue.sql";
export const PRUNE_ACCESS_EVENTS_CRON_MIGRATION =
  "supabase/migrations/202609030001_prune_access_events_cron.sql";

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
  PROMPT_CAPTURE_MCP_MIGRATION,
  RULED_OUT_MIGRATION,
  DEPENDENCY_AUDIT_MIGRATION,
  COACHING_JOB_KIND_MIGRATION,
  FINDING_FINGERPRINT_MIGRATION,
  RATIONALE_READ_GRANTS_MIGRATION,
  CODE_LINK_EDGES_MIGRATION,
  FILE_CO_CHANGES_MIGRATION,
  AGENT_MEMORY_MIGRATION,
  ENRICH_PASS_MIGRATION,
  CONCEPT_GRAPH_MIGRATION,
  MODULE_SUMMARIES_MIGRATION,
  DISCARD_DEV_RECEIPTS_MIGRATION,
  DISCARD_ARR_TOOLS_RECEIPTS_MIGRATION,
  BOUND_INDEX_ENTRY_SEARCH_KEYS_MIGRATION,
  INITPLAN_SELECT_POLICIES_MIGRATION,
  ACCESS_EVENTS_OCCURRED_IDX_MIGRATION,
  PROMPT_COACHING_MIGRATION,
  JUDGMENT_COACHING_ENQUEUE_MIGRATION,
  ALRESCHA_REPOSITORY_IDENTITY_MIGRATION,
  RETRY_AFTER_TERMINAL_FAILURE_MIGRATION,
  REQUIREMENT_JUDGMENT_ENQUEUE_MIGRATION,
  PRUNE_ACCESS_EVENTS_CRON_MIGRATION,
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

/**
 * Run as  — the role the hosted MCP server and the worker use.
 * It bypasses RLS but NOT table privileges, so a table created after the
 * blanket grant in 202608100001 must name service_role itself. Reaching for
 * this helper is how a missing grant fails here instead of in production.
 */
export async function asServiceRole<T>(
  database: PGlite,
  callback: (transaction: Transaction) => Promise<T>,
): Promise<T> {
  return database.transaction(async (transaction) => {
    await transaction.exec("set local role service_role");
    return callback(transaction);
  });
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
