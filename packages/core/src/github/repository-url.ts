/**
 * Parses user-pasted GitHub repository references into `owner/repo`.
 *
 * Accepted shapes (BUILD_PLAN_PHASE2B todo 1):
 * - `https://github.com/owner/repo` (optional `.git`, trailing slash, deep
 *   links such as `/tree/main`, query strings, and hashes)
 * - `http://` and `www.github.com` variants of the above
 * - `github.com/owner/repo` without a scheme
 * - `git@github.com:owner/repo.git` (scp-like SSH)
 * - `ssh://git@github.com/owner/repo.git`
 * - `owner/repo` shorthand
 *
 * Anything on a non-GitHub host is rejected as `unsupported_host` rather
 * than silently treated as a repository name.
 */

export type GitHubRepositoryUrlFailure =
  "empty" | "unsupported_host" | "missing_repository" | "invalid_name";

export type ParsedGitHubRepositoryUrl =
  | {
      readonly ok: true;
      readonly owner: string;
      readonly repo: string;
      readonly fullName: string;
    }
  | { readonly ok: false; readonly reason: GitHubRepositoryUrlFailure };

const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

function failure(
  reason: GitHubRepositoryUrlFailure,
): ParsedGitHubRepositoryUrl {
  return { ok: false, reason };
}

function fromSegments(segments: readonly string[]): ParsedGitHubRepositoryUrl {
  const [owner, rawRepo] = segments;
  if (!owner || !rawRepo) return failure("missing_repository");
  const repo = rawRepo.endsWith(".git") ? rawRepo.slice(0, -4) : rawRepo;
  if (
    !OWNER_PATTERN.test(owner) ||
    !REPO_PATTERN.test(repo) ||
    repo === "." ||
    repo === ".."
  ) {
    return failure("invalid_name");
  }
  return { fullName: `${owner}/${repo}`, ok: true, owner, repo };
}

function isGitHubHost(host: string): boolean {
  const normalized = host.toLowerCase();
  return normalized === "github.com" || normalized === "www.github.com";
}

export function parseGitHubRepositoryUrl(
  input: string,
): ParsedGitHubRepositoryUrl {
  const trimmed = input.trim();
  if (!trimmed) return failure("empty");

  // scp-like SSH: git@github.com:owner/repo(.git)
  const scpMatch = /^git@([^:/\s]+):(.+)$/.exec(trimmed);
  if (scpMatch) {
    if (!isGitHubHost(scpMatch[1]!)) return failure("unsupported_host");
    return fromSegments(scpMatch[2]!.split("/").filter(Boolean));
  }

  // URL shapes, with or without an explicit scheme.
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : /^(?:www\.)?github\.com[/:]/i.test(trimmed)
      ? `https://${trimmed}`
      : null;
  if (withScheme) {
    let url: URL;
    try {
      url = new URL(withScheme);
    } catch {
      return failure("missing_repository");
    }
    if (!/^(?:https?|ssh|git)$/.test(url.protocol.replace(":", ""))) {
      return failure("unsupported_host");
    }
    if (!isGitHubHost(url.hostname)) return failure("unsupported_host");
    return fromSegments(url.pathname.split("/").filter(Boolean));
  }

  // Bare shorthand: owner/repo, nothing more.
  const segments = trimmed.split("/").filter(Boolean);
  if (segments.length !== 2 || trimmed.includes(" "))
    return failure("missing_repository");
  return fromSegments(segments);
}
