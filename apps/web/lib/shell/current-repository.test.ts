import { describe, expect, test } from "vitest";

import { currentRepository } from "./current-repository";

/**
 * The one rule every workspace screen picks its repository by (PR #9
 * follow-up, OQ-042): the most recently selected leads; a repository that
 * was never selected — a local push — counts by its creation.
 */

const T = (hours: number) =>
  new Date(Date.UTC(2026, 8, 12, hours)).toISOString();

describe("currentRepository", () => {
  test("an empty workspace has none", () => {
    expect(currentRepository([])).toBeNull();
  });

  test("the most recently selected repository leads, not the most recently created", () => {
    // Production on 2026-09-12: one repository connected on the 6th and
    // re-selected at noon, another connected at 11:49 for the first time.
    const older = {
      created_at: T(1),
      id: "connected-on-the-6th",
      selected_at: T(12),
    };
    const newer = {
      created_at: T(11),
      id: "connected-at-11",
      selected_at: T(11),
    };
    expect(currentRepository([newer, older])?.id).toBe("connected-on-the-6th");
    expect(currentRepository([older, newer])?.id).toBe("connected-on-the-6th");
  });

  test("a repository that was never selected counts by its creation", () => {
    const selected = { created_at: T(1), id: "github", selected_at: T(10) };
    const pushed = { created_at: T(11), id: "local", selected_at: null };
    expect(currentRepository([selected, pushed])?.id).toBe("local");
    const pushedEarlier = { ...pushed, created_at: T(9) };
    expect(currentRepository([selected, pushedEarlier])?.id).toBe("github");
  });

  test("ties and unusable timestamps keep the caller's order", () => {
    const first = { created_at: T(5), id: "first", selected_at: T(5) };
    const second = { created_at: T(5), id: "second", selected_at: T(5) };
    expect(currentRepository([first, second])?.id).toBe("first");

    const blank = { created_at: null, id: "blank", selected_at: null };
    const garbled = {
      created_at: null,
      id: "garbled",
      selected_at: "not a date",
    };
    expect(currentRepository([blank, garbled])?.id).toBe("blank");
    // Anything with a real time outranks rows that have none.
    expect(currentRepository([blank, first, garbled])?.id).toBe("first");
  });
});
