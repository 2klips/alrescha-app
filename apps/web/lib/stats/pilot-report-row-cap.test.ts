import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, test } from "vitest";

import { loadWorkspacePilotReport } from "./pilot-report";

/**
 * RE-04 — the pilot report past the server's row cap.
 *
 * PostgREST answers with at most `max_rows` rows and says nothing about it:
 * 1,000 in `supabase/config.toml`, the hosted value unread. The report is
 * defined across the whole receipt chain (BUILD_PLAN 18), and each of its
 * reads asked for every row oldest first, so a capped answer kept the oldest
 * and dropped the newest: the latest open total, the latest scan, the newest
 * pack requests and usage days.
 *
 * The cap here is 3 so a seven-row fixture crosses it twice; the rule is
 * the same at 1,000.
 */

type Row = Readonly<Record<string, unknown>>;

interface Order {
  readonly ascending: boolean;
  readonly column: string;
  readonly nullsFirst: boolean;
}

interface Answer {
  readonly count: number | null;
  readonly data: Row[];
  readonly error: null;
  readonly status: number;
}

function compare(left: unknown, right: unknown, order: Order): number {
  if (left === right) return 0;
  if (left === null || left === undefined) return order.nullsFirst ? -1 : 1;
  if (right === null || right === undefined) return order.nullsFirst ? 1 : -1;
  const sign = order.ascending ? 1 : -1;
  return String(left) < String(right) ? -sign : sign;
}

/**
 * One request to a server that stops at `maxRows` rows, the way PostgREST
 * stops at `max_rows`: the filters and the order apply to the whole table,
 * then the answer is cut without a word, and the exact count comes back
 * only when the select asked for it.
 */
class CappedRequest {
  readonly calls: { args: unknown[]; method: string }[] = [];
  #count = false;
  readonly #filters: ((row: Row) => boolean)[] = [];
  #limit = Number.POSITIVE_INFINITY;
  readonly #order: Order[] = [];

  constructor(
    private readonly rows: readonly Row[],
    private readonly maxRows: number,
  ) {}

