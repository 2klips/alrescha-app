import { defineConfig } from "vitest/config";

/**
 * One stated time bound for every test and hook (2026-09-18).
 *
 * Vitest's defaults (5s per test, 10s per hook) were never a claim this
 * repository made — its claims about speed are explicit, elapsed-based
 * assertions inside the tests that make them. What the defaults did was fail
 * a real-migration PGlite test whenever a GitHub-hosted runner was slow:
 * building a migrated database costs 4–5s there, 260 of 1,879 cases take 3s
 * or more (main CI, 2026-09-18), and two such tests crossed 5s within a week
 * (5.09s on 2026-09-15, 5.04s on 2026-09-18) — each costing a re-run and,
 * because a failed run proves nothing, a window in which every `verified`
 * file on the pilot dropped to `unknown`. The bound below is the value the
 * suite's own stated bounds most often use; a test that runs for a minute is
 * hung. A test that states a larger bound of its own keeps it. Pinned by
 * `tests/test-bounds.test.ts`.
 */
const TIME_BOUND_MS = 60_000;

export default defineConfig({
  test: {
    coverage: {
      reporter: ["text", "json", "html"],
    },
    exclude: ["**/node_modules/**", "tests/e2e/**"],
    hookTimeout: TIME_BOUND_MS,
    include: [
      "apps/**/*.test.{ts,tsx}",
      "packages/**/*.test.ts",
      "tests/**/*.test.ts",
    ],
    maxWorkers: 4,
    testTimeout: TIME_BOUND_MS,
  },
});
