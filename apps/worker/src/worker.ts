import type { ClaimedJob, JobKind, WorkerQueue } from "./queue";

export interface JobContext {
  readonly heartbeat: () => Promise<boolean>;
}

export type JobHandler = (job: ClaimedJob, context: JobContext) => Promise<void>;
export type JobHandlers = Readonly<Record<JobKind, JobHandler>>;

export type WorkerOutcome = "failed" | "idle" | "retrying" | "succeeded";

export async function runWorkerOnce(input: {
  readonly handlers: JobHandlers;
  readonly queue: WorkerQueue;
  readonly workerId: string;
  readonly workspaceId: string;
}): Promise<WorkerOutcome> {
  const job = await input.queue.claim(input.workspaceId, input.workerId);
  if (!job) {
    return "idle";
  }

  if ((job.kind === "scan" || job.kind === "analyze") && job.creditCost !== 0) {
    await input.queue.finish(job.id, input.workerId, false, "deterministic job requested credits");
    return "failed";
  }

  try {
    if (job.creditCost > 0) {
      await input.queue.reserveCredits(job.id);
    }
    await input.handlers[job.kind](job, {
      heartbeat: () => input.queue.heartbeat(job.id, input.workerId),
    });
    const outcome = await input.queue.finish(job.id, input.workerId, true);
    return outcome === "succeeded" ? "succeeded" : "failed";
  } catch (error) {
    const message = error instanceof Error ? error.message : "job failed";
    const outcome = await input.queue.finish(job.id, input.workerId, false, message);
    return outcome === "retrying" ? "retrying" : "failed";
  }
}
