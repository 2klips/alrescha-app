import { pathToFileURL } from "node:url";

import postgres from "postgres";

/**
 * Read-only production health probe for the operations items in
 * `docs/DEPLOYMENT_CHECKLIST.md`. It adds no credential: it reads the same
 * `DATABASE_URL` the worker already holds and writes nothing.
 *
 * It deliberately covers only signals the database can actually see. Rejected
 * webhooks (4xx/5xx, invalid signatures) and cross-tenant RLS denials never
 * reach storage, so those stay log-side watches — see the monitoring section of
 * `docs/DEPLOYMENT_RUNBOOK.md`. Nothing here reads a payload, a prompt, a token
 * or a provider key; only counts and timestamps leave the database.
 */

export type OpsHealthLevel = "alert" | "ok" | "warn";

export interface OpsHealthSnapshot {
  /** Access events already past their workspace retention window. */
  readonly accessEventsOverdue: number;
  /** `scan_requested` audit rows — one per scan job when the trigger holds. */
  readonly auditedScanRequests: number;
  /** Age in hours of the newest accepted webhook delivery, null if none. */
  readonly newestDeliveryAgeHours: number | null;
  /**
   * Jobs in the terminal `failed` state — attempts exhausted, or rejected by
   * the worker at any attempt (schema-invalid AI output, credits unavailable)
   * — within the last `PERMANENT_FAILURE_WINDOW_DAYS` days by `completed_at`.
   */
  readonly permanentlyFailedJobs: number;
  /** Jobs queued or running. */
  readonly queueDepth: number;
  /** Reserved credits never settled or refunded. */
  readonly reservationsUnresolved: number;
  /** Scan jobs — the population the audit trigger must cover. */
  readonly scanJobs: number;
  /** Jobs holding a lease that has already expired. */
  readonly staleLeases: number;
}

export interface OpsHealthThresholds {
  readonly deliverySilenceWarnHours: number;
  readonly permanentFailureWarn: number;
  readonly queueDepthWarn: number;
}

export interface OpsHealthCheck {
  readonly detail: string;
  readonly level: OpsHealthLevel;
  readonly name: string;
  readonly value: number | null;
}

export interface OpsHealthReport {
  readonly checks: readonly OpsHealthCheck[];
  readonly status: OpsHealthLevel;
}

export interface OpsHealthRow {
  readonly access_events_overdue: number | string;
  readonly audited_scan_requests: number | string;
  readonly newest_delivery_age_hours: number | string | null;
  readonly permanently_failed_jobs: number | string;
  readonly queue_depth: number | string;
  readonly reservations_unresolved: number | string;
  readonly scan_jobs: number | string;
  readonly stale_leases: number | string;
}

/**
 * How far back `permanent-failures` looks. A permanent failure stops counting
 * once its `completed_at` — stamped by every terminal path: `finish_job` with
 * attempts exhausted, `reject_job`, `reap_stale_jobs` — is older than this,
 * so the check recovers on its own after a root cause is fixed: no row has to
 * be withdrawn by hand, and the threshold does not move. Seven days is an
 * assumption, not a measurement. The runbook runs the probe once a day, so a
 * burst stays visible across a week of readings (a missed day or a weekend
 * does not lose it), and it matches the GitHub App's seven-day delivery
 * retention, the log-side record an investigation of a failed scan needs.
 *
 * Not a threshold: the snapshot is one fixed statement, and a window it was
 * not read with would make the report line lie about what it counted.
 */
export const PERMANENT_FAILURE_WINDOW_DAYS = 7;

export const DEFAULT_OPS_HEALTH_THRESHOLDS: OpsHealthThresholds = {
  // A push that produced no delivery for a day means the webhook path broke;
  // production has been receiving several a day since 2026-08-27.
  deliverySilenceWarnHours: 24,
  // Production carried exactly one permanent failure in 2026-09-03's window (a
  // truncated provider response, refunded). More than a handful inside
  // `PERMANENT_FAILURE_WINDOW_DAYS` means a provider or a job kind is failing
  // systematically rather than occasionally; six ref-deletion scans in four
  // days (2026-09-09 → 12) is what the warning is for.
  permanentFailureWarn: 5,
  // The drain loop empties the queue in seconds; a standing backlog means the
  // worker is down or wedged.
  queueDepthWarn: 25,
};

