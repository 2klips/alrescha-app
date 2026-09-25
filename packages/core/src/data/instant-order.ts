function byCodeUnit(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Oldest first, by instant rather than by text: the comparator for timestamps
 * read from PostgREST. Swap the arguments for newest first.
 *
 * PostgREST writes timestamptz with trailing fractional zeros trimmed, and
 * with no fraction at all at zero microseconds — `…:56+00:00`,
 * `…:56.0001+00:00`, `…:56.5+00:00` — and a collating `localeCompare` ranks
 * `.` before `+`, so it put `…:56+00:00` after `…:56.5+00:00`, half a second
 * later. Code-unit order gets that right and is still wrong across offsets:
 * a session zone with daylight time writes the repeated fall-back hour as
 * `2026-11-01T01:30:00-04:00` and then `2026-11-01T01:10:00-05:00`.
 *
 * `Date.parse` compares instants, whatever their offsets, to the millisecond;
 * the digits it truncates order by code unit, which is chronological in that
 * format because the offset's sign sorts below `.` and every digit (and one
 * session writes one offset within a millisecond). Text that does not parse
 * sorts before every instant, by code unit, so the order stays total whatever
 * a caller passes.
 */
export function byInstant(left: string, right: string): number {
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  if (Number.isNaN(leftMs) !== Number.isNaN(rightMs)) {
    return Number.isNaN(leftMs) ? -1 : 1;
  }
  return leftMs - rightMs || byCodeUnit(left, right);
}
