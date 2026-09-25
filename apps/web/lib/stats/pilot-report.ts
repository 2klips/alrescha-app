import {
  computePilotStats,
  type PilotPackMeasurement,
  type PilotReceiptSnapshot,
  type PilotRepository,
  type PilotRunMeasurement,
  type PilotStatsReport,
  type PilotUsageDay,
} from "@alrescha/core/stats";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  readByIdPages,
  type PagedRows,
  type PageRequest,
  type RowPage,
} from "../supabase/row-pages";

interface ReceiptRow {
  readonly commit_sha: string;
  readonly created_at: string;
  /**
   * `summary->findings`: the §13 snapshot alone, or null when the summary has
   * no `findings` or is not an object.
   */
  readonly findings: unknown;
  readonly id: string;
}

interface PackEventRow {
  readonly occurred_at: string;
  readonly pack_baseline_tokens: number | null;
  readonly pack_selected_tokens: number | null;
}

interface RunRow {
  readonly completed_at: string | null;
  readonly id: string;
  readonly started_at: string | null;
}

interface UsageDayRow {
  readonly day: string;
  readonly repository_id: string | null;
  readonly reported_cache_creation_tokens: number | string | null;
  readonly reported_cache_read_tokens: number | string | null;
  readonly reported_input_tokens: number | string | null;
  readonly reported_output_tokens: number | string | null;
  readonly reported_reports: number | string | null;
  readonly served_calls: number | string | null;
  readonly served_estimated_tokens: number | string | null;
  readonly served_measured_calls: number | string | null;
  readonly served_response_chars: number | string | null;
}

export interface PilotStatsRows {
  readonly enabled: boolean;
  readonly packEvents: readonly PackEventRow[];
  readonly receipts: readonly ReceiptRow[];
  readonly repositories?: readonly PilotRepository[];
  readonly repositoryFilter?: string | null;
  readonly runs: readonly RunRow[];
  readonly usage?: readonly UsageDayRow[];
}

/**
 * PostgreSQL hands a bigint back as a string once it outgrows a JS number,
 * and a sum over a busy day will. Parsed rather than coerced, so a value that
 * is not a count reads as zero instead of letting NaN spread through a total.
 */
function bigintCount(value: number | string | null): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(parsed) && Number(parsed) > 0 ? Number(parsed) : 0;
}

