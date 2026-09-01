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
 * The blob-hash cache in one predicate: a file needs a model call only when
 * its stored summary was computed from a different blob than the one the
 * scanner last saw. `enqueue_enrich_job` applies the same predicate in SQL;
 * the handler re-derives it so a mid-flight rescan cannot bill stale work.
 */
export function selectFilesForSummarization<T extends SummaryCandidate>(
  candidates: readonly T[],
): T[] {
  return candidates.filter(
    (candidate) => candidate.summaryBlobSha !== candidate.sourceBlobSha,
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
