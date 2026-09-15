import type postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createAnalysisJobHandler } from "../apps/worker/src/analysis-job";
import { GitHubRepositorySource } from "../apps/worker/src/github-repository-source";
import { PostgresAnalysisStore } from "../apps/worker/src/postgres-analysis-store";
import { PostgresWorkerQueue } from "../apps/worker/src/queue";
import { runRepositoryScan } from "../apps/worker/src/repository-scan";
import { RepositoryScanStore } from "../apps/worker/src/repository-scan-store";
import { readTransientSource } from "../apps/worker/src/source-cache";
import { runWorkerOnce, type JobHandlers } from "../apps/worker/src/worker";
import {
  buildScanProgress,
  type WorkspaceJourneyJobRow,
  type WorkspaceJourneyRepositoryRow,
} from "../apps/web/lib/home/journey";
import { ALL_MIGRATIONS, createTestDatabase } from "./helpers/database";
import { pgliteSql } from "./helpers/pglite-sql";

/**
 * The backfill pair against a GitHub that throttles (PR #8 follow-up,
 * 2026-09-12).
 *
 * Production ran the scan and analyze of a freshly connected repository
 * through the real queue, the real source and the real stores, and both
 * ended on 403 with all three attempts gone inside ten seconds. This is that
 * path — queue functions, `GitHubRepositorySource`, scan and analysis
 * stores, and the home's progress model — over the migrated schema, with
 * GitHub played by a scripted fetch. Three outcomes are pinned: a limit that
 * says "a minute" is waited out and the pair lands; a limit that says "half
 * an hour" defers the retry instead of spending it; a refusal with nothing
 * to wait for still ends as a failed job whose reason names the kind.
 */

// The real clock: the worker dates a deferral against `Date.now()`, so the
// fake clock the source reads must start where it is and move only on sleep.
const T0 = Date.now();
const USER = "7b000000-0000-4000-8000-000000000001";
const INSTALLATION_ID = "01JB00000000000000000000N1";
const REPOSITORY_ID = "01JB00000000000000000000R1";
const RUN_ID = "01JB00000000000000000000T1";
const COMMIT = "c".repeat(40);
const TREE = "d".repeat(40);

const FILES: Record<string, string> = {
  "docs/spec.md":
    "# Spec\n\n## Requirements\n\n- REQ-1: The scanner MUST resolve imports.\n",
  "src/a.ts": 'import { b } from "./b";\n\nexport const a = () => b();\n',
  "src/b.ts": "export function b(): number {\n  return 1;\n}\n",
};

const blobSha = (index: number) => (index + 1).toString(16).padStart(40, "0");

interface GitHubStub {
  /** Answers a request instead of the repository, or `null` to serve it. */
  refuse: ((url: string) => Response | null) | null;
  readonly fetchImplementation: typeof fetch;
  /** The fake clock at each request, in order. */
  readonly fired: number[];
  readonly sleeps: number[];
  clockNow: number;
}

function githubStub(): GitHubStub {
  const stub: GitHubStub = {
    clockNow: T0,
    fetchImplementation: (async (input: string | URL | Request) => {
      const url = String(input);
      stub.fired.push(stub.clockNow);
      const refused = stub.refuse?.(url);
      if (refused) return refused;
      if (url.includes("/git/trees/")) {
        return Response.json({
          sha: TREE,
          tree: Object.keys(FILES).map((path, index) => ({
            mode: "100644",
            path,
            sha: blobSha(index),
            size: FILES[path]!.length,
            type: "blob",
          })),
          truncated: false,
        });
      }
      const match = /\/contents\/([^?]+)\?/.exec(url);
      const path = match?.[1] ? decodeURIComponent(match[1]) : "";
      const text = FILES[path];
      if (text === undefined) return new Response(null, { status: 404 });
      return new Response(new TextEncoder().encode(text), { status: 200 });
    }) as typeof fetch,
    fired: [],
    refuse: null,
    sleeps: [],
  };
  return stub;
}

function secondaryLimit(retryAfterSeconds: number): Response {
  return Response.json(
    {
      message:
        "You have exceeded a secondary rate limit. Please wait a few minutes before you try again.",
    },
    {
      headers: {
        "retry-after": String(retryAfterSeconds),
        "x-ratelimit-limit": "5000",
        "x-ratelimit-remaining": "4990",
        "x-ratelimit-resource": "core",
      },
      status: 403,
    },
  );
}

function primaryLimit(now: number, resetInSeconds: number): Response {
  return Response.json(
    { message: "API rate limit exceeded for installation ID 154681535." },
    {
      headers: {
        "x-ratelimit-limit": "5000",
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": String(Math.floor(now / 1000) + resetInSeconds),
        "x-ratelimit-resource": "core",
      },
      status: 403,
    },
  );
}

