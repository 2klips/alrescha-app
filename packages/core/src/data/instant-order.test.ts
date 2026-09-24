import { describe, expect, test } from "vitest";

import { byInstant } from "./instant-order";

/**
 * Each stage of `byInstant` is pinned by one of these: without `Date.parse`
 * the fall-back case fails, without the text comparison the same-millisecond
 * case, and without the unparseable rule the last.
 */
describe("byInstant", () => {
  const oldestFirst = (times: readonly string[]): string[][] => [
    [...times].sort(byInstant),
    [...times].reverse().sort(byInstant),
  ];

  test("a time at zero microseconds precedes a later one in its second", () => {
    // PostgREST writes no fraction at all at zero microseconds, and a
    // collating compare ranks `.` before `+`.
    const times = ["2026-09-24T03:12:56+00:00", "2026-09-24T03:12:56.5+00:00"];

    expect(oldestFirst(times)).toEqual([times, times]);
  });

  test("digits past the millisecond still order two times", () => {
    // Date.parse keeps milliseconds only, so these two parse equal.
    const times = [
      "2026-09-24T03:12:56+00:00",
      "2026-09-24T03:12:56.0001+00:00",
      "2026-09-24T03:12:56.00012+00:00",
    ];

    expect(oldestFirst(times)).toEqual([times, times]);
  });

  test("two offsets compare as instants across a fall-back hour", () => {
    // Postgres in a zone with daylight time writes the repeated hour with two
    // offsets; by text alone, the later of these reads as the earlier.
    const times = ["2026-11-01T01:30:00-04:00", "2026-11-01T01:10:00-05:00"];

    expect(oldestFirst(times)).toEqual([times, times]);
  });

  test("the same text is a tie", () => {
    expect(
      byInstant("2026-09-24T03:12:56.5+00:00", "2026-09-24T03:12:56.5+00:00"),
    ).toBe(0);
  });

  test("text that does not parse sorts first, and the order stays total", () => {
    // Were unparseable text compared by code unit against instants, these
    // three would form a cycle — 01:30-04:00 before 01:10-05:00 by instant,
    // "…01:2" between them by text — and the result would depend on the
    // order the rows were read in.
    const times = [
      "",
      "2026-11-01T01:2",
      "2026-11-01T01:30:00-04:00",
      "2026-11-01T01:10:00-05:00",
    ];
    const permutations = (rest: readonly string[]): string[][] =>
      rest.length === 0
        ? [[]]
        : rest.flatMap((first, index) =>
            permutations([
              ...rest.slice(0, index),
              ...rest.slice(index + 1),
            ]).map((tail) => [first, ...tail]),
          );

    for (const read of permutations(times)) {
      expect(read.sort(byInstant)).toEqual(times);
    }
  });
});
