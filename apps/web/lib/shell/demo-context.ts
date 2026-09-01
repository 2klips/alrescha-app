import type { ShellContext } from "./context";

/**
 * Fixture context for the public demo tree. The canonical demo tuple every
 * retired per-screen header repeated (`lib/commits/fixtures.ts`,
 * `lib/dashboard/graph-model.ts`, `lib/strings/{assurance,graph}.ts`):
 * repo 2klips/alrescha-app · branch main · SHA bad0551.
 */
export const DEMO_SHELL_CONTEXT: ShellContext = {
  repoName: "2klips/alrescha-app",
  branch: "main",
  sha7: "bad0551",
  receiptsHref: "/receipts",
};
