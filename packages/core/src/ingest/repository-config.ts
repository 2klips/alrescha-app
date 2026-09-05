import picomatch from "picomatch";

/**
 * Repository-level scan conventions, read from `.alrescha.json` in the tree
 * (Phase 4 Wave A todo 2, ADR-013).
 *
 * The file lives in the repository, not in our database: both ingest paths
 * read the same bytes from the same commit, so the plan they produce is the
 * same one — a convention stored only server-side would make the CLI and the
 * GitHub path disagree about what a repository contains.
 *
 * Only `ignore` is honoured here. The rest of the file's vocabulary (layout
 * conventions, hidden layers, todo and progress document lists) needs
 * `repositories.layout_config` to mean anything and arrives with it in
 * Wave A todo 4; parsing it now would store a setting nothing reads.
 */

export const REPOSITORY_CONFIG_PATH = ".alrescha.json";

/** Patterns per repository. Bounded: a config file is not a program. */
const MAX_IGNORE_PATTERNS = 200;
const MAX_PATTERN_LENGTH = 200;

export interface RepositoryScanConfig {
  /** Globs the repository excludes on top of the built-in defaults. */
  readonly ignore: readonly string[];
}

export const EMPTY_REPOSITORY_CONFIG: RepositoryScanConfig = Object.freeze({
  ignore: [],
});

function ignorePatterns(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is string =>
        typeof entry === "string" &&
        entry.length > 0 &&
        entry.length <= MAX_PATTERN_LENGTH,
    )
    .slice(0, MAX_IGNORE_PATTERNS);
}

/**
 * Parse `.alrescha.json`. A file that does not parse, or states nothing this
 * build understands, yields the empty config — a repository is never harder
 * to scan because its settings file has a typo.
 */
export function parseRepositoryConfig(source: string): RepositoryScanConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return EMPTY_REPOSITORY_CONFIG;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return EMPTY_REPOSITORY_CONFIG;
  }
  const ignore = ignorePatterns((parsed as Record<string, unknown>)["ignore"]);
  return ignore.length === 0 ? EMPTY_REPOSITORY_CONFIG : { ignore };
}

/**
 * A matcher for the repository's own ignore list. `dot: true` because the
 * directories a repository most wants out — `.omo`, `.claude` — start with
 * one, and a bare directory pattern covers everything under it.
 */
export function repositoryIgnoreMatcher(
  config: RepositoryScanConfig,
): (path: string) => boolean {
  if (config.ignore.length === 0) return () => false;
  const patterns = config.ignore.flatMap((pattern) =>
    pattern.endsWith("/") ? [`${pattern}**`, pattern.slice(0, -1)] : [pattern],
  );
  const matches = picomatch(patterns, { dot: true });
  return (path: string) => matches(path);
}
