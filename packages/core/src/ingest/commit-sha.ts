/**
 * Git's null object id: forty zeros. It is not a commit — it is what Git and
 * GitHub write where a commit is *absent*. A push webhook for a deleted
 * branch or tag carries it as `after` (`deleted: true`, `head_commit: null`),
 * and a plain "forty hex characters" check accepts it. That is how six scan
 * jobs reached the production worker at a commit no tree can be fetched for
 * (2026-09-09 → 12; `.omo/evidence/phase4/null-sha-scan-requests-2026-09-12.md`).
 */
export const NULL_GIT_SHA = "0000000000000000000000000000000000000000";

/**
 * Forty lowercase hex characters naming an actual commit — the format check
 * every scan producer already ran, plus the one value that passes it without
 * being a commit.
 */
export function isScannableCommitSha(value: string): boolean {
  return /^[0-9a-f]{40}$/.test(value) && value !== NULL_GIT_SHA;
}
