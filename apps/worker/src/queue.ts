import type postgres from "postgres";

export type JobKind =
  "analyze" | "coach" | "enrich" | "judge" | "pack" | "scan";

export interface ClaimedJob {
  readonly attemptCount: number;
  readonly creditCost: number;
  readonly id: string;
  readonly kind: JobKind;
  readonly maxAttempts: number;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly repositoryId: string;
  readonly runId: string;
  readonly workspaceId: string;
}

export interface WorkerQueue {
  claim(workspaceId: string, workerId: string): Promise<ClaimedJob | null>;
  /**
   * `retryDelaySeconds`, when given with a failure, is the earliest the
   * retry should be claimed — the queue takes the later of it and its own
   * backoff (`finish_job`, 202609120003).
   */
  finish(
    jobId: string,
    workerId: string,
    succeeded: boolean,
    error?: string,
    retryDelaySeconds?: number,
  ): Promise<string>;
  heartbeat(jobId: string, workerId: string): Promise<boolean>;
  reject(jobId: string, workerId: string, error: string): Promise<string>;
  reserveCredits(jobId: string): Promise<string | null>;
}

interface ClaimedJobRow {
  attempt_count: number;
  credit_cost: number;
  id: string;
  kind: JobKind;
  max_attempts: number;
  payload: Readonly<Record<string, unknown>>;
  repository_id: string;
  run_id: string;
  workspace_id: string;
}

/** PostgreSQL `undefined_function` (42883), from postgres.js or PGlite. */
function isUndefinedFunction(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return (
    code === "42883" ||
    (typeof message === "string" && /function .* does not exist/i.test(message))
  );
}

export class PostgresWorkerQueue implements WorkerQueue {
  constructor(private readonly sql: postgres.Sql) {}

  async claim(
    workspaceId: string,
    workerId: string,
  ): Promise<ClaimedJob | null> {
    const rows = await this.sql<ClaimedJobRow[]>`
      select id, workspace_id, repository_id, run_id, kind, payload,
             attempt_count, max_attempts, credit_cost
      from public.claim_next_job(${workspaceId}, ${workerId}, 30)
    `;
    const row = rows[0];
    return row
      ? {
          attemptCount: row.attempt_count,
          creditCost: row.credit_cost,
          id: row.id,
          kind: row.kind,
          maxAttempts: row.max_attempts,
          payload: row.payload,
          repositoryId: row.repository_id,
          runId: row.run_id,
          workspaceId: row.workspace_id,
        }
      : null;
  }

  async finish(
    jobId: string,
    workerId: string,
    succeeded: boolean,
    error?: string,
    retryDelaySeconds?: number,
  ): Promise<string> {
    if (retryDelaySeconds !== undefined) {
      try {
        const rows = await this.sql<{ outcome: string }[]>`
          select public.finish_job(
            ${jobId}, ${workerId}, ${succeeded}, ${error ?? null}, ${retryDelaySeconds}
          ) as outcome
        `;
        return rows[0]?.outcome ?? "ignored";
      } catch (failure) {
        // A worker released ahead of migration 202609120003 finds only the
        // four-argument function. The job must still finish — on the
        // queue's fixed backoff, as before — rather than hold its lease
        // until the reaper takes it.
        if (!isUndefinedFunction(failure)) throw failure;
      }
    }
    const rows = await this.sql<{ outcome: string }[]>`
      select public.finish_job(${jobId}, ${workerId}, ${succeeded}, ${error ?? null}) as outcome
    `;
    return rows[0]?.outcome ?? "ignored";
  }

  async heartbeat(jobId: string, workerId: string): Promise<boolean> {
    const rows = await this.sql<{ accepted: boolean }[]>`
      select public.heartbeat_job(${jobId}, ${workerId}, 30) as accepted
    `;
    return rows[0]?.accepted ?? false;
  }

  async reserveCredits(jobId: string): Promise<string | null> {
    const rows = await this.sql<{ reservation_id: string | null }[]>`
      select public.reserve_job_credits(${jobId}) as reservation_id
    `;
    return rows[0]?.reservation_id ?? null;
  }

  async reject(
    jobId: string,
    workerId: string,
    error: string,
  ): Promise<string> {
    const rows = await this.sql<{ outcome: string }[]>`
      select public.reject_job(${jobId}, ${workerId}, ${error}) as outcome
    `;
    return rows[0]?.outcome ?? "ignored";
  }
}
