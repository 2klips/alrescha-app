import type { RepositoryScanPlan } from "@arr/core";
import type postgres from "postgres";
import { describe, expect, it } from "vitest";

import { RepositoryScanStore } from "./repository-scan-store";

/**
 * The scan plan must reach Postgres as a jsonb *object* (Phase 2C todo 5).
 *
 * It did not. `${JSON.stringify(plan)}::jsonb` makes postgres.js send a JSON
 * string scalar, so inside `apply_repository_scan` both `plan->>'treeSha'` and
 * `plan->>'touchedRows'` read null, its unchanged-commit guard fires, and it
 * returns 0 having written nothing — no error, no row, no clue. The live pilot
 * is what surfaced it: a real repository with 370 artifacts scanned "fine" and
 * stored nothing.
 *
 * The database harness could not have caught this. `tests/helpers/database.ts`
 * runs PGlite and passes parameters through its own driver, so the postgres.js
 * encoding never happens there. This pins the encoding at the seam instead.
 */

const PLAN: RepositoryScanPlan = {
  artifacts: [],
  commitSha: "a".repeat(40),
  removedPaths: [],
  skipped: [],
  touchedRows: 370,
  treeSha: "b".repeat(40),
  unchangedPaths: [],
};

interface Captured {
  readonly values: unknown[];
}

/** A tagged template that records what the store interpolates. */
function captureSql(): { captured: Captured; sql: postgres.Sql } {
  const captured: Captured = { values: [] };
  const tag = (_strings: TemplateStringsArray, ...values: unknown[]) => {
    captured.values.push(...values);
    return Promise.resolve([{ touched: 371 }]);
  };
  // postgres.js exposes `json` on the tag itself; the store must use it.
  (tag as unknown as { json: (value: unknown) => unknown }).json = (value) => ({
    __jsonParameter: value,
  });
  return { captured, sql: tag as unknown as postgres.Sql };
}

describe("RepositoryScanStore.apply", () => {
  it("sends the plan through sql.json, never as a stringified parameter", async () => {
    const { captured, sql } = captureSql();

    const touched = await new RepositoryScanStore(sql).apply(
      "workspace",
      "repository",
      PLAN,
    );

    expect(touched).toBe(371);
    const planParameter = captured.values[2];
    expect(
      typeof planParameter,
      "the plan reached Postgres as a string — apply_repository_scan will read null and write nothing",
    ).not.toBe("string");
    expect(planParameter).toEqual({ __jsonParameter: PLAN });
  });
});
