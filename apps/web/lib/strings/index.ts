/**
 * Korean-first UI copy, centralized per app area (Phase 2A todo 3).
 *
 * Screens import from here instead of inlining literals, so a copy sweep is one
 * file per area rather than a grep across the tree — and so the Korean-first
 * policy is testable (`tests/korean-strings.test.ts`).
 */

export { ASSURANCE } from "./assurance";
export { AUTH } from "./auth";
export { ACTION, BRAND, GRADE, NAV, NOT_FOUND, THEME } from "./common";
export { COMMITS } from "./commits";
export { DASHBOARD } from "./dashboard";
export { GRAPH } from "./graph";
export { HARNESS } from "./harness";
export { INSPECTION } from "./inspection";
export { LIBRARY } from "./library";
export { WORKSPACE_MAP } from "./map";
export { ONBOARDING } from "./onboarding";
export { PROGRESS } from "./progress";
export { SETTINGS } from "./settings";
export { STATS } from "./stats";
export { TEAM } from "./team";
export {
  CONVENTIONAL_ENGLISH_TERMS,
  type ConventionalEnglishTerm,
} from "./terms";
