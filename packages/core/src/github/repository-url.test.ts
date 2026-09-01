import { describe, expect, it } from "vitest";

import { parseGitHubRepositoryUrl } from "./repository-url";

const ACCEPTED: ReadonlyArray<readonly [string, string]> = [
  ["https://github.com/2klips/alrescha-app", "2klips/alrescha-app"],
  ["https://github.com/2klips/alrescha-app.git", "2klips/alrescha-app"],
  ["https://github.com/2klips/alrescha-app/", "2klips/alrescha-app"],
  [
    "https://github.com/2klips/alrescha-app/tree/main/apps/web",
    "2klips/alrescha-app",
  ],
  [
    "https://github.com/2klips/alrescha-app?tab=readme-ov-file#readme",
    "2klips/alrescha-app",
  ],
  ["http://github.com/2klips/alrescha-app", "2klips/alrescha-app"],
  ["https://www.github.com/2klips/alrescha-app", "2klips/alrescha-app"],
  ["github.com/2klips/alrescha-app", "2klips/alrescha-app"],
  ["www.github.com/2klips/alrescha-app", "2klips/alrescha-app"],
  ["git@github.com:2klips/alrescha-app.git", "2klips/alrescha-app"],
  ["git@github.com:2klips/alrescha-app", "2klips/alrescha-app"],
  ["ssh://git@github.com/2klips/alrescha-app.git", "2klips/alrescha-app"],
  ["2klips/alrescha-app", "2klips/alrescha-app"],
  ["  2klips/alrescha-app  ", "2klips/alrescha-app"],
  ["owner-with-dash/repo.name_mix-1", "owner-with-dash/repo.name_mix-1"],
];

const REJECTED: ReadonlyArray<readonly [string, string]> = [
  ["", "empty"],
  ["   ", "empty"],
  ["https://gitlab.com/owner/repo", "unsupported_host"],
  ["git@gitlab.com:owner/repo.git", "unsupported_host"],
  ["https://github.io/owner/repo", "unsupported_host"],
  ["ftp://github.com/owner/repo", "unsupported_host"],
  ["https://github.com/owner-only", "missing_repository"],
  ["https://github.com/", "missing_repository"],
  ["owner-only", "missing_repository"],
  ["a/b/c", "missing_repository"],
  ["not a url at all", "missing_repository"],
  ["https://github.com/-bad-owner/repo", "invalid_name"],
  ["https://github.com/owner/re po", "invalid_name"],
  ["https://github.com/owner/..", "missing_repository"],
  ["owner/..", "invalid_name"],
];

describe("parseGitHubRepositoryUrl", () => {
  it.each(ACCEPTED)("accepts %s", (input, fullName) => {
    const parsed = parseGitHubRepositoryUrl(input);
    expect(parsed).toMatchObject({ fullName, ok: true });
    if (parsed.ok) {
      expect(`${parsed.owner}/${parsed.repo}`).toBe(fullName);
    }
  });

  it.each(REJECTED)("rejects %s as %s", (input, reason) => {
    expect(parseGitHubRepositoryUrl(input)).toEqual({ ok: false, reason });
  });
});