const forbidden = () =>
  Response.json(
    { message: "Resource not accessible by integration" },
    { status: 403 },
  );

const isContents = (url: string) => url.includes("/contents/");

describe("the backfill pair under a GitHub rate limit", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let sql: postgres.Sql;
  let workspaceId: string;
  let stub: GitHubStub;
  let handlers: JobHandlers;
  let queue: PostgresWorkerQueue;

  beforeEach(async () => {
    database = await createTestDatabase([...ALL_MIGRATIONS]);
    sql = pgliteSql(database) as unknown as postgres.Sql;
    await database.query(
      "insert into auth.users (id, email) values ($1, 'throttle@example.test')",
      [USER],
    );
    workspaceId =
      (await database.query<{ id: string }>("select id from public.workspaces"))
        .rows[0]?.id ?? "";
    await database.query(
      `insert into public.github_installations
        (id, workspace_id, github_installation_id, account_id, account_login)
       values ($1, $2, 808, 8080, 'alrescha')`,
      [INSTALLATION_ID, workspaceId],
    );
    await database.query(
      `insert into public.repositories
        (id, workspace_id, full_name, installation_id, github_repository_id, selected_at)
       values ($1, $2, 'alrescha/throttled', $3, 808808, now())`,
      [REPOSITORY_ID, workspaceId, INSTALLATION_ID],
    );
    await database.query(
      `insert into public.runs
        (id, workspace_id, repository_id, trigger_kind, trigger_key, commit_sha)
       values ($1, $2, $3, 'manual', 'backfill', $4)`,
      [RUN_ID, workspaceId, REPOSITORY_ID, COMMIT],
    );
    for (const kind of ["scan", "analyze"] as const) {
      await database.query(
        "select public.enqueue_job($1, $2, $3, $4, $5, $6::jsonb, 0, 3)",
        [
          workspaceId,
          REPOSITORY_ID,
          RUN_ID,
          kind,
          `backfill:${kind}`,
          JSON.stringify({ commitSha: COMMIT, mode: "full" }),
        ],
      );
    }

    stub = githubStub();
    // One source for both jobs, as the worker's per-repository cache gives
    // them, so the analyze job inherits the scan's gate.
    const source = new GitHubRepositorySource(
      "alrescha",
      "throttled",
      "installation-token",
      stub.fetchImplementation,
      {
        now: () => stub.clockNow,
        random: () => 0,
        sleep: async (ms) => {
          stub.sleeps.push(ms);
          stub.clockNow += ms;
        },
      },
    );
    const unreachable = async () => {
      throw new Error("not a deterministic job");
    };
    handlers = {
      analyze: createAnalysisJobHandler({
        readSource: ({ commitSha, path }) =>
          readTransientSource(source, path, commitSha),
        store: new PostgresAnalysisStore(sql),
      }),
      coach: unreachable,
      docpage: unreachable,
      docskeleton: unreachable,
      enrich: unreachable,
      judge: unreachable,
      pack: unreachable,
      scan: async (job) => {
        const { commitSha } = job.payload as { commitSha: string };
        await runRepositoryScan({
          commitSha,
          mode: "full",
          repositoryId: job.repositoryId,
          source,
          store: new RepositoryScanStore(sql),
          workspaceId: job.workspaceId,
        });
      },
    };
    queue = new PostgresWorkerQueue(sql);
  });

  afterEach(async () => {
    await database.close();
  });

  const drainOne = () =>
    runWorkerOnce({
      handlers,
      log: () => undefined,
      queue,
      workerId: "worker-1",
      workspaceId,
    });

  async function repository(): Promise<WorkspaceJourneyRepositoryRow> {
    const rows = await database.query<WorkspaceJourneyRepositoryRow>(
      `select id, full_name, installation_id, last_scanned_commit_sha, last_analyzed_commit_sha
       from public.repositories where id = $1`,
      [REPOSITORY_ID],
    );
    return rows.rows[0]!;
  }

  async function jobs(): Promise<
    (WorkspaceJourneyJobRow & { attempt_count: number; seconds: number })[]
  > {
    const rows = await database.query<
      WorkspaceJourneyJobRow & { attempt_count: number; seconds: number }
    >(
      `select created_at::text, kind, last_error, payload, status, attempt_count,
              extract(epoch from (available_at - now()))::float8 as seconds
       from public.jobs where repository_id = $1
       order by created_at desc, kind`,
      [REPOSITORY_ID],
    );
    return rows.rows;
  }

  async function progress() {
    return buildScanProgress(await repository(), await jobs());
  }

  it("a limit that asks for a minute is waited out, and the pair lands as scanned = analysed", async () => {
    expect(await drainOne()).toBe("succeeded");
    expect((await repository()).last_scanned_commit_sha).toBe(COMMIT);
    const scanned = stub.fired.length;

    // The first body read of the analysis meets the secondary limit.
    let refused = false;
    stub.refuse = (url) => {
      if (refused || !isContents(url)) return null;
      refused = true;
      return secondaryLimit(60);
    };

    expect(await drainOne()).toBe("succeeded");

    expect(stub.sleeps).toEqual([60_000]);
    const refusedAt = stub.fired[scanned]!;
    const after = stub.fired.slice(scanned + 1);
    expect(after.length).toBeGreaterThan(0);
    // Nothing went out during the minute GitHub asked for.
    expect(after.every((at) => at >= refusedAt + 60_000)).toBe(true);

    const row = await repository();
    expect(row.last_analyzed_commit_sha).toBe(COMMIT);
    expect(row.last_analyzed_commit_sha).toBe(row.last_scanned_commit_sha);
    expect((await jobs()).map(({ kind, status }) => [kind, status])).toEqual([
      ["analyze", "succeeded"],
      ["scan", "succeeded"],
    ]);
    // What the home renders: 구조 스캔 완료 · 분석 완료, and 다시 스캔.
    expect(await progress()).toMatchObject({
      analysis: "ready",
      analysisError: null,
      rescan: "available",
      structure: "ready",
      structureError: null,
    });
    expect(await drainOne()).toBe("idle");
  });

  it("a limit that resets in half an hour defers the retry instead of spending it, and the job says which limit", async () => {
    expect(await drainOne()).toBe("succeeded");
    stub.refuse = (url) =>
      isContents(url) ? primaryLimit(stub.clockNow, 1800) : null;

    expect(await drainOne()).toBe("retrying");

    expect(stub.sleeps).toEqual([]);
    const analyze = (await jobs()).find(({ kind }) => kind === "analyze")!;
    expect(analyze.status).toBe("queued");
    expect(analyze.attempt_count).toBe(1);
    // The source's clock is frozen at T0 while the worker dates the deferral
    // against the real one, so the wait is the reset window minus however
    // long this file has been running — under a second here, nine on a
    // GitHub-hosted runner. Bound it by the measured elapsed time, not a
    // guessed margin; the claim is still "deferred to the reset, not to the
    // default backoff".
    const elapsedSeconds = (Date.now() - T0) / 1000;
    expect(analyze.seconds).toBeGreaterThan(1800 - elapsedSeconds - 2);
    expect(analyze.seconds).toBeLessThanOrEqual(1801);
    expect(analyze.last_error).toMatch(
      /^GitHub repository request failed: 403 primary-rate-limit; retry after 1800s; rate limit 0\/5000 core, resets in 1800s \(\/repos\/alrescha\/throttled\/contents\//,
    );
    expect(analyze.last_error).not.toMatch(/exceeded|installation ID/);
    // Not claimable until then: the queue does not burn the second attempt.
    expect(await drainOne()).toBe("idle");
    expect(await progress()).toMatchObject({
      analysis: "queued",
      rescan: "available",
      structure: "ready",
    });

    // When the window has passed, the same job finishes the pair. Both
    // clocks move: the queue's (the retry becomes claimable) and the
    // source's (its gate, which failed fast until the reset, reopens).
    stub.refuse = null;
    stub.clockNow += 1_801_000;
    await database.query(
      "update public.jobs set available_at = now() where kind = 'analyze' and repository_id = $1",
      [REPOSITORY_ID],
    );
    expect(await drainOne()).toBe("succeeded");
    const row = await repository();
    expect(row.last_analyzed_commit_sha).toBe(row.last_scanned_commit_sha);
    expect(await progress()).toMatchObject({
      analysis: "ready",
      structure: "ready",
    });
  });

  it("a refusal with nothing to wait for still exhausts its attempts, and the reason on screen names the kind", async () => {
    expect(await drainOne()).toBe("succeeded");
    stub.refuse = (url) => (isContents(url) ? forbidden() : null);

    expect(await drainOne()).toBe("retrying");
    for (const expected of ["retrying", "failed"]) {
      await database.query(
        "update public.jobs set available_at = now() where kind = 'analyze' and repository_id = $1",
        [REPOSITORY_ID],
      );
      expect(await drainOne()).toBe(expected);
    }

    expect(stub.sleeps).toEqual([]);
    const analyze = (await jobs()).find(({ kind }) => kind === "analyze")!;
    expect(analyze.status).toBe("failed");
    expect(analyze.attempt_count).toBe(3);
    expect(analyze.last_error).toMatch(
      /^GitHub repository request failed: 403 forbidden \(/,
    );
    expect((await repository()).last_analyzed_commit_sha).toBeNull();
    expect(await progress()).toMatchObject({
      analysis: "failed",
      analysisError: analyze.last_error,
      rescan: "available",
      structure: "ready",
    });
  });
});
