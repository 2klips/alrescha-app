import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  DEFAULT_OPS_HEALTH_THRESHOLDS,
  OPS_HEALTH_SNAPSHOT_QUERY,
  type OpsHealthRow,
  type OpsHealthSnapshot,
  evaluateOpsHealth,
  formatOpsHealthReport,
  toOpsHealthSnapshot,
} from "../scripts/ops-health";

import { ALL_MIGRATIONS, createTestDatabase } from "./helpers/database";

/** The shape production reported on 2026-09-03: every check ok. */
const HEALTHY: OpsHealthSnapshot = {
  accessEventsOverdue: 0,
  auditedScanRequests: 35,
  newestDeliveryAgeHours: 0.5,
  permanentlyFailedJobs: 1,
  queueDepth: 0,
  reservationsUnresolved: 0,
  scanJobs: 35,
  staleLeases: 0,
};

const USER = "55555555-5555-4555-8555-555555555555";
const INSTALLATION_ID = "01J000000000000000000000PS";
const REPOSITORY_ID = "01J000000000000000000000PT";
const RUN_ID = "01J000000000000000000000PV";

function levelOf(snapshot: OpsHealthSnapshot, name: string) {
  return evaluateOpsHealth(snapshot).checks.find((check) => check.name === name)
    ?.level;
}

describe("operations health evaluation", () => {
  it("reports ok for the measured production shape", () => {
    const report = evaluateOpsHealth(HEALTHY);

    expect(report.status).toBe("ok");
    expect(report.checks.every(({ level }) => level === "ok")).toBe(true);
  });

  it("alerts when retention outlives the daily prune job", () => {
    expect(
      levelOf({ ...HEALTHY, accessEventsOverdue: 1 }, "access-event-retention"),
    ).toBe("alert");
  });

  it("alerts when a scan job has no audit row", () => {
    expect(
      levelOf({ ...HEALTHY, auditedScanRequests: 34 }, "audit-write-coverage"),
    ).toBe("alert");
  });

  it("alerts on expired leases and unresolved reservations", () => {
    expect(levelOf({ ...HEALTHY, staleLeases: 2 }, "stale-leases")).toBe(
      "alert",
    );
    expect(
      levelOf({ ...HEALTHY, reservationsUnresolved: 1 }, "credit-reservations"),
    ).toBe("alert");
  });

  it("warns rather than alerts on backlog, failures, and webhook silence", () => {
    const { deliverySilenceWarnHours, permanentFailureWarn, queueDepthWarn } =
      DEFAULT_OPS_HEALTH_THRESHOLDS;

    expect(
      levelOf({ ...HEALTHY, queueDepth: queueDepthWarn + 1 }, "queue-depth"),
    ).toBe("warn");
    expect(
      levelOf({ ...HEALTHY, queueDepth: queueDepthWarn }, "queue-depth"),
    ).toBe("ok");
    expect(
      levelOf(
        { ...HEALTHY, permanentlyFailedJobs: permanentFailureWarn + 1 },
        "permanent-failures",
      ),
    ).toBe("warn");
    expect(
      levelOf(
        { ...HEALTHY, newestDeliveryAgeHours: deliverySilenceWarnHours + 1 },
        "webhook-delivery-freshness",
      ),
    ).toBe("warn");
    expect(
      levelOf(
        { ...HEALTHY, newestDeliveryAgeHours: null },
        "webhook-delivery-freshness",
      ),
    ).toBe("warn");
  });

  it("escalates the overall status to the worst check", () => {
    expect(evaluateOpsHealth({ ...HEALTHY, queueDepth: 1000 }).status).toBe(
      "warn",
    );
    expect(
      evaluateOpsHealth({ ...HEALTHY, queueDepth: 1000, staleLeases: 1 })
        .status,
    ).toBe("alert");
  });

  it("formats one line per check plus a status line", () => {
    const lines = formatOpsHealthReport(evaluateOpsHealth(HEALTHY)).split("\n");

    expect(lines).toHaveLength(8);
    expect(lines.at(-1)).toBe("status: ok");
    expect(lines[0]).toContain("access-event-retention");
  });
});

