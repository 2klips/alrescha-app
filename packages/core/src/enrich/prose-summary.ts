/**
 * The enrich pass, part ① — prose file summaries (Phase 3 Wave C todo 6).
 *
 * A summary is the only shape of source knowledge Alrescha is allowed to persist:
 * prose about the file, never the file. The validator enforces that boundary
 * deterministically — a summary that quotes a source line verbatim or smuggles
 * a code block is rejected as `schema_invalid`, which the worker's billing
 * loop refunds (the same no-charge marker judgment and coaching use).
 *
 * Determinism note: the providers request no sampling parameters (the current
 * model families reject them); repeatability comes from the blob-hash cache —
 * a file is summarized once per blob, not once per request.
 */

/** Same marker as the other AI validation errors: never billed. */
export class EnrichValidationError extends Error {
  readonly code = "schema_invalid" as const;

  constructor(message: string) {
    super(message);
    this.name = "EnrichValidationError";
  }
}

/**
 * Input clip (Graft precedent): the model sees at most this much of a file.
 * Clipping is stated to the model (`truncated`) so the summary can say "the
 * beginning of" instead of pretending completeness.
 */
export const SUMMARY_INPUT_MAX_CHARS = 24_000;

export interface ClippedSummaryInput {
  readonly clipped: string;
  readonly truncated: boolean;
}

export function clipSummaryInput(
  source: string,
  maxChars: number = SUMMARY_INPUT_MAX_CHARS,
): ClippedSummaryInput {
  if (source.length <= maxChars) {
    return { clipped: source, truncated: false };
  }
  return { clipped: source.slice(0, maxChars), truncated: true };
}

export interface SummaryCandidate {
  readonly path: string;
  readonly sourceBlobSha: string;
  /** The blob sha the stored summary was computed from, when one exists. */
  readonly summaryBlobSha: string | null;
}

/**
 * How a stored summary stands against the blob the scanner last saw (Codex
 * remedy P0-A / R-02).
 *
 * There are four answers, not two. `stale` and `unknown` are different from
 * `missing` because the prose exists and can be shown as history; they are
 * different from `current` because neither is a statement about the file as
 * it is now. A reader that collapses them into "there is a summary" serves
 * last week's description of a file that has changed since, which is worse
 * than serving nothing — the reader cannot tell it is being lied to.
 */
export type SummaryState =
  | {
      /** ADR-001: model prose is `inferred`, whatever its freshness. */
      readonly grade: "inferred";
      readonly sourceBlobSha: string;
      readonly state: "current";
      readonly text: string;
    }
  | {
      readonly currentBlobSha: string;
      readonly sourceBlobSha: string;
      readonly state: "stale";
      readonly text: string;
    }
  | {
      readonly reason: string;
      readonly state: "unknown";
      readonly text: string;
    }
  | { readonly state: "missing" };

/**
 * The one freshness rule, for every caller that shows prose.
 *
 * `current` needs **two non-empty digests that are equal**. Two nulls are not
 * a match: an artifact with no source digest and a summary with no digest
 * agree about nothing, and calling that current is how a legacy row with no
 * cache key ends up presented as a fresh description forever.
 */
export function summaryState(input: {
  readonly currentBlobSha: string | null | undefined;
  readonly summary: string | null | undefined;
  readonly summaryBlobSha: string | null | undefined;
}): SummaryState {
  const text = typeof input.summary === "string" ? input.summary.trim() : "";
  if (text.length === 0) return { state: "missing" };
  const current = (input.currentBlobSha ?? "").trim();
  const stored = (input.summaryBlobSha ?? "").trim();
  if (stored.length === 0) {
    return {
      reason: "summary carries no source digest",
      state: "unknown",
      text,
    };
  }
  if (current.length === 0) {
    return {
      reason: "artifact carries no source digest",
      state: "unknown",
      text,
    };
  }
  if (current === stored) {
    return { grade: "inferred", sourceBlobSha: stored, state: "current", text };
  }
  return {
    currentBlobSha: current,
    sourceBlobSha: stored,
    state: "stale",
    text,
  };
}

/** Why a reader is showing no prose, when it is showing none. */
export interface SummaryAbsence {
  readonly reason: string;
  readonly state: Exclude<SummaryState["state"], "current">;
}

/**
 * The sentence for an absent description (Wave D todo 19 보완 R-02).
 *
 * Every surface that hides stale prose leaves the same hole, and a hole with
 * no explanation reads as "this file has nothing to say" — which an agent
 * acts on differently than "nobody has described it yet" or "the description
 * is out of date". One function so the three surfaces that report it (the
 * inspector card, `get_node_content`, the search excerpt) cannot drift into
 * three different accounts of the same state.
 *
 * `null` for `current`: there is nothing absent to explain.
 */
