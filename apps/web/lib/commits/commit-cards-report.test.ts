import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  buildWorkspaceCommitCards,
  loadWorkspaceCommitCards,
  receiptFindings,
} from "./commit-cards-report";

describe("receiptFindings", () => {
  it("reads the WORK_SPEC §13 findings snapshot", () => {
    expect(
      receiptFindings({
        findings: { open_total: 7, opened: ["a", "b", "c"], resolved: ["d"] },
      }),
    ).toEqual({ opened: 3, openTotal: 7, resolved: 1 });
  });

  it.each([
    ["null", null],
    ["no findings key", {}],
    [
      "opened is not a list",
      { findings: { open_total: 1, opened: 3, resolved: [] } },
    ],
    [
      "open_total is not a number",
      { findings: { open_total: "7", opened: [], resolved: [] } },
    ],
  ])("yields null for a malformed summary (%s)", (_label, summary) => {
    expect(receiptFindings(summary)).toBeNull();
  });
});

describe("buildWorkspaceCommitCards", () => {
  it("maps snake_case rows into ordered cards", () => {
    const cards = buildWorkspaceCommitCards({
      jobs: [
        {
          claimed_at: "2026-08-17T08:00:01.000Z",
          completed_at: "2026-08-17T08:00:11.000Z",
          kind: "scan",
          last_error: null,
          run_id: "run-1",
          status: "succeeded",
        },
        {
          claimed_at: "2026-08-17T08:00:12.000Z",
          completed_at: "2026-08-17T08:00:31.000Z",
          kind: "analyze",
          last_error: "vitest report artifact was unreadable",
          run_id: "run-1",
          status: "failed",
        },
        // A judge job of another run and a row with an unknown kind are both
        // tolerated without corrupting the cards.
        {
          claimed_at: null,
          completed_at: null,
          kind: "mystery",
          last_error: null,
          run_id: "run-1",
          status: "queued",
        },
      ],
      receipts: [
        {
          commit_sha: "b".repeat(40),
          findings: { open_total: 4, opened: ["f1"], resolved: [] },
          id: "receipt-9",
          run_id: "run-2",
        },
      ],
      repositories: [{ full_name: "2klips/alrescha-app", id: "repo-1" }],
      runs: [
        {
          commit_sha: "a".repeat(40),
          created_at: "2026-08-17T08:00:00.000Z",
          id: "run-1",
          repository_id: "repo-1",
          trigger_kind: "push",
        },
        {
          commit_sha: "b".repeat(40),
          created_at: "2026-08-17T09:00:00.000Z",
          id: "run-2",
          repository_id: "repo-1",
          trigger_kind: "check_run",
        },
      ],
    });

    expect(cards.map(({ runId }) => runId)).toEqual(["run-2", "run-1"]);
    expect(cards[0]).toMatchObject({
      findingsDelta: { opened: 1, openTotal: 4, resolved: 0 },
      receiptId: "receipt-9",
      repository: "2klips/alrescha-app",
      status: "pending",
    });
    expect(cards[1]).toMatchObject({
      durationMs: 30_000,
      failureReason: "vitest report artifact was unreadable",
      status: "failed",
    });
    expect(cards[1]!.jobs.map(({ kind }) => kind)).toEqual(["scan", "analyze"]);
  });

  it("keeps the repository id visible when the repository row is missing", () => {
    const cards = buildWorkspaceCommitCards({
      jobs: [],
      receipts: [],
      repositories: [],
      runs: [
        {
          commit_sha: "c".repeat(40),
          created_at: "2026-08-17T08:00:00.000Z",
          id: "run-1",
          repository_id: "repo-unknown",
          trigger_kind: "manual",
        },
      ],
    });
    expect(cards[0]!.repository).toBe("repo-unknown");
  });

  // A receipt row carries `summary->findings`: null when the summary has no
  // snapshot or is not an object, the snapshot itself otherwise. Each gives
  // the card what `receiptFindings` gives for the whole summary.
  it.each([
    [
      "a well-formed snapshot",
      { open_total: 7, opened: ["a", "b", "c"], resolved: ["d"] },
      { opened: 3, openTotal: 7, resolved: 1 },
    ],
    ["no snapshot", null, null],
    ["a snapshot that is not an object", "7", null],
    ["opened is not a list", { open_total: 1, opened: 3, resolved: [] }, null],
    [
      "open_total is not a number",
      { open_total: "7", opened: [], resolved: [] },
      null,
    ],
  ])(
    "reads the selected snapshot as the summary's (%s)",
    (_label, findings, delta) => {
      const [card] = buildWorkspaceCommitCards({
        jobs: [],
        receipts: [
          {
            commit_sha: "a".repeat(40),
            findings,
            id: "receipt-1",
            run_id: "run-1",
          },
        ],
        repositories: [],
        runs: [
          {
            commit_sha: "a".repeat(40),
            created_at: "2026-08-17T08:00:00.000Z",
            id: "run-1",
            repository_id: "repo-1",
            trigger_kind: "push",
          },
        ],
      });
      expect(card?.receiptId).toBe("receipt-1");
      expect(card?.findingsDelta).toEqual(delta);
      expect(receiptFindings({ findings })).toEqual(delta);
    },
  );
});

