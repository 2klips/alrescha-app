import { createHash } from "node:crypto";

/** Crockford base32 — the alphabet `generate_ulid()` and the id checks use. */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * A content-derived id in ULID shape (26 Crockford characters, leading zero).
 *
 * Requirements have no identity of their own between analyses — the parser
 * yields spans and statements, and a re-run must converge on the same rows
 * so judgments and edges that point at a requirement keep pointing at it.
 * Hashing the stable parts (workspace, repository, source path, and the
 * REQ code or, failing that, the statement) gives every run the same id for
 * the same requirement; a reworded statement becomes a new requirement and
 * the old one is superseded, which is the honest reading of that change.
 *
 * The result passes `^[0-9A-HJKMNP-TV-Z]{26}$` but is NOT time-ordered like a
 * real ULID — callers must never sort on it as if it were.
 */
export function deterministicUlid(seed: string): string {
  const digest = createHash("sha256").update(seed).digest();
  // 25 characters × 5 bits = 125 bits from the first 16 bytes; the leading
  // "0" keeps the value inside a ULID's 128-bit range.
  let bits = BigInt(`0x${digest.subarray(0, 16).toString("hex")}`);
  let out = "";
  for (let index = 0; index < 25; index += 1) {
    out = CROCKFORD[Number(bits & 31n)] + out;
    bits >>= 5n;
  }
  return `0${out}`;
}