  #record(method: string, args: unknown[]): this {
    this.calls.push({ args, method });
    return this;
  }

  /** The arguments of every call to `method`, in order. */
  argsOf(method: string): unknown[][] {
    return this.calls
      .filter((call) => call.method === method)
      .map(({ args }) => args);
  }

  select(columns: string, options?: { count?: string }) {
    this.#count = options?.count === "exact";
    return this.#record("select", [columns, options]);
  }

  eq(column: string, value: unknown) {
    this.#filters.push((row) => row[column] === value);
    return this.#record("eq", [column, value]);
  }

  gt(column: string, value: string) {
    this.#filters.push((row) => {
      const cell = row[column];
      return typeof cell === "string" && cell > value;
    });
    return this.#record("gt", [column, value]);
  }

  gte(column: string, value: string) {
    this.#filters.push((row) => {
      const cell = row[column];
      return typeof cell === "string" && cell >= value;
    });
    return this.#record("gte", [column, value]);
  }

  limit(count: number) {
    this.#limit = count;
    return this.#record("limit", [count]);
  }

  order(
    column: string,
    options: { ascending?: boolean; nullsFirst?: boolean } = {},
  ) {
    const ascending = options.ascending ?? true;
    // PostgreSQL's default: nulls sort as if larger than every value.
    const nullsFirst = options.nullsFirst ?? !ascending;
    this.#order.push({ ascending, column, nullsFirst });
    return this.#record("order", [column, options]);
  }

  #answer(): Answer {
    const matched = this.rows.filter((row) =>
      this.#filters.every((keep) => keep(row)),
    );
    const ordered = [...matched].sort((left, right) => {
      for (const order of this.#order) {
        const result = compare(left[order.column], right[order.column], order);
        if (result !== 0) return result;
      }
      return 0;
    });
    return {
      count: this.#count ? matched.length : null,
      data: ordered.slice(0, Math.min(this.#limit, this.maxRows)),
      error: null,
      status: 200,
    };
  }

  async single() {
    const { data } = this.#answer();
    return data.length === 1
      ? { data: data[0], error: null }
      : { data: null, error: { message: `${data.length} rows` } };
  }

  then<TResult1 = Answer, TResult2 = never>(
    onfulfilled?: ((value: Answer) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.#answer()).then(onfulfilled, onrejected);
  }
}

class CappedServer {
  readonly requests: { request: CappedRequest; table: string }[] = [];

  constructor(
    private readonly tables: Readonly<Record<string, readonly Row[]>>,
    private readonly maxRows: number,
  ) {}

  from(table: string): CappedRequest {
    const request = new CappedRequest(this.tables[table] ?? [], this.maxRows);
    this.requests.push({ request, table });
    return request;
  }

  requestsTo(table: string): CappedRequest[] {
    return this.requests
      .filter((entry) => entry.table === table)
      .map(({ request }) => request);
  }
}

const CAP = 3;
const USER = "user-1";
const WORKSPACE = "workspace-1";
const OTHER_WORKSPACE = "workspace-2";
const REPOSITORY = "repo-a";
const OTHER_REPOSITORY = "repo-b";
const CONSENTED_AT = "2026-09-01T00:00:00.000Z";

/** A ULID-shaped id; `n` orders them. */
const ulid = (n: number) => `01K5${String(n).padStart(22, "0")}`;

/** Noon on `day` of September 2026. */
const onDay = (day: number) =>
  `2026-09-${String(day).padStart(2, "0")}T12:00:00.000Z`;

function receipt(
  id: number,
  day: number,
  [opened, resolved, openTotal]: readonly [number, number, number],
  workspaceId = WORKSPACE,
): Row {
  return {
    commit_sha: String(id % 10).repeat(40),
    created_at: onDay(day),
    findings: { open_total: openTotal, opened, resolved },
    id: ulid(id),
    repository_id: REPOSITORY,
    workspace_id: workspaceId,
  };
}

/**
 * Seven receipts, oldest first. The newest one's id sorts before three older
 * ones': an id takes the clock when its row is written (`clock_timestamp()`,
 * to the millisecond, then random), `created_at` the time its transaction
 * began (`now()`), and the two need not agree. Another workspace's receipt,
 * newer than all of them, is never this report's.
 */
const RECEIPTS: readonly Row[] = [
  receipt(1, 2, [5, 0, 5]),
  receipt(2, 3, [2, 1, 6]),
  receipt(3, 4, [1, 3, 4]),
  receipt(5, 5, [3, 0, 7]),
  receipt(6, 6, [0, 4, 3]),
  receipt(7, 7, [1, 2, 2]),
  receipt(4, 8, [0, 1, 1]),
  receipt(8, 9, [9, 0, 10], OTHER_WORKSPACE),
];

function run(
  id: number,
  day: number,
  durationMs: number,
  status = "succeeded",
  workspaceId = WORKSPACE,
): Row {
  const startedAt = onDay(day);
  return {
    completed_at: new Date(Date.parse(startedAt) + durationMs).toISOString(),
    id: ulid(id),
    repository_id: REPOSITORY,
    started_at: startedAt,
    status,
    workspace_id: workspaceId,
  };
}

/**
 * Seven succeeded scans, oldest first. The newest was queued before three
 * older ones started — ids follow when a run is created, `started_at` when
 * it ran. A failed run and another workspace's are newer still, and neither
 * is a completed scan here.
 */
const RUNS: readonly Row[] = [
  run(11, 2, 5_000),
  run(12, 3, 4_000),
  run(13, 4, 6_000),
  run(15, 5, 3_000),
  run(16, 6, 7_000),
  run(17, 7, 2_000),
  run(14, 8, 1_500),
  run(18, 9, 100, "failed"),
  run(19, 10, 900, "succeeded", OTHER_WORKSPACE),
];

function packEvent(
  id: number,
  occurredAt: string,
  tokens: { baseline: number; selected: number } | null,
  { tool = "request_context_pack", workspaceId = WORKSPACE } = {},
): Row {
  return {
    id: ulid(id),
    occurred_at: occurredAt,
    pack_baseline_tokens: tokens?.baseline ?? null,
    pack_selected_tokens: tokens?.selected ?? null,
    repository_id: REPOSITORY,
    tool,
    workspace_id: workspaceId,
  };
}

const measured = (selected: number) => ({ baseline: 1_000, selected });

/**
 * Seven context-pack requests since consent, oldest first; one carries no
 * measurement and still counts as a request, and the newest has an id that
 * sorts before three older ones'. Requests before consent, another tool's
 * calls and another workspace's request are none of this report's.
 */
const PACK_EVENTS: readonly Row[] = [
  packEvent(19, "2026-08-30T12:00:00.000Z", measured(10)),
  packEvent(20, "2026-08-31T12:00:00.000Z", measured(10)),
  packEvent(21, onDay(2), measured(400)),
  packEvent(22, onDay(3), measured(500)),
  packEvent(23, onDay(4), measured(300)),
  packEvent(25, onDay(5), measured(600)),
  packEvent(26, onDay(6), measured(200)),
  packEvent(27, onDay(7), null),
  packEvent(24, onDay(8), measured(100)),
  packEvent(28, onDay(9), measured(10), { tool: "search_index" }),
  packEvent(29, onDay(10), measured(10), { tool: "search_index" }),
  packEvent(30, onDay(11), measured(10), { workspaceId: OTHER_WORKSPACE }),
];

/**
 * A `usage_daily` row: `n` served calls, and `reports` self-reports of 100
 * input tokens each.
 */
function usageDay(
  n: number,
  day: number,
  repositoryId: string | null,
  reports = 0,
  workspaceId = WORKSPACE,
): Row {
  return {
    day: `2026-09-${String(day).padStart(2, "0")}`,
    repository_id: repositoryId,
    reported_cache_creation_tokens: 0,
    reported_cache_read_tokens: 0,
    reported_input_tokens: 100 * reports,
    reported_output_tokens: 0,
    reported_reports: reports,
    served_calls: n,
    served_estimated_tokens: 100 * n,
    served_measured_calls: n,
    served_response_chars: 400 * n,
    workspace_id: workspaceId,
  };
}

/**
 * Nine usage rows over five days, in (day, repository) order, a day's calls
 * with no repository first. The view has no id, and at a cap of 3 the first
 * page ends inside 2 September. Another workspace's day is none of these.
 */
const USAGE_DAYS: readonly Row[] = [
  usageDay(1, 1, REPOSITORY),
  usageDay(2, 1, OTHER_REPOSITORY, 1),
  usageDay(3, 2, null),
  usageDay(4, 2, REPOSITORY),
  usageDay(5, 3, REPOSITORY, 2),
  usageDay(6, 3, OTHER_REPOSITORY),
  usageDay(7, 4, REPOSITORY),
  usageDay(8, 5, null),
  usageDay(9, 5, REPOSITORY, 3),
  usageDay(50, 6, REPOSITORY, 5, OTHER_WORKSPACE),
];

function server(
  tables: Readonly<Record<string, readonly Row[]>>,
  maxRows = CAP,
): CappedServer {
  return new CappedServer(
    {
      workspaces: [
        {
          id: WORKSPACE,
          owner_user_id: USER,
          pilot_instrumentation_consented_at: CONSENTED_AT,
          pilot_instrumentation_enabled: true,
        },
      ],
      ...tables,
    },
    maxRows,
  );
}

function load(capped: CappedServer, repositoryFilter: string | null = null) {
  return loadWorkspacePilotReport(
    capped as unknown as SupabaseClient,
    USER,
    repositoryFilter,
  );
}

describe("the pilot report past the server's row cap", () => {
  test("counts every receipt of the chain and takes the latest open total from the newest", async () => {
    const { report } = await load(server({ receipts: RECEIPTS }));

    expect(report.evidence.receipts).toBe(7);
    expect(report.findings).toEqual({
      latestOpenTotal: 1,
      netOpenChange: -4,
      opened: 12,
      resolved: 11,
    });
  });

  test("times the newest succeeded scan, not the last one the cap let through", async () => {
    const { report } = await load(server({ runs: RUNS }));

    expect(report.scans).toEqual({
      averageDurationMs: 4_071,
      completedRuns: 7,
      durationChangePercent: -70,
      latestDurationMs: 1_500,
    });
  });

  test("counts every context-pack request since consent and totals its tokens", async () => {
    const { report } = await load(server({ access_events: PACK_EVENTS }));

    expect(report.context).toEqual({
      baselineTokens: 6_000,
      packRequests: 7,
      selectedTokens: 2_100,
      state: "ready",
      tokenReductionPercent: 65,
    });
    expect(report.evidence.packMeasurements).toBe(6);
  });

  test("sums every usage day, several repositories to a day", async () => {
    const { report } = await load(server({ usage_daily: USAGE_DAYS }));

    expect(report.evidence.usageDays).toBe(9);
    expect(report.served).toEqual({
      calls: 45,
      days: 9,
      estimatedTokens: 4_500,
      measuredCalls: 45,
      responseChars: 18_000,
      state: "ready",
    });
    expect(report.reported).toEqual({
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      days: 3,
      inputTokens: 600,
      outputTokens: 0,
      reports: 6,
      state: "ready",
    });
  });

  // Pages of usage continue from a day, so a single day with more rows than
  // one page cannot be read past: that takes as many repositories reporting
  // on one UTC day as the server's cap, 1,000 by default. Refused rather
  // than summed short.
  test("refuses a usage day it cannot read past rather than summing part of it", async () => {
    const crowded = server(
      {
        usage_daily: [
          usageDay(1, 1, null),
          usageDay(2, 1, REPOSITORY),
          usageDay(3, 1, OTHER_REPOSITORY),
          usageDay(4, 2, REPOSITORY),
        ],
      },
      2,
    );

    await expect(load(crowded)).rejects.toThrow("Pilot stats are unavailable.");
  });

  const EVERY_TABLE = {
    access_events: PACK_EVENTS,
    receipts: RECEIPTS,
    runs: RUNS,
    usage_daily: USAGE_DAYS,
  };

  test("asks every page for the workspace, the repository and the read's own filters", async () => {
    const capped = server(EVERY_TABLE);
    await load(capped, REPOSITORY);

    const filters: Record<keyof typeof EVERY_TABLE, unknown[][]> = {
      access_events: [
        ["workspace_id", WORKSPACE],
        ["tool", "request_context_pack"],
        ["repository_id", REPOSITORY],
      ],
      receipts: [
        ["workspace_id", WORKSPACE],
        ["repository_id", REPOSITORY],
      ],
      runs: [
        ["workspace_id", WORKSPACE],
        ["status", "succeeded"],
        ["repository_id", REPOSITORY],
      ],
      usage_daily: [
        ["workspace_id", WORKSPACE],
        ["repository_id", REPOSITORY],
      ],
    };
    for (const [table, wanted] of Object.entries(filters)) {
      const pages = capped.requestsTo(table);
      // Not a tautology: one page would pass everything below.
      expect({ pages: pages.length > 1, table }).toEqual({
        pages: true,
        table,
      });
      for (const page of pages) {
        expect({ eq: page.argsOf("eq"), table }).toEqual({
          eq: expect.arrayContaining(wanted),
          table,
        });
      }
    }
    for (const page of capped.requestsTo("access_events")) {
      expect(page.argsOf("gte")).toEqual([["occurred_at", CONSENTED_AT]]);
    }
  });

  test("reads a table under the cap in one request", async () => {
    const roomy = server(EVERY_TABLE, 1_000);
    await load(roomy);

    for (const table of Object.keys(EVERY_TABLE)) {
      expect({ requests: roomy.requestsTo(table).length, table }).toEqual({
        requests: 1,
        table,
      });
    }
  });

  test("reports the same under the cap as with none", async () => {
    const capped = await load(server(EVERY_TABLE));
    const whole = await load(server(EVERY_TABLE, Number.POSITIVE_INFINITY));

    expect(capped).toEqual(whole);
  });
});