/**
 * A `.from(table)` chain: records its calls and resolves the table's rows
 * from `.single()` or when awaited — the two ways the loader ends a query.
 */
class FakeQuery {
  readonly calls: { args: unknown[]; method: string }[] = [];

  constructor(private readonly data: unknown) {}

  #record(method: string, args: unknown[]): this {
    this.calls.push({ args, method });
    return this;
  }

  argsOf(method: string): unknown[] | undefined {
    return this.calls.find((call) => call.method === method)?.args;
  }

  eq(...args: unknown[]) {
    return this.#record("eq", args);
  }

  in(...args: unknown[]) {
    return this.#record("in", args);
  }

  limit(...args: unknown[]) {
    return this.#record("limit", args);
  }

  order(...args: unknown[]) {
    return this.#record("order", args);
  }

  select(...args: unknown[]) {
    return this.#record("select", args);
  }

  async single() {
    return { data: this.data, error: null };
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?:
      | ((value: {
          data: unknown;
          error: null;
        }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: this.data, error: null }).then(
      onfulfilled,
      onrejected,
    );
  }
}

class FakeClient {
  readonly queries: { query: FakeQuery; table: string }[] = [];

  constructor(private readonly rows: Readonly<Record<string, unknown>>) {}

  from(table: string): FakeQuery {
    const query = new FakeQuery(this.rows[table] ?? []);
    this.queries.push({ query, table });
    return query;
  }

  queriesOf(table: string): FakeQuery[] {
    return this.queries
      .filter((entry) => entry.table === table)
      .map(({ query }) => query);
  }
}

describe("loadWorkspaceCommitCards", () => {
  it("reads each receipt's findings snapshot, never the whole summary", async () => {
    const client = new FakeClient({
      receipts: [
        {
          commit_sha: "b".repeat(40),
          findings: { open_total: 4, opened: ["f1"], resolved: [] },
          id: "receipt-9",
          run_id: "run-2",
        },
        // What `summary->findings` is for a summary without a snapshot.
        {
          commit_sha: "a".repeat(40),
          findings: null,
          id: "receipt-8",
          run_id: "run-1",
        },
      ],
      repositories: [{ full_name: "2klips/alrescha-app", id: "repo-1" }],
      runs: [
        {
          commit_sha: "b".repeat(40),
          created_at: "2026-08-17T09:00:00.000Z",
          id: "run-2",
          repository_id: "repo-1",
          trigger_kind: "check_run",
        },
        {
          commit_sha: "a".repeat(40),
          created_at: "2026-08-17T08:00:00.000Z",
          id: "run-1",
          repository_id: "repo-1",
          trigger_kind: "push",
        },
      ],
      workspaces: { id: "workspace-1" },
    });

    const { cards, workspaceId } = await loadWorkspaceCommitCards(
      client as unknown as SupabaseClient,
      "user-1",
    );

    // `summary` also carries the whole in-toto statement — 330 receipts were
    // 40,101,144 bytes on the pilot — and a card needs only the snapshot.
    const receipts = client.queriesOf("receipts");
    expect(receipts.map((query) => query.argsOf("select")?.[0])).toEqual([
      "id,run_id,commit_sha,findings:summary->findings",
    ]);
    // Whatever this select gains later, `summary` stays behind that path.
    expect(
      String(receipts[0]?.argsOf("select")?.[0]).replaceAll(
        "summary->findings",
        "",
      ),
    ).not.toContain("summary");
    expect(receipts[0]?.argsOf("eq")).toEqual(["workspace_id", "workspace-1"]);
    expect(receipts[0]?.argsOf("in")).toEqual(["run_id", ["run-2", "run-1"]]);

    expect(workspaceId).toBe("workspace-1");
    expect(
      cards.map(({ findingsDelta, receiptId }) => ({
        findingsDelta,
        receiptId,
      })),
    ).toEqual([
      {
        findingsDelta: { opened: 1, openTotal: 4, resolved: 0 },
        receiptId: "receipt-9",
      },
      { findingsDelta: null, receiptId: "receipt-8" },
    ]);
  });
});
