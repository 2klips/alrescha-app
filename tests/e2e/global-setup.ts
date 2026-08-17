/**
 * Warm every route the suite touches before any worker starts (Phase 2A todo 9).
 *
 * `pnpm dev` compiles App Router routes on demand. With 8 parallel workers the
 * first test to reach a cold route pays the whole compile inside its own action
 * timeout — which is how `live-graph.spec.ts` came to fail on a cold server and
 * pass on a warm one. That is a harness artefact, not a product defect, and the
 * honest fix is to remove the race rather than to raise a timeout until it hides.
 *
 * So: request each route once, sequentially, before the run. Next compiles it,
 * this returns, and every worker afterwards hits a warm route. Playwright's
 * `webServer` block has already waited for the server to listen by the time this
 * runs, and the whole warm-up is a no-op against a server that is already warm.
 */

import type { FullConfig } from "@playwright/test";

/** Every route any spec navigates to. `/onboarding` also warms the dashboard. */
const ROUTES = [
  "/",
  "/commits",
  "/findings",
  "/graph?node=req-auth",
  "/harness",
  "/inspection",
  "/library",
  "/lint",
  "/onboarding",
  "/progress",
  "/receipts",
  "/team",
  "/route-that-does-not-exist",
];

const WARMUP_TIMEOUT_MS = 90_000;

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL =
    config.projects[0]?.use?.baseURL ?? "http://127.0.0.1:3000";

  for (const route of ROUTES) {
    const url = new URL(route, baseURL).toString();
    const deadline = Date.now() + WARMUP_TIMEOUT_MS;
    for (;;) {
      try {
        const response = await fetch(url, {
          headers: { accept: "text/html" },
          signal: AbortSignal.timeout(WARMUP_TIMEOUT_MS),
        });
        // Drain the body: Next finishes streaming the RSC payload only once the
        // response is fully read, and that is when the route is really compiled.
        await response.text();
        break;
      } catch (error) {
        if (Date.now() > deadline) throw error;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }
}
