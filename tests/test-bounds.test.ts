import { describe, expect, it } from "vitest";

import config from "../vitest.config";

/**
 * The suite's one stated time bound (2026-09-18). Vitest's 5s/10s defaults
 * failed real-migration PGlite tests on slow GitHub-hosted runners twice in a
 * week; the bound is now stated in `vitest.config.ts`, and this file keeps it
 * from silently returning to the defaults. It is a bound on a hung test, not
 * an assertion about speed — those stay explicit and elapsed-based in the
 * tests that make them.
 */

const STATED_BOUND_MS = 60_000;

describe("the suite's time bound", () => {
  it("is stated for tests and hooks rather than left at vitest's defaults", () => {
    expect(config.test?.testTimeout).toBe(STATED_BOUND_MS);
    expect(config.test?.hookTimeout).toBe(STATED_BOUND_MS);
  });

  it("reaches a test that states nothing of its own", ({ task }) => {
    expect(task.timeout).toBe(STATED_BOUND_MS);
  });
});