describe("operations health snapshot query", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let workspace: string;

  const snapshot = async () => {
    const result = await database.query<OpsHealthRow>(
      OPS_HEALTH_SNAPSHOT_QUERY,
    );
    return toOpsHealthSnapshot(result.rows[0]);
  };

  beforeAll(async () => {
    database = await createTestDatabase(ALL_MIGRATIONS);
    await database.query(
      "insert into auth.users (id, email) values ($1, 'ops@example.test')",
      [USER],
    );
    const workspaces = await database.query<{ id: string }>(
      "select id from public.workspaces where owner_user_id = $1",
      [USER],
    );
    workspace = workspaces.rows[0]?.id ?? "";
  });

  afterAll(async () => database.close());

  it("reads a fresh deployment as an all-zero snapshot", async () => {
    expect(await snapshot()).toEqual({
      accessEventsOverdue: 0,
      auditedScanRequests: 0,
      newestDeliveryAgeHours: null,
      permanentlyFailedJobs: 0,
      queueDepth: 0,
      reservationsUnresolved: 0,
      scanJobs: 0,
      staleLeases: 0,
    });
  });

  it("counts a queued scan job and the audit row its trigger writes", async () => {
    await database.query(
      `insert into public.github_installations
        (id, workspace_id, github_installation_id, account_id, account_login)
       values ($1, $2, 909, 9090, 'alrescha')`,
      [INSTALLATION_ID, workspace],
    );
    await database.query(
      `insert into public.repositories
        (id, workspace_id, full_name, installation_id, github_repository_id, selected_at)
       values ($1, $2, 'alrescha/ops-health', $3, 909090, now())`,
      [REPOSITORY_ID, workspace, INSTALLATION_ID],
    );
    await database.query(
      `insert into public.runs
        (id, workspace_id, repository_id, trigger_kind, trigger_key, commit_sha)
       values ($1, $2, $3, 'manual', 'ops-health', $4)`,
      [RUN_ID, workspace, REPOSITORY_ID, "2".repeat(40)],
    );
    await database.query(
      `insert into public.jobs
        (workspace_id, repository_id, run_id, kind, idempotency_key)
       values ($1, $2, $3, 'scan', 'ops-health-scan')`,
      [workspace, REPOSITORY_ID, RUN_ID],
    );

    const current = await snapshot();

    expect(current.queueDepth).toBe(1);
    expect(current.scanJobs).toBe(1);
    // The audit trigger fired, so the coverage check stays ok.
    expect(current.auditedScanRequests).toBe(1);
    expect(evaluateOpsHealth(current).status).toBe("warn");
    expect(levelOf(current, "audit-write-coverage")).toBe("ok");
  });

  it("sees an expired lease, an overdue access event, and an open reservation", async () => {
    await database.query(
      `update public.jobs
       set status = 'running', claimed_at = now() - interval '2 hours',
           lease_expires_at = now() - interval '1 hour'
       where idempotency_key = 'ops-health-scan'`,
    );
    await database.query(
      `insert into public.mcp_tokens
        (id, workspace_id, token_hash, token_prefix, created_by)
       values ('01J000000000000000000000PW', $1, 'ops-health-token', 'sp_ops', $2)`,
      [workspace, USER],
    );
    await database.query(
      `insert into public.access_events (id, workspace_id, token_id, tool, occurred_at)
       values ('01J000000000000000000000PX', $1, '01J000000000000000000000PW', 'search_index', now() - interval '31 days')`,
      [workspace],
    );
    await database.query(
      `insert into public.credit_ledger (workspace_id, event, amount, idempotency_key)
       values ($1, 'reserve', -10, 'reserve:ops-health-open')`,
      [workspace],
    );

    const current = await snapshot();

    expect(current.staleLeases).toBe(1);
    expect(current.accessEventsOverdue).toBe(1);
    expect(current.reservationsUnresolved).toBe(1);
    expect(evaluateOpsHealth(current).status).toBe("alert");
  });

  it("clears the reservation check once the matching settle lands", async () => {
    await database.query(
      `insert into public.credit_ledger (workspace_id, event, amount, idempotency_key)
       values ($1, 'settle', 0, 'settle:ops-health-open')`,
      [workspace],
    );

    expect((await snapshot()).reservationsUnresolved).toBe(0);
  });
});
