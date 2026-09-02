import type { ClaimedJob, JobKind, WorkerQueue } from "./queue";
import { isNonBillableAiError } from "@alrescha/core";

export interface JobContext {
  readonly heartbeat: () => Promise<boolean>;
}

export type JobHandler = (
  job: ClaimedJob,
  context: JobContext,
) => Promise<void>;
export type JobHandlers = Readonly<Record<JobKind, JobHandler>>;

export type WorkerOutcome = "failed" | "idle" | "retrying" | "succeeded";

const CREDIT_UNAVAILABLE =
  /insufficient workspace credits|workspace monthly credit cap exceeded|per-job cap/i;

/**
 * Lease renewal cadence while a handler runs. `claim_next_job` leases for
 * 30s and handlers only heartbeat between steps, so a single 100s model call
 * (the production coaching smoke measured exactly that) outlived its lease
 * and would have been reaped and re-claimed — a duplicate billable call —
 * the moment a second loop shared the workspace. Renewing on a timer keeps
 * the lease honest for the whole call.
 */
export const HEARTBEAT_INTERVAL_MS = 10_000;

export async function runWorkerOnce(input: {
  readonly handlers: JobHandlers;
  /** Sink for failure reasons; the outcome alone never says why a job retried. */
  readonly log?: (line: string) => void;
  readonly queue: WorkerQueue;
  readonly workerId: string;
  readonly workspaceId: string;
}): Promise<WorkerOutcome> {
  const job = await input.queue.claim(input.workspaceId, input.workerId);
  if (!job) {
    return "idle";
  }

  if ((job.kind === "scan" || job.kind === "analyze") && job.creditCost !== 0) {
    await input.queue.finish(
      job.id,
      input.workerId,
      false,
      "deterministic job requested credits",
    );
    return "failed";
  }

  const heartbeat = () => input.queue.heartbeat(job.id, input.workerId);
  const renewal = setInterval(() => {
    void heartbeat().catch(() => undefined);
  }, HEARTBEAT_INTERVAL_MS);

  try {
    if (job.creditCost > 0) {
      await input.queue.reserveCredits(job.id);
    }
    await input.handlers[job.kind](job, { heartbeat });
    const outcome = await input.queue.finish(job.id, input.workerId, true);
    return outcome === "succeeded" ? "succeeded" : "failed";
  } catch (error) {
    const message = error instanceof Error ? error.message : "job failed";
    input.log?.(
      `  ${input.workerId} ${job.kind} ${job.id} attempt ${job.attemptCount} failed: ${message}`,
    );
    if (job.kind === "judge" && CREDIT_UNAVAILABLE.test(message)) {
      await input.queue.reject(
        job.id,
        input.workerId,
        "Judgment paused: credits unavailable. Add credits or configure BYOK, then retry.",
      );
      return "failed";
    }
    // Schema-invalid AI output (judgment or coaching) is terminal and never
    // charged — `reject_job` settles the reservation as a refund.
    if (isNonBillableAiError(error)) {
      await input.queue.reject(job.id, input.workerId, message);
      return "failed";
    }
    const outcome = await input.queue.finish(
      job.id,
      input.workerId,
      false,
      message,
    );
    return outcome === "retrying" ? "retrying" : "failed";
  } finally {
    clearInterval(renewal);
  }
}
