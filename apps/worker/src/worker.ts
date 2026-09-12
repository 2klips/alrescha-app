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

/**
 * The failure as `last_error` will carry it. `fetch` reports every network
 * failure as the two words "fetch failed" and keeps the reason in `cause`
 * (a DNS miss, a reset, a certificate); a job that failed three times on
 * that alone told nobody anything (2026-09-12, todo 16 live run). The cause
 * is appended when there is one, and only its code or message — never a
 * request body or a header.
 */
export function describeFailure(error: unknown): string {
  if (!(error instanceof Error)) return "job failed";
  const cause = (error as { cause?: unknown }).cause;
  if (cause instanceof Error) {
    const code = (cause as { code?: unknown }).code;
    const detail = typeof code === "string" ? code : cause.message;
    return detail ? `${error.message} (cause: ${detail})` : error.message;
  }
  return error.message;
}

/**
 * The furthest a retry is pushed out on the failure's own word. A GitHub
 * primary window resets within the hour; anything claiming longer is capped
 * rather than trusted.
 */
export const MAX_RETRY_DEFERRAL_SECONDS = 3600;

/**
 * When to retry, if the failure says. A refusal that names the moment its
 * cause clears — GitHub's `retry-after` or rate-limit reset, carried as
 * `retryAt` on `GitHubRequestError` — schedules the retry for then. The
 * queue's own backoff is two and four seconds: against a reset half an hour
 * away it spent all three attempts inside ten seconds (2026-09-12).
 * A time already past, or no time at all, leaves that backoff alone.
 */
export function retryDelaySeconds(
  error: unknown,
  now = Date.now(),
): number | undefined {
  const retryAt = (error as { retryAt?: unknown } | null)?.retryAt;
  if (typeof retryAt !== "number" || !Number.isFinite(retryAt)) {
    return undefined;
  }
  // One second of grace, so the claim lands after the reset, not on it.
  const seconds = Math.ceil((retryAt - now) / 1000) + 1;
  if (seconds <= 1) return undefined;
  return Math.min(seconds, MAX_RETRY_DEFERRAL_SECONDS);
}

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
    const message = describeFailure(error);
    const deferral = retryDelaySeconds(error);
    input.log?.(
      `  ${input.workerId} ${job.kind} ${job.id} attempt ${job.attemptCount} failed: ${message}${
        deferral === undefined ? "" : ` — retry deferred ${deferral}s`
      }`,
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
    const outcome =
      deferral === undefined
        ? await input.queue.finish(job.id, input.workerId, false, message)
        : await input.queue.finish(
            job.id,
            input.workerId,
            false,
            message,
            deferral,
          );
    return outcome === "retrying" ? "retrying" : "failed";
  } finally {
    clearInterval(renewal);
  }
}