/**
 * One statement so the whole snapshot is a single consistent read. Kept as a
 * plain string rather than a tagged template so the tests can run it against
 * the real migrated schema and catch a renamed column; the only value spliced
 * in is the module's own window constant, never input.
 */
export const OPS_HEALTH_SNAPSHOT_QUERY = `
  select
    (
      select count(*)::int
      from public.access_events event
      join public.workspaces workspace
        on workspace.id = event.workspace_id
      where workspace.access_event_retention_days is not null
        and event.occurred_at
          < now() - make_interval(
              days => workspace.access_event_retention_days
            )
    ) as access_events_overdue,
    (
      select count(*)::int from public.security_audit_events
      where action = 'scan_requested'
    ) as audited_scan_requests,
    (
      select extract(epoch from (now() - max(received_at))) / 3600.0
      from public.github_webhook_deliveries
    ) as newest_delivery_age_hours,
    (
      -- 'failed' is terminal in every queue path: finish_job and
      -- reap_stale_jobs write it only once attempts are exhausted, reject_job
      -- writes it at whatever attempt the worker gave up on, and a retry goes
      -- back to 'queued' instead. So no attempt clause belongs here — one
      -- would hide rejections, which stop at attempt 1 of 3.
      select count(*)::int from public.jobs
      where status = 'failed'
        and (
          -- No queue function leaves a failed job unstamped; one that is
          -- stays counted rather than silently ageing out.
          completed_at is null
          or completed_at
            >= now() - make_interval(days => ${PERMANENT_FAILURE_WINDOW_DAYS})
        )
    ) as permanently_failed_jobs,
    (
      select count(*)::int from public.jobs
      where status in ('queued', 'running')
    ) as queue_depth,
    (
      select count(*)::int
      from public.credit_ledger reserved
      where reserved.event = 'reserve'
        and not exists (
          select 1 from public.credit_ledger resolved
          where resolved.workspace_id = reserved.workspace_id
            and resolved.event in ('settle', 'refund')
            and split_part(resolved.idempotency_key, ':', 2)
              = split_part(reserved.idempotency_key, ':', 2)
        )
    ) as reservations_unresolved,
    (
      select count(*)::int from public.jobs where kind = 'scan'
    ) as scan_jobs,
    (
      select count(*)::int from public.jobs
      where status = 'running' and lease_expires_at < now()
    ) as stale_leases
`;

const WORST: readonly OpsHealthLevel[] = ["ok", "warn", "alert"];

function worst(levels: readonly OpsHealthLevel[]): OpsHealthLevel {
  return levels.reduce<OpsHealthLevel>(
    (carried, level) =>
      WORST.indexOf(level) > WORST.indexOf(carried) ? level : carried,
    "ok",
  );
}

export function toOpsHealthSnapshot(
  row: OpsHealthRow | undefined,
): OpsHealthSnapshot {
  const age = row?.newest_delivery_age_hours;
  return {
    accessEventsOverdue: Number(row?.access_events_overdue ?? 0),
    auditedScanRequests: Number(row?.audited_scan_requests ?? 0),
    newestDeliveryAgeHours:
      age === null || age === undefined ? null : Number(age),
    permanentlyFailedJobs: Number(row?.permanently_failed_jobs ?? 0),
    queueDepth: Number(row?.queue_depth ?? 0),
    reservationsUnresolved: Number(row?.reservations_unresolved ?? 0),
    scanJobs: Number(row?.scan_jobs ?? 0),
    staleLeases: Number(row?.stale_leases ?? 0),
  };
}

