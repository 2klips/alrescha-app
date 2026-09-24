import { describe, expect, test } from "vitest";

import { currentRepository, newestCreatedFirst } from "./current-repository";

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

/**
 * The order a loader that read repositories by id (RE-04) hands
 * `currentRepository`, so that its ties fall the same way on every screen.
 */
describe("newestCreatedFirst", () => {
  test("puts the newest-created first, the newest id first in a tie, and rows with no time last", () => {
    const rows = [
      { created_at: T(1), id: "01A", selected_at: null },
      { created_at: null, id: "01Z", selected_at: null },
      { created_at: T(5), id: "01B", selected_at: null },
      { created_at: T(5), id: "01C", selected_at: null },
    ];
    expect(newestCreatedFirst(rows).map(({ id }) => id)).toEqual([
      "01C",
      "01B",
      "01A",
      "01Z",
    ]);
    // A copy: the caller's rows keep their order.
    expect(rows.map(({ id }) => id)).toEqual(["01A", "01Z", "01B", "01C"]);
  });

  test("gives currentRepository the same tie whatever order the rows were read in", () => {
    const byId = [
      { created_at: T(5), id: "01B", selected_at: null },
      { created_at: T(5), id: "01C", selected_at: null },
    ];
    expect(currentRepository(newestCreatedFirst(byId))?.id).toBe("01C");
    expect(currentRepository(newestCreatedFirst([...byId].reverse()))?.id).toBe(
      "01C",
    );
  });
});
