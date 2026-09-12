import type postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PostgresWorkerQueue } from "../apps/worker/src/queue";
import {
  ALL_MIGRATIONS,
  FINISH_JOB_RETRY_DELAY_MIGRATION,
  createTestDatabase,
} from "./helpers/database";
import { pgliteSql } from "./helpers/pglite-sql";

/**
 * `finish_job` with the retry time the worker learned from the failure
 * (202609120003, PR #8 follow-up).
 *
 * The queue's backoff is 2^attempt seconds. A GitHub limit that resets in
 * half an hour therefore saw three attempts inside ten seconds
 * (2026-09-12). The fifth argument lets the worker say when the cause
 * clears; the function takes the later of that and its own backoff, never
 * more than an hour, and a four-argument call behaves exactly as before.
 */

const USER = "7a000000-0000-4000-8000-000000000001";
const fixedUlid = (suffix: string) => `01JA000000000000000000000${suffix}`;
const REPOSITORY = fixedUlid("B");
const RUN = fixedUlid("C");
const SHA = "a".repeat(40);

describe("finish_job retry delay", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let workspace: string;

  async function seed(migrations: readonly string[]): Promise<void> {
    database = await createTestDatabase(migrations);
    await database.query(
      "insert into auth.users (id, email) values ($1, 'delay@example.test')",
      [USER],
    );
    workspace =
      (await database.query<{ id: string }>("select id from public.workspaces"))
        .rows[0]?.id ?? "";
    await database.query(
      `insert into public.repositories (id, workspace_id, full_name, selected_at)
       values ($1, $2, 'alrescha/delay', now())`,
      [REPOSITORY, workspace],
    );
    await database.query(
      `insert into public.runs
        (id, workspace_id, repository_id, trigger_kind, trigger_key, commit_sha)
       values ($1, $2, $3, 'manual', 'seed', $4)`,
      [RUN, workspace, REPOSITORY, SHA],
    );
  }

  async function enqueueAndClaim(
    key: string,
    maxAttempts = 3,
  ): Promise<string> {
    const enqueued = await database.query<{ id: string }>(
      "select public.enqueue_job($1, $2, $3, 'scan', $4, '{}'::jsonb, 0, $5) as id",
      [workspace, REPOSITORY, RUN, key, maxAttempts],
    );
    await database.query(
      "select id from public.claim_next_job($1, 'worker-1', 30)",
      [workspace],
    );
    return enqueued.rows[0]?.id ?? "";
  }

  /** Seconds from now until the job may be claimed again. */
  async function secondsUntilAvailable(jobId: string): Promise<number> {
    const rows = await database.query<{ seconds: number; status: string }>(
      `select status,
              extract(epoch from (available_at - now()))::float8 as seconds
       from public.jobs where id = $1`,
      [jobId],
    );
    expect(rows.rows[0]?.status).toBe("queued");
    return rows.rows[0]?.seconds ?? Number.NaN;
  }

  afterEach(async () => {
    await database.close();
  });

  describe("with the migration applied", () => {
    beforeEach(async () => {
      await seed([...ALL_MIGRATIONS]);
    });

    it("queues the retry no earlier than the delay the worker passed", async () => {
      const jobId = await enqueueAndClaim("deferred");

      const outcome = await database.query<{ outcome: string }>(
        "select public.finish_job($1, 'worker-1', false, 'throttled', 1801) as outcome",
        [jobId],
      );

      expect(outcome.rows[0]?.outcome).toBe("retrying");
      const seconds = await secondsUntilAvailable(jobId);
      expect(seconds).toBeGreaterThan(1795);
      expect(seconds).toBeLessThanOrEqual(1801);
    });

    it("keeps the exponential backoff when it is the longer of the two", async () => {
      const jobId = await enqueueAndClaim("short-hint");
      await database.query(
        "select public.finish_job($1, 'worker-1', false, 'first', 1)",
        [jobId],
      );
      // Second attempt: 2^2 = 4s of backoff outranks a one-second hint.
      await database.query(
        "update public.jobs set available_at = now() where id = $1",
        [jobId],
      );
      await database.query(
        "select id from public.claim_next_job($1, 'worker-1', 30)",
        [workspace],
      );

      await database.query(
        "select public.finish_job($1, 'worker-1', false, 'second', 1)",
        [jobId],
      );

      const seconds = await secondsUntilAvailable(jobId);
      expect(seconds).toBeGreaterThan(3);
      expect(seconds).toBeLessThanOrEqual(4);
    });

    it("caps the delay at an hour, whatever the failure claims", async () => {
      const jobId = await enqueueAndClaim("capped");

      await database.query(
        "select public.finish_job($1, 'worker-1', false, 'throttled', 99999)",
        [jobId],
      );

      const seconds = await secondsUntilAvailable(jobId);
      expect(seconds).toBeGreaterThan(3595);
      expect(seconds).toBeLessThanOrEqual(3600);
    });

    it("still answers a four-argument call with the plain backoff", async () => {
      const jobId = await enqueueAndClaim("plain");

      const outcome = await database.query<{ outcome: string }>(
        "select public.finish_job($1, 'worker-1', false, 'transient') as outcome",
        [jobId],
      );

      expect(outcome.rows[0]?.outcome).toBe("retrying");
      const seconds = await secondsUntilAvailable(jobId);
      expect(seconds).toBeGreaterThan(1);
      expect(seconds).toBeLessThanOrEqual(2);
    });

    it("does not resurrect a job on its last attempt: the delay is for retries only", async () => {
      const jobId = await enqueueAndClaim("terminal", 1);

      const outcome = await database.query<{ outcome: string }>(
        "select public.finish_job($1, 'worker-1', false, 'throttled', 1801) as outcome",
        [jobId],
      );

      expect(outcome.rows[0]?.outcome).toBe("failed");
      const row = await database.query<{ status: string }>(
        "select status from public.jobs where id = $1",
        [jobId],
      );
      expect(row.rows[0]?.status).toBe("failed");
    });

    it("the worker's queue passes the delay through", async () => {
      const jobId = await enqueueAndClaim("through-queue");
      const queue = new PostgresWorkerQueue(
        pgliteSql(database) as unknown as postgres.Sql,
      );

      const outcome = await queue.finish(
        jobId,
        "worker-1",
        false,
        "GitHub repository request failed: 403 primary-rate-limit",
        1801,
      );

      expect(outcome).toBe("retrying");
      expect(await secondsUntilAvailable(jobId)).toBeGreaterThan(1795);
    });
  });

  describe("against a database the migration has not reached", () => {
    beforeEach(async () => {
      await seed(
        ALL_MIGRATIONS.filter(
          (migration) => migration !== FINISH_JOB_RETRY_DELAY_MIGRATION,
        ),
      );
    });

    it("the worker's queue falls back to the four-argument function", async () => {
      const jobId = await enqueueAndClaim("fallback");
      const queue = new PostgresWorkerQueue(
        pgliteSql(database) as unknown as postgres.Sql,
      );

      const outcome = await queue.finish(
        jobId,
        "worker-1",
        false,
        "throttled",
        1801,
      );

      // Finished on the old backoff rather than left running for the reaper.
      expect(outcome).toBe("retrying");
      const seconds = await secondsUntilAvailable(jobId);
      expect(seconds).toBeGreaterThan(1);
      expect(seconds).toBeLessThanOrEqual(2);
    });
  });
});
