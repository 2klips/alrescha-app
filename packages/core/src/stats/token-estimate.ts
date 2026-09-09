/**
 * One token estimate for the whole product (Phase 4 Wave E todo 24).
 *
 * The ratio was written in three places before this file: the repo map's
 * budget, the served-bytes column the database generates (todo 23), and the
 * instruction cost table. Three copies of an assumption is three assumptions,
 * and the one that drifts is the one a screen quotes.
 *
 * It is an **assumption**, not a measurement — a real tokenizer splits Korean
 * prose, path strings, base32 ULIDs and JSON punctuation differently, and
 * differently again per model (OQ-060). What is stored everywhere is the
 * fact — a length — so a better ratio can be applied to history rather than
 * lost with it. Nothing built on this may call its output a measurement.
 */
export const CHARS_PER_TOKEN = 4;

/** What a number was counted in before the ratio was applied. */
export type TokenEstimateBasis = "bytes" | "chars";

export interface TokenEstimateAssumption {
  /**
   * `bytes` overestimates for non-ASCII text: one Korean character is three
   * UTF-8 bytes, so a Korean-heavy file reads as roughly three times its
   * character count. Said out loud rather than buried, because the screens
   * that show these numbers are the ones promising not to invent them.
   */
  readonly basis: TokenEstimateBasis;
  readonly charsPerToken: number;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Tokens from a stored byte count. The scan records `size_bytes` and never
 * the body, so this is the only estimate available for a file the server has
 * not read — and it inherits the byte/character gap above.
 */
export function estimateTokensFromBytes(bytes: number): number {
  return Math.ceil(Math.max(0, bytes) / CHARS_PER_TOKEN);
}
