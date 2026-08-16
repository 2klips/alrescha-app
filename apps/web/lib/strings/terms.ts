/**
 * Korean-first copy policy (ADR-009-3 / Phase 2A todo 3).
 *
 * UI copy is Korean. The terms below stay in English because they are the
 * conventional form Korean developers already read and write — translating them
 * would make the product harder to scan, not easier. Everything else must be
 * Korean; `tests/korean-strings.test.ts` enforces both halves of that rule.
 */

export const CONVENTIONAL_ENGLISH_TERMS = [
  // Product + surfaces
  "Arr",
  /** Brand tagline — an asset, not copy (ADR-008). */
  "Proof, before merge.",
  "Dark",
  "Light",
  "Dashboard",
  "Graph",
  "Findings",
  "Receipt",
  "Receipts",
  "Data Brain",
  "Inspector",
  "Live",
  // Evidence vocabulary — the verified/inferred split is product identity.
  "verified",
  "inferred",
  "broken",
  "open",
  "resolved",
  "blocked",
  "confidence",
  "stale",
  "critical",
  "high",
  "medium",
  "low",
  // Platform + protocol
  "MCP",
  "GitHub",
  "GitHub App",
  "GitHub Actions",
  "CI",
  "commit",
  "SHA-256",
  "in-toto",
  "Statement",
  "digest",
  "token",
  "tokens",
  "log_progress",
  "search_index",
  "get_artifact",
  "request_context_pack",
  "AGENTS.md",
  "CLAUDE.md",
  "TODO",
  "todo",
  "Todo",
  "contents:read",
  "cl100k_base",
] as const;

export type ConventionalEnglishTerm = (typeof CONVENTIONAL_ENGLISH_TERMS)[number];