export function evaluateOpsHealth(
  snapshot: OpsHealthSnapshot,
  thresholds: OpsHealthThresholds = DEFAULT_OPS_HEALTH_THRESHOLDS,
): OpsHealthReport {
  const missingAudits = snapshot.scanJobs - snapshot.auditedScanRequests;
  const checks: readonly OpsHealthCheck[] = [
    {
      detail:
        snapshot.accessEventsOverdue === 0
          ? "No access event is past its workspace retention window."
          : `${snapshot.accessEventsOverdue} access event(s) outlived retention — the daily prune job is not running.`,
      level: snapshot.accessEventsOverdue === 0 ? "ok" : "alert",
      name: "access-event-retention",
      value: snapshot.accessEventsOverdue,
    },
    {
      detail:
        missingAudits <= 0
          ? `Every one of ${snapshot.scanJobs} scan job(s) has its audit row.`
          : `${missingAudits} scan job(s) have no audit row — audit writes are being lost.`,
      level: missingAudits <= 0 ? "ok" : "alert",
      name: "audit-write-coverage",
      value: missingAudits,
    },
    {
      detail:
        snapshot.staleLeases === 0
          ? "No job is holding an expired lease."
          : `${snapshot.staleLeases} job(s) hold an expired lease — a worker died mid-job.`,
      level: snapshot.staleLeases === 0 ? "ok" : "alert",
      name: "stale-leases",
      value: snapshot.staleLeases,
    },
    {
      detail:
        snapshot.reservationsUnresolved === 0
          ? "Every credit reservation settled or refunded."
          : `${snapshot.reservationsUnresolved} credit reservation(s) neither settled nor refunded.`,
      level: snapshot.reservationsUnresolved === 0 ? "ok" : "alert",
      name: "credit-reservations",
      value: snapshot.reservationsUnresolved,
    },
    {
      detail: `${snapshot.queueDepth} job(s) queued or running (warn above ${thresholds.queueDepthWarn}).`,
      level: snapshot.queueDepth > thresholds.queueDepthWarn ? "warn" : "ok",
      name: "queue-depth",
      value: snapshot.queueDepth,
    },
    {
      detail: `${snapshot.permanentlyFailedJobs} job(s) failed permanently in the last ${PERMANENT_FAILURE_WINDOW_DAYS} days — attempts exhausted or rejected (warn above ${thresholds.permanentFailureWarn}; older failures no longer count).`,
      level:
        snapshot.permanentlyFailedJobs > thresholds.permanentFailureWarn
          ? "warn"
          : "ok",
      name: "permanent-failures",
      value: snapshot.permanentlyFailedJobs,
    },
    {
      detail:
        snapshot.newestDeliveryAgeHours === null
          ? "No webhook delivery has ever been accepted."
          : `Newest accepted delivery is ${snapshot.newestDeliveryAgeHours.toFixed(1)}h old (warn above ${thresholds.deliverySilenceWarnHours}h).`,
      level:
        snapshot.newestDeliveryAgeHours === null ||
        snapshot.newestDeliveryAgeHours > thresholds.deliverySilenceWarnHours
          ? "warn"
          : "ok",
      name: "webhook-delivery-freshness",
      value: snapshot.newestDeliveryAgeHours,
    },
  ];

  return { checks, status: worst(checks.map(({ level }) => level)) };
}

export function formatOpsHealthReport(report: OpsHealthReport): string {
  const rows = report.checks.map(
    ({ detail, level, name }) =>
      `${level.toUpperCase().padEnd(5)} ${name} — ${detail}`,
  );
  return [...rows, `status: ${report.status}`].join("\n");
}

export async function readOpsHealthSnapshot(
  databaseUrl: string,
): Promise<OpsHealthSnapshot> {
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const rows = await sql.unsafe<OpsHealthRow[]>(OPS_HEALTH_SNAPSHOT_QUERY);
    return toOpsHealthSnapshot(rows[0]);
  } finally {
    await sql.end();
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const report = evaluateOpsHealth(await readOpsHealthSnapshot(databaseUrl));
  process.stdout.write(`${formatOpsHealthReport(report)}\n`);
  process.exitCode = report.status === "ok" ? 0 : 1;
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  await main();
}
