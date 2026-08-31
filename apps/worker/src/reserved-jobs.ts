import type { JobHandler } from "./worker";

/**
 * The 'pack' kind has been in the queue whitelist since Phase 1, but nothing
 * defines what a pack JOB does: WORK_SPEC §12 made context packs an
 * on-demand, read-only MCP selection (`request_context_pack`), and the
 * minimal-index proposal is an advisory PR action — neither wants a queue.
 * OQ-021 holds the decision (retire the kind vs. give it a producer). Until
 * it is resolved, a claimed pack job fails loudly with the pointer instead
 * of pretending to be a gap in the handler table.
 */
export function reservedPackHandler(): JobHandler {
  return async () => {
    throw new Error(
      "'pack' is a reserved job kind with no defined producer or semantics " +
        "(spec/OPEN_QUESTIONS.md OQ-021). Nothing should enqueue it until " +
        "that question is resolved.",
    );
  };
}