function usageDay(row: UsageDayRow): PilotUsageDay {
  return {
    day: row.day,
    repositoryId: row.repository_id,
    reportedCacheCreationTokens: bigintCount(
      row.reported_cache_creation_tokens,
    ),
    reportedCacheReadTokens: bigintCount(row.reported_cache_read_tokens),
    reportedInputTokens: bigintCount(row.reported_input_tokens),
    reportedOutputTokens: bigintCount(row.reported_output_tokens),
    reportedReports: bigintCount(row.reported_reports),
    servedCalls: bigintCount(row.served_calls),
    servedEstimatedTokens: bigintCount(row.served_estimated_tokens),
    servedMeasuredCalls: bigintCount(row.served_measured_calls),
    servedResponseChars: bigintCount(row.served_response_chars),
  };
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function count(value: unknown): number | null {
  if (Array.isArray(value)) return value.length;
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function receiptSnapshot(row: ReceiptRow): PilotReceiptSnapshot | null {
  const findings = record(row.findings);
  const opened = count(findings.opened);
  const resolved = count(findings.resolved);
  const openTotal = count(findings.open_total);
  if (
    opened === null ||
    resolved === null ||
    openTotal === null ||
    !/^[0-9a-f]{40}$/.test(row.commit_sha) ||
    !Number.isFinite(Date.parse(row.created_at))
  ) {
    return null;
  }
  return {
    commitSha: row.commit_sha,
    createdAt: row.created_at,
    findings: { opened, openTotal, resolved },
    id: row.id,
  };
}

function packMeasurement(row: PackEventRow): PilotPackMeasurement | null {
  if (
    !Number.isInteger(row.pack_baseline_tokens) ||
    Number(row.pack_baseline_tokens) <= 0 ||
    !Number.isInteger(row.pack_selected_tokens) ||
    Number(row.pack_selected_tokens) < 0 ||
    Number(row.pack_selected_tokens) > Number(row.pack_baseline_tokens) ||
    !Number.isFinite(Date.parse(row.occurred_at))
  ) {
    return null;
  }
  return {
    baselineTokens: Number(row.pack_baseline_tokens),
    occurredAt: row.occurred_at,
    selectedTokens: Number(row.pack_selected_tokens),
  };
}

function runMeasurement(row: RunRow): PilotRunMeasurement | null {
  if (!row.started_at || !row.completed_at) return null;
  const startedAt = Date.parse(row.started_at);
  const completedAt = Date.parse(row.completed_at);
  if (
    !Number.isFinite(startedAt) ||
    !Number.isFinite(completedAt) ||
    completedAt < startedAt
  ) {
    return null;
  }
  return {
    completedAt: row.completed_at,
    id: row.id,
    startedAt: row.started_at,
  };
}

export function buildPilotStatsReport(rows: PilotStatsRows): PilotStatsReport {
  return computePilotStats({
    enabled: rows.enabled,
    packRequestCount: rows.packEvents.length,
    repositories: rows.repositories ?? [],
    repositoryFilter: rows.repositoryFilter ?? null,
    usage: (rows.usage ?? []).map(usageDay),
    packs: rows.packEvents.flatMap((row) => {
      const measurement = packMeasurement(row);
      return measurement ? [measurement] : [];
    }),
    receipts: rows.receipts.flatMap((row) => {
      const snapshot = receiptSnapshot(row);
      return snapshot ? [snapshot] : [];
    }),
    runs: rows.runs.flatMap((row) => {
      const measurement = runMeasurement(row);
      return measurement ? [measurement] : [];
    }),
  });
}

export interface WorkspacePilotReport {
  readonly report: PilotStatsReport;
  readonly workspaceId: string;
}

/**
 * The report is defined across the whole receipt chain (BUILD_PLAN 18), so
 * no read here has a budget, and none may stop where the server does.
 * PostgREST answers with at most `max_rows` rows and says nothing about it
 * (1,000 in `supabase/config.toml`; the hosted value is unverified), and
 * each read asked for its rows oldest first: a capped answer kept the oldest
 * and dropped the newest (RE-04). So no page sets a limit — each is as long
 * as the server allows — and the reads continue past it.
 */
const EVERY_ROW = Number.POSITIVE_INFINITY;

/**
 * The part of a PostgREST query builder the paged reads use, stated
 * structurally as the MCP store states its own: supabase-js types a select
 * from its column string, and these take the string as an argument. One
 * cast, where the builder is made.
 */
interface PageQuery<Row> extends PromiseLike<RowPage<Row>> {
  eq(column: string, value: unknown): PageQuery<Row>;
  gt(column: string, value: unknown): PageQuery<Row>;
  gte(column: string, value: unknown): PageQuery<Row>;
  order(
    column: string,
    options: { ascending: boolean; nullsFirst?: boolean },
  ): PageQuery<Row>;
}

/** The workspace, narrowed to one repository when the reader asked. */
interface ReadScope {
  readonly repositoryId: string | null;
  readonly workspaceId: string;
}

/**
 * One page of `table` in scope; the first asks for the exact count.
 *
 * `or("repository_id.eq.<id>")` would have read the same, but a filter
 * written as a literal is a filter a repository id can inject into. This
 * narrows through the parameterised builder, and only when asked.
 */
function scopedPage<Row>(
  client: SupabaseClient,
  table: string,
  columns: string,
  page: PageRequest,
  scope: ReadScope,
): PageQuery<Row> {
  const query = (
    client
      .from(table)
      .select(
        columns,
        page.count ? { count: "exact" } : undefined,
      ) as unknown as PageQuery<Row>
  ).eq("workspace_id", scope.workspaceId);
  return scope.repositoryId
    ? query.eq("repository_id", scope.repositoryId)
    : query;
}

/**
 * Every row of `table` in scope, in id order: each page continues after the
 * last id until the count the first page was given is in hand. A table
 * under the server's cap is still one request, and every page carries the
 * scope and `narrow`.
 *
 * Id order is not time order — an id takes the clock when its row is
 * written, `created_at` when its transaction began, and a run is created
 * when it is queued but started when it runs — and it need not be:
 * `computePilotStats` orders the receipts by `created_at` and the runs by
 * `started_at` itself, and pack requests are only counted and summed.
 */
function readEveryRow<Row extends { readonly id: string }>(
  client: SupabaseClient,
  table: string,
  columns: string,
  scope: ReadScope,
  narrow: (query: PageQuery<Row>) => PageQuery<Row> = (query) => query,
): Promise<PagedRows<Row>> {
  return readByIdPages<Row>((page) => {
    const query = narrow(scopedPage<Row>(client, table, columns, page, scope));
    return (page.after === null ? query : query.gt("id", page.after)).order(
      "id",
      { ascending: true },
    );
  }, EVERY_ROW);
}

/**
 * Every `usage_daily` row in scope — the aggregate todo 23 built. Read
 * rather than recomputed here: it is derived from the rows so retention
 * prunes it, and a second summation in this file would be a second answer
 * to the same question.
 *
 * A view has no id to continue after. A row is one repository's UTC day, or
 * the day's calls with no repository, so pages go in (day, repository)
 * order and each continues from the day the last one ended on — that day's
 * other repositories may not have fit — dropping the rows already read.
 * That pair is the row's key, and the cursor `readByIdPages` carries. The
 * order serves the paging only: the report sums the days and counts them.
 */
function readEveryUsageDay(
  client: SupabaseClient,
  scope: ReadScope,
): Promise<PagedRows<UsageDayRow & { readonly id: string }>> {
  const read = new Set<string>();
  return readByIdPages<UsageDayRow & { readonly id: string }>(async (page) => {
    const query = scopedPage<UsageDayRow>(
      client,
      "usage_daily",
      "day,repository_id,served_calls,served_measured_calls,served_response_chars,served_estimated_tokens,reported_reports,reported_input_tokens,reported_output_tokens,reported_cache_read_tokens,reported_cache_creation_tokens",
      page,
      scope,
    );
    const answer = await (
      page.after === null
        ? query
        : query.gte("day", (JSON.parse(page.after) as [string])[0])
    )
      .order("day", { ascending: true })
      .order("repository_id", { ascending: true, nullsFirst: true });
    if (answer.error) return { ...answer, data: null };
    const rows = (answer.data ?? []).map((row) => ({
      ...row,
      id: JSON.stringify([row.day, row.repository_id]),
    }));
    const fresh = rows.filter((row) => !read.has(row.id));
    if (rows.length > 0 && fresh.length === 0) {
      // One day filled the whole page: a page that starts at that day can
      // never pass it. That takes as many repositories reporting on one day
      // as the server's cap; refused rather than summed short.
      return {
        data: null,
        error: { message: "A usage day holds more rows than one page." },
      };
    }
    for (const row of fresh) read.add(row.id);
    return { ...answer, data: fresh };
  }, EVERY_ROW);
}

/**
 * Phase 4 Wave E todo 24. The filter is applied in the queries, not after
 * them: a total narrowed in the browser is a total that was still computed
 * across every repository, and one of them would be the one the reader was
 * trying to exclude.
 */
export async function loadWorkspacePilotReport(
  client: SupabaseClient,
  userId: string,
  repositoryFilter: string | null = null,
): Promise<WorkspacePilotReport> {
  const workspaceResult = await client
    .from("workspaces")
    .select(
      "id,pilot_instrumentation_enabled,pilot_instrumentation_consented_at",
    )
    .eq("owner_user_id", userId)
    .limit(1)
    .single();
  if (workspaceResult.error || !workspaceResult.data) {
    throw new Error("Personal workspace is unavailable.");
  }

  const workspace = workspaceResult.data as {
    id: string;
    pilot_instrumentation_consented_at: string | null;
    pilot_instrumentation_enabled: boolean;
  };
  if (!workspace.pilot_instrumentation_enabled) {
    return {
      report: buildPilotStatsReport({
        enabled: false,
        packEvents: [],
        receipts: [],
        runs: [],
      }),
      workspaceId: workspace.id,
    };
  }

  const scope = { repositoryId: repositoryFilter, workspaceId: workspace.id };
  const [receiptResult, runResult, packResult, usageResult, repositoryResult] =
    await Promise.all([
      readEveryRow<ReceiptRow>(
        client,
        "receipts",
        // Only the §13 snapshot (RE-04, after B-01). `summary` also carries
        // the whole in-toto statement — 330 receipts were 40,101,144 bytes on
        // the pilot, up to 142,917 each — and the report reads none of it.
        "id,commit_sha,created_at,findings:summary->findings",
        scope,
      ),
      readEveryRow<RunRow>(
        client,
        "runs",
        "id,started_at,completed_at",
        scope,
        (query) => query.eq("status", "succeeded"),
      ),
      readEveryRow<PackEventRow & { readonly id: string }>(
        client,
        "access_events",
        "id,occurred_at,pack_selected_tokens,pack_baseline_tokens",
        scope,
        (query) =>
          query
            .eq("tool", "request_context_pack")
            .gte(
              "occurred_at",
              workspace.pilot_instrumentation_consented_at ??
                "9999-12-31T00:00:00Z",
            ),
      ),
      readEveryUsageDay(client, scope),
      client
        .from("repositories")
        .select("id,full_name")
        .eq("workspace_id", workspace.id)
        .order("full_name", { ascending: true }),
    ]);
  if (
    receiptResult.error ||
    runResult.error ||
    packResult.error ||
    usageResult.error ||
    repositoryResult.error
  ) {
    throw new Error("Pilot stats are unavailable.");
  }

  return {
    report: buildPilotStatsReport({
      enabled: true,
      packEvents: packResult.data,
      receipts: receiptResult.data,
      repositories: (
        (repositoryResult.data ?? []) as { full_name: string; id: string }[]
      ).map(({ full_name, id }) => ({ fullName: full_name, id })),
      repositoryFilter,
      runs: runResult.data,
      usage: usageResult.data,
    }),
    workspaceId: workspace.id,
  };
}
