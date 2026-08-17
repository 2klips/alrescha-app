import {
  computePilotStats,
  type PilotPackMeasurement,
  type PilotReceiptSnapshot,
  type PilotRunMeasurement,
  type PilotStatsReport,
} from "@arr/core/stats";
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

export interface PilotStatsRows {
  readonly enabled: boolean;
  readonly packEvents: readonly PackEventRow[];
  readonly receipts: readonly ReceiptRow[];
  readonly runs: readonly RunRow[];
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

export async function loadWorkspacePilotReport(
  client: SupabaseClient,
  userId: string,
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

  const [receiptResult, runResult, packResult] = await Promise.all([
    client
      .from("receipts")
      .select("id,commit_sha,created_at,summary")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: true }),
    client
      .from("runs")
      .select("id,started_at,completed_at")
      .eq("workspace_id", workspace.id)
      .eq("status", "succeeded")
      .order("started_at", { ascending: true }),
    client
      .from("access_events")
      .select("occurred_at,pack_selected_tokens,pack_baseline_tokens")
      .eq("workspace_id", workspace.id)
      .eq("tool", "request_context_pack")
      .gte(
        "occurred_at",
        workspace.pilot_instrumentation_consented_at ?? "9999-12-31T00:00:00Z",
      )
      .order("occurred_at", { ascending: true }),
  ]);
  if (receiptResult.error || runResult.error || packResult.error) {
    throw new Error("Pilot stats are unavailable.");
  }

  return {
    report: buildPilotStatsReport({
      enabled: true,
      packEvents: (packResult.data ?? []) as PackEventRow[],
      receipts: (receiptResult.data ?? []) as ReceiptRow[],
      runs: (runResult.data ?? []) as RunRow[],
    }),
    workspaceId: workspace.id,
  };
}
