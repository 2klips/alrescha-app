/**
 * The authenticated `/app/*` family (Phase 2C todo 5).
 *
 * Phase 2A walked every public screen in both themes and Phase 2C todo 4 added
 * the two `/auth/*` screens once the local Supabase was up. What stayed outside
 * every browser sweep was this family, because it redirects to `/auth/login`
 * without a session. `helpers/session.ts` mints one, so these screens are now
 * held to the same bar as the public ones.
 *
 * Two routes are deliberately absent: `/app/connect/github` reads
 * `GITHUB_APP_ID` and friends at render time and answers 500 without them, and
 * `/app/connect/github/repositories` redirects into it. Those two need the G2
 * gate (a registered GitHub App); they join the sweep when the live pilot runs.
 */
export const AUTHENTICATED_SCREENS = [
  ["app-workspace", "/app"],
  ["app-map", "/app/map"],
  ["app-commits", "/app/commits"],
  ["app-inspection", "/app/inspection"],
  ["app-team", "/app/team"],
  ["app-progress", "/app/progress"],
  ["app-stats", "/app/stats"],
  ["app-library", "/app/library"],
  ["app-harness", "/app/harness"],
  ["app-settings-mcp", "/app/settings/mcp"],
  ["app-settings-ai", "/app/settings/ai"],
  ["app-settings-privacy", "/app/settings/privacy"],
] as const;
