/**
 * Path conventions shared by the scanner, the facet reader and the resolver.
 *
 * Deliberately dependency-free: `artifact-facets` is imported by browser code
 * through the package's `./artifact-facets` subpath export, so anything it
 * reaches must stay free of the TypeScript compiler and of node built-ins.
 */

/**
 * Test files by convention: a `test`/`tests`/`__tests__` path segment, or a
 * `.test.`/`.spec.` filename infix. Python's `test_*.py` / `*_test.py` and
 * Go's `*_test.go` are included so the `tests` relation is not a
 * TypeScript-only feature.
 */
const TEST_PATH_PATTERN =
  /(?:^|\/)(?:__tests__|tests?)(?:\/|$)|\.(?:spec|test)\.[cm]?[jt]sx?$|(?:^|\/)test_[^/]+\.py$|_test\.(?:py|go)$/;

export function isTestPath(path: string): boolean {
  return TEST_PATH_PATTERN.test(path);
}

/** `a/b/c.ts` → `a/b`; a path with no slash yields the empty root. */
export function directoryOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
}

/** `a/b/../c` → `a/c`; null when the path escapes the repository root. */
export function normalizeRepositoryPath(path: string): string | null {
  const segments: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (segments.length === 0) return null;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join("/");
}

/**
 * Paths neither ingest path should ever carry (Phase 4 Wave A todo 2,
 * OQ-043).
 *
 * Two rules, one list. Most of these are gitignored, so the GitHub tree never
 * contains them and applying the list there costs nothing; the CLI walks a
 * working tree, where they are the difference between scanning a repository
 * and scanning its build output. Sharing the constant is what keeps the two
 * paths producing the same plan (ADR-013) — the CLI used to skip `.omo`,
 * which git does track, so the same commit yielded different artifacts
 * depending on which path ingested it.
 *
 * Log and evidence directories (`.omo`, `docs/`) stay in scope: they are
 * written by hand and their links are real. A repository that wants them out
 * says so in `.alrescha.json`.
 */
export const DEFAULT_IGNORED_SEGMENTS: readonly string[] = [
  ".git",
  ".next",
  ".turbo",
  "__pycache__",
  ".venv",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "output",
  "playwright-report",
  "test-results",
  "venv",
  "vendor",
];

/**
 * Directories git excludes by path rather than by name. `.claude/worktrees`
 * holds complete working-tree copies of the repository (2,921 nodes instead
 * of 502 on this one), and a git tree never contains them.
 */
export const DEFAULT_IGNORED_PATHS: readonly string[] = [".claude/worktrees"];

const IGNORED_SEGMENT_SET = new Set(DEFAULT_IGNORED_SEGMENTS);
const IGNORED_FILE_NAMES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "poetry.lock",
  "uv.lock",
  "cargo.lock",
  "composer.lock",
  "gemfile.lock",
]);

/**
 * Whether the default rules drop this path, before any repository-specific
 * `.alrescha.json` entry is considered. Segments match whole directory names;
 * lockfiles match by file name because their content is generated.
 */
export function isDefaultIgnoredPath(path: string): boolean {
  const normalized = path.replaceAll("\\", "/");
  const lower = normalized.toLowerCase();
  for (const ignored of DEFAULT_IGNORED_PATHS) {
    if (lower === ignored || lower.startsWith(`${ignored}/`)) return true;
  }
  const segments = lower.split("/");
  const fileName = segments[segments.length - 1] ?? "";
  if (IGNORED_FILE_NAMES.has(fileName)) return true;
  return segments
    .slice(0, -1)
    .some((segment) => IGNORED_SEGMENT_SET.has(segment));
}

/** True when `path` is inside `directory` (or `directory` is the root). */
export function isUnderDirectory(path: string, directory: string): boolean {
  return directory === "" || path.startsWith(`${directory}/`);
}

/** Join repo-relative parts, dropping empties, then normalize. */
export function joinRepositoryPath(...parts: readonly string[]): string | null {
  return normalizeRepositoryPath(
    parts.filter((part) => part.length > 0).join("/"),
  );
}
