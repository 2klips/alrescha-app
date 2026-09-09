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

interface ReceiptRow {
  readonly commit_sha: string;
  readonly created_at: string;
  readonly id: string;
  readonly summary: unknown;
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
  const findings = record(record(row.summary).findings);
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

  // `or("repository_id.eq.<id>")` would have read the same, but a filter
  // written as a literal is a filter a repository id can inject into. This
  // narrows through the parameterised builder, and only when asked.
  const receiptQuery = client
    .from("receipts")
    .select("id,commit_sha,created_at,summary")
    .eq("workspace_id", workspace.id);
  const runQuery = client
    .from("runs")
    .select("id,started_at,completed_at")
    .eq("workspace_id", workspace.id)
    .eq("status", "succeeded");
  const packQuery = client
    .from("access_events")
    .select("occurred_at,pack_selected_tokens,pack_baseline_tokens")
    .eq("workspace_id", workspace.id)
    .eq("tool", "request_context_pack")
    .gte(
      "occurred_at",
      workspace.pilot_instrumentation_consented_at ?? "9999-12-31T00:00:00Z",
    );
  // The aggregate todo 23 built. Read rather than recomputed here: it is
  // derived from the rows so retention prunes it, and a second summation in
  // this file would be a second answer to the same question.
  const usageQuery = client
    .from("usage_daily")
    .select(
      "day,repository_id,served_calls,served_measured_calls,served_response_chars,served_estimated_tokens,reported_reports,reported_input_tokens,reported_output_tokens,reported_cache_read_tokens,reported_cache_creation_tokens",
    )
    .eq("workspace_id", workspace.id);

  const [receiptResult, runResult, packResult, usageResult, repositoryResult] =
    await Promise.all([
      (repositoryFilter
        ? receiptQuery.eq("repository_id", repositoryFilter)
        : receiptQuery
      ).order("created_at", { ascending: true }),
      (repositoryFilter
        ? runQuery.eq("repository_id", repositoryFilter)
        : runQuery
      ).order("started_at", { ascending: true }),
      (repositoryFilter
        ? packQuery.eq("repository_id", repositoryFilter)
        : packQuery
      ).order("occurred_at", { ascending: true }),
      (repositoryFilter
        ? usageQuery.eq("repository_id", repositoryFilter)
        : usageQuery
      ).order("day", { ascending: true }),
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
      packEvents: (packResult.data ?? []) as PackEventRow[],
      receipts: (receiptResult.data ?? []) as ReceiptRow[],
      repositories: (
        (repositoryResult.data ?? []) as { full_name: string; id: string }[]
      ).map(({ full_name, id }) => ({ fullName: full_name, id })),
      repositoryFilter,
      runs: (runResult.data ?? []) as RunRow[],
      usage: (usageResult.data ?? []) as UsageDayRow[],
    }),
    workspaceId: workspace.id,
  };
}
