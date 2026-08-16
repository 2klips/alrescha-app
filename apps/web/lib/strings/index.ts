/**
 * Korean-first UI copy, centralized per app area (Phase 2A todo 3).
 *
 * Screens import from here instead of inlining literals, so a copy sweep is one
 * file per area rather than a grep across the tree — and so the Korean-first
 * policy is testable (`tests/korean-strings.test.ts`).
 */

export { ASSURANCE } from "./assurance";
export { ACTION, BRAND, GRADE, NAV, THEME } from "./common";
export { DASHBOARD } from "./dashboard";
export { PROGRESS } from "./progress";
export { CONVENTIONAL_ENGLISH_TERMS, type ConventionalEnglishTerm } from "./terms";
