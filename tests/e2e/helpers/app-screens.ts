/**
 * The authenticated `/app/*` family (Phase 2C todo 5).
 *
 * Phase 2A walked every public screen in both themes and Phase 2C todo 4 added
 * the two `/auth/*` screens once the local Supabase was up. What stayed outside
 * every browser sweep was this family, because it redirects to `/auth/login`
 * without a session. `helpers/session.ts` mints one, so these screens are now
 * held to the same bar as the public ones.
 *
 * `/app/connect/github` joined them once the GitHub App credentials were
 * supplied: it reads `GITHUB_APP_ID` and friends at render time and used to
 * answer 500 without them. Registering the app is what a reader would call
 * "the G2 gate", and half of it is open — the screen renders, so it is held
 * to the same bar as the rest.
 *
 * One route is still absent. `/app/connect/github/repositories` redirects to
 * the connect screen until an installation exists, and a test workspace has
 * none; the redirect is correct behaviour, and `walkBothThemes` refuses to
 * audit a screen it did not land on. It joins when a live installation does.
 */
export const AUTHENTICATED_SCREENS = [
  ["app-workspace", "/app"],
  ["app-map", "/app/map"],
  ["app-commits", "/app/commits"],
  ["app-receipts", "/app/receipts"],
  ["app-inspection", "/app/inspection"],
  ["app-team", "/app/team"],
  ["app-progress", "/app/progress"],
  ["app-stats", "/app/stats"],
  ["app-library", "/app/library"],
  ["app-harness", "/app/harness"],
  ["app-settings-mcp", "/app/settings/mcp"],
  ["app-settings-ai", "/app/settings/ai"],
  ["app-settings-privacy", "/app/settings/privacy"],
  ["app-connect-github", "/app/connect/github"],
] as const;
