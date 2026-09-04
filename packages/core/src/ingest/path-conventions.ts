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
