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
 * `ignore` is applied by the scanner before anything is classified (todo 2).
 * The rest — layout conventions, hidden layers, todo and progress document
 * lists — travels in the plan as *parsed values*, never as the file's text,
 * and is stored on the repository with the commit that stated it, so a
 * reader can tell which commit's conventions produced a given picture
 * (todo 4).
 */

export const REPOSITORY_CONFIG_PATH = ".alrescha.json";

/** Patterns per repository. Bounded: a config file is not a program. */
const MAX_IGNORE_PATTERNS = 200;
const MAX_PATTERN_LENGTH = 200;

/** Path prefixes a repository claims for each domain (todo 4). */
export interface RepositoryLayout {
  readonly backend?: readonly string[];
  readonly database?: readonly string[];
  readonly frontend?: readonly string[];
  readonly shared?: readonly string[];
}

export interface RepositoryScanConfig {
  /** Globs the repository excludes on top of the built-in defaults. */
  readonly ignore: readonly string[];
  /**
   * Layers the map hides by default. Stored rather than acted on: a hidden
   * layer is still part of the graph, it is simply not drawn until asked for
   * (Wave B todo 12 owns the toggle).
   */
  readonly layersHidden: readonly string[];
  readonly layout: RepositoryLayout;
  /** Documents this repository keeps its progress ledger in. */
  readonly progressDocs: readonly string[];
  /**
   * Extra ID-token prefixes whose headings become section nodes, on top of
   * `ADR`/`OQ`/`MT`/`G` (todo 8). Literal prefixes, never patterns: this file
   * comes from the repository being scanned, and a regex from there would run
   * over every document in the tree (OQ-054).
   */
  readonly sectionTokens: readonly string[];
  /** Documents this repository keeps its todo list in. */
  readonly todoFiles: readonly string[];
}

export const EMPTY_REPOSITORY_CONFIG: RepositoryScanConfig = Object.freeze({
  ignore: [],
  layersHidden: [],
  layout: Object.freeze({}),
  progressDocs: [],
  sectionTokens: [],
  todoFiles: [],
});

const LAYOUT_DOMAINS = ["backend", "database", "frontend", "shared"] as const;

function stringList(value: unknown): string[] {
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

function layoutOf(value: unknown): RepositoryLayout {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  const source = value as Record<string, unknown>;
  const layout: Record<string, readonly string[]> = {};
  for (const domain of LAYOUT_DOMAINS) {
    const prefixes = stringList(source[domain]);
    if (prefixes.length > 0) layout[domain] = prefixes;
  }
  return layout;
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
  const source_ = parsed as Record<string, unknown>;
  const layers = source_["layers"];
  const config: RepositoryScanConfig = {
    ignore: stringList(source_["ignore"]),
    layersHidden: stringList(
      typeof layers === "object" && layers !== null && !Array.isArray(layers)
        ? (layers as Record<string, unknown>)["hidden"]
        : undefined,
    ),
    layout: layoutOf(source_["layout"]),
    progressDocs: stringList(source_["progressDocs"]),
    sectionTokens: stringList(source_["sectionTokens"]),
    todoFiles: stringList(source_["todoFiles"]),
  };
  return isEmptyRepositoryConfig(config) ? EMPTY_REPOSITORY_CONFIG : config;
}

/** True when the config states nothing this build acts on. */
export function isEmptyRepositoryConfig(config: RepositoryScanConfig): boolean {
  return (
    config.ignore.length === 0 &&
    config.layersHidden.length === 0 &&
    config.progressDocs.length === 0 &&
    config.sectionTokens.length === 0 &&
    config.todoFiles.length === 0 &&
    Object.keys(config.layout).length === 0
  );
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

/**
 * A matcher for the documents a repository says hold its todo list and its
 * progress ledger (Phase 4 Wave D todo 21).
 *
 * Both lists feed one matcher because the graph has one `todo` kind: the
 * difference between "what we plan to do" and "what we recorded doing" lives
 * in the checkbox states, not in what the file is. Keeping them as two
 * settings is still worth it — a repository writes down which of its
 * documents is which, and a later build that does act on the distinction
 * will not have to ask again.
 *
 * The pattern is a glob, not a prefix: a repository naming
 * `docs/plans/**\/tasks.md` means the ones under that tree and not a file
 * that happens to start with the same letters.
 */
export function repositoryTodoMatcher(
  config: RepositoryScanConfig,
): (path: string) => boolean {
  const patterns = [...config.progressDocs, ...config.todoFiles].flatMap(
    (pattern) =>
      pattern.endsWith("/")
        ? [`${pattern}**`, pattern.slice(0, -1)]
        : [pattern],
  );
  if (patterns.length === 0) return () => false;
  const matches = picomatch(patterns, { dot: true });
  return (path: string) => matches(path);
}