export function summaryAbsence(state: SummaryState): SummaryAbsence | null {
  switch (state.state) {
    case "current":
      return null;
    case "stale":
      return {
        reason:
          "a description exists but was written for an older version of this file, so it is not served as current",
        state: "stale",
      };
    case "unknown":
      return {
        reason: `a description exists but ${state.reason}, so it is not served as current`,
        state: "unknown",
      };
    case "missing":
      return {
        reason: "no description has been generated for this file yet",
        state: "missing",
      };
  }
}

/**
 * The prose a reader may present as a description of the file *now* — and
 * `null` for every other state. Stale and unknown prose is kept in the row
 * and can be shown deliberately as history; it does not leak into a default
 * answer, an excerpt or a context pack.
 */
export function currentSummaryText(input: {
  readonly currentBlobSha: string | null | undefined;
  readonly summary: string | null | undefined;
  readonly summaryBlobSha: string | null | undefined;
}): string | null {
  const state = summaryState(input);
  return state.state === "current" ? state.text : null;
}

/**
 * The blob-hash cache in one predicate: a file needs a model call unless its
 * stored summary is `current` against the blob the scanner last saw.
 * `enqueue_enrich_job` applies the same predicate in SQL; the handler
 * re-derives it so a mid-flight rescan cannot bill stale work.
 *
 * The write side and the read side now decide freshness with one function,
 * which is the point: a file the selector calls fresh is exactly a file the
 * reader may quote.
 */
export function selectFilesForSummarization<T extends SummaryCandidate>(
  candidates: readonly T[],
): T[] {
  return candidates.filter(
    (candidate) =>
      summaryState({
        currentBlobSha: candidate.sourceBlobSha,
        // The selector is asked about the cache key, not the prose: a row
        // that stored a digest but whose text is gone still needs no call
        // when the digest matches.
        summary: "stored",
        summaryBlobSha: candidate.summaryBlobSha,
      }).state !== "current",
  );
}

const CODE_FENCE = /```|~~~/;
/** Trimmed source lines at least this long make the verbatim check. */
const VERBATIM_LINE_MIN_CHARS = 24;
const MAX_SUMMARY_CHARS = 1_500;
const MIN_SUMMARY_CHARS = 40;
const MAX_SENTENCES = 10;

function sentenceCount(prose: string): number {
  const matches = prose.match(/[.!?](?:\s|$)/g);
  return matches ? matches.length : 1;
}

/**
 * Validates one model output against the prose contract. Returns the summary
 * string; throws `EnrichValidationError` (never billed) otherwise.
 */
export function validateProseSummary(input: {
  readonly path: string;
  readonly raw: unknown;
  readonly source: string;
}): string {
  const raw = input.raw;
  let summary =
    typeof raw === "object" &&
    raw !== null &&
    typeof (raw as { summary?: unknown }).summary === "string"
      ? ((raw as { summary: string }).summary ?? "").trim()
      : null;
  if (summary === null) {
    throw new EnrichValidationError(
      `Summary output for ${input.path} did not match the {summary} schema.`,
    );
  }
  if (summary.length < MIN_SUMMARY_CHARS) {
    throw new EnrichValidationError(
      `Summary for ${input.path} is too short to describe a file.`,
    );
  }
  if (
    summary.length > MAX_SUMMARY_CHARS ||
    sentenceCount(summary) > MAX_SENTENCES
  ) {
    // Soft-trim to both caps at sentence boundaries (pilot finding: a
    // verbose model turned valid prose into permanent skips). Only reject
    // when no sentence-shaped prefix fits.
    const sentences = summary.match(/[^.!?]+[.!?]+(?:\s|$)/g) ?? [];
    let rebuilt = "";
    for (const sentence of sentences.slice(0, MAX_SENTENCES)) {
      if (rebuilt.length + sentence.length > MAX_SUMMARY_CHARS) break;
      rebuilt += sentence;
    }
    rebuilt = rebuilt.trim();
    if (rebuilt.length < MIN_SUMMARY_CHARS) {
      throw new EnrichValidationError(
        `Summary for ${input.path} exceeds ${MAX_SUMMARY_CHARS} characters.`,
      );
    }
    summary = rebuilt;
  }
  if (CODE_FENCE.test(summary)) {
    throw new EnrichValidationError(
      `Summary for ${input.path} contains a code fence; prose only.`,
    );
  }
  if (summary.includes("\n")) {
    throw new EnrichValidationError(
      `Summary for ${input.path} must be a single prose paragraph.`,
    );
  }
  for (const line of input.source.split("\n")) {
    const trimmed = line.trim();
    if (
      trimmed.length >= VERBATIM_LINE_MIN_CHARS &&
      summary.includes(trimmed)
    ) {
      throw new EnrichValidationError(
        `Summary for ${input.path} quotes a source line verbatim; ` +
          "prose only — raw code is never persisted.",
      );
    }
  }
  return summary;
}
