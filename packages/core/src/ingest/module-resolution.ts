import ts from "typescript";

import {
  directoryOf,
  isUnderDirectory,
  joinRepositoryPath,
} from "./path-conventions";

/**
 * Non-relative module resolution for the scanner (Phase 4 Wave A todo 0).
 *
 * Before this, `resolveTypeScriptSpecifier` dropped every specifier that did
 * not start with `.`, so a monorepo import (`@alrescha/core`), a Next.js path
 * alias (`@/lib/x`) and a Python package import (`from app.core import x`)
 * produced no edge at all (R5 §2.2 D1).
 *
 * Measured on this repository, that is worth +12.7% more links (1,486 → 1,675
 * on a full local scan) — real, and not the headline. The headline is the
 * relink: production held roughly 135 structure edges for the same tree
 * because an incremental scan never re-parses an unchanged file. What alias
 * resolution changes is *which* links exist, not mainly how many — it is the
 * only way a cross-package or cross-language edge can be drawn at all, and a
 * repository that imports by package name rather than by relative path (the
 * `@/*` layout every Next.js app ships with) has no other source of them.
 *
 * What travels: only the manifests' *declared mappings* — package names,
 * `exports`/`main`/`module`/`types` targets, tsconfig `paths`/`baseUrl`, and
 * the set of directories that look like Python source roots. Manifest bodies
 * are read transiently during the scan and never persist, exactly like every
 * other file the scanner reads (WORK_SPEC §3-3).
 *
 * Both ingest paths build this from the same repository tree through the same
 * `RepositorySource`, so the GitHub path and `alrescha push` derive identical
 * rules from identical inputs (ADR-013).
 */

export type ResolutionTier = "reference" | "resolved";

export type AliasSource =
  "package-conventional" | "package-manifest" | "tsconfig-paths";

export interface AliasTarget {
  /** Repo-relative path prefix; `*` is substituted with the captured text. */
  readonly path: string;
  /**
   * `resolved` when a manifest field states this mapping outright;
   * `reference` when it comes from a layout convention the manifest is
   * silent about (a package with no `exports`/`main` still usually resolves
   * to `src/index`, but nothing in the repository says so).
   */
  readonly tier: ResolutionTier;
}

export interface AliasRule {
  readonly patternPrefix: string;
  readonly patternSuffix: string;
  /** Directory the rule governs; `""` is the whole repository. */
  readonly scope: string;
  readonly source: AliasSource;
  readonly targets: readonly AliasTarget[];
  readonly wildcard: boolean;
}

export interface ModuleResolutionConfig {
  readonly aliases: readonly AliasRule[];
  /**
   * Directories a Python absolute import is resolved against, deepest first.
   * Derived from `__init__.py` chains and from project manifests, because
   * `from app.core import x` inside `backend/app/api/routes.py` means
   * `backend/app/core`, not `app/core` (R5 §1.3).
   */
  readonly pythonRoots: readonly string[];
}

export const EMPTY_MODULE_RESOLUTION: ModuleResolutionConfig = {
  aliases: [],
  pythonRoots: [""],
};

/** Manifest files worth fetching during a scan. Order-insensitive. */
const PACKAGE_MANIFEST = "package.json";
const PYTHON_PROJECT_MANIFESTS = new Set([
  "pyproject.toml",
  "setup.cfg",
  "setup.py",
]);

function isTsconfigName(fileName: string): boolean {
  return (
    fileName === "jsconfig.json" ||
    fileName === "tsconfig.json" ||
    (fileName.startsWith("tsconfig.") && fileName.endsWith(".json"))
  );
}

export function isManifestPath(path: string): boolean {
  const fileName = path.slice(path.lastIndexOf("/") + 1);
  return (
    fileName === PACKAGE_MANIFEST ||
    isTsconfigName(fileName) ||
    PYTHON_PROJECT_MANIFESTS.has(fileName)
  );
}

/**
 * Manifests inside dependency or build directories describe code the scan
 * never reads, and a large repository can hold thousands of them.
 */
const IGNORED_MANIFEST_SEGMENTS = new Set([
  ".git",
  ".next",
  ".turbo",
  ".venv",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "site-packages",
  "venv",
]);

export function isIgnoredManifestPath(path: string): boolean {
  return path
    .split("/")
    .slice(0, -1)
    .some((segment) => IGNORED_MANIFEST_SEGMENTS.has(segment));
}

/** Upper bound on manifests read per scan — a guard, not a product limit. */
export const MAX_MANIFESTS_PER_SCAN = 400;
/** Manifests larger than this are skipped; real ones are a few kilobytes. */
export const MAX_MANIFEST_BYTES = 512 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Strip a leading `./` and normalize against the manifest's directory. */
function targetPath(directory: string, value: string): string | null {
  if (value.startsWith("/")) return null;
  return joinRepositoryPath(directory, value);
}

/**
 * Conditional `exports` entries nest by condition (`import`, `require`,
 * `types`, `default`, …). Every string leaf is a legitimate target, so the
 * shallow walk collects them in declaration order and the probe below picks
 * whichever exists in the tree.
 */
function collectExportTargets(value: unknown, depth = 0): string[] {
  if (typeof value === "string") return [value];
  if (depth >= 3) return [];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectExportTargets(entry, depth + 1));
  }
  if (isRecord(value)) {
    return Object.values(value).flatMap((entry) =>
      collectExportTargets(entry, depth + 1),
    );
  }
  return [];
}

const MAX_TARGETS_PER_RULE = 6;

function manifestTargets(
  directory: string,
  values: readonly string[],
): AliasTarget[] {
  const targets: AliasTarget[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const path = targetPath(directory, value);
    if (path === null || path.length === 0 || seen.has(path)) continue;
    seen.add(path);
    targets.push({ path, tier: "resolved" });
    if (targets.length >= MAX_TARGETS_PER_RULE) break;
  }
  return targets;
}

/**
 * Where a package resolves when its manifest declares no entry point. These
 * are conventions, not statements, so links built from them stay `reference`.
 */
function conventionalTargets(directory: string, suffix: string): AliasTarget[] {
  const paths = [
    joinRepositoryPath(directory, `src${suffix}`),
    joinRepositoryPath(directory, suffix.replace(/^\//, "")),
  ];
  const targets: AliasTarget[] = [];
  const seen = new Set<string>();
  for (const path of paths) {
    if (path === null || path.length === 0 || seen.has(path)) continue;
    seen.add(path);
    targets.push({ path, tier: "reference" });
  }
  return targets;
}

function packageRules(manifestPath: string, text: string): AliasRule[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!isRecord(parsed)) return [];
  const name = parsed["name"];
  if (typeof name !== "string" || name.length === 0) return [];
  const directory = directoryOf(manifestPath);
  const rules: AliasRule[] = [];

  const rootTargets: string[] = [];
  const exports = parsed["exports"];
  let sawSubpathExports = false;
  if (typeof exports === "string") {
    rootTargets.push(exports);
  } else if (isRecord(exports)) {
    for (const [key, value] of Object.entries(exports)) {
      if (!key.startsWith(".")) {
        // Bare condition keys (`{ "import": "./x.js" }`) describe the root.
        rootTargets.push(...collectExportTargets(value));
        continue;
      }
      if (key === ".") {
        rootTargets.push(...collectExportTargets(value));
        continue;
      }
      sawSubpathExports = true;
      const subpath = key.slice(1);
      const targets = manifestTargets(directory, collectExportTargets(value));
      if (targets.length === 0) continue;
      const pattern = `${name}${subpath}`;
      const star = pattern.indexOf("*");
      rules.push(
        star === -1
          ? {
              patternPrefix: pattern,
              patternSuffix: "",
              scope: "",
              source: "package-manifest",
              targets,
              wildcard: false,
            }
          : {
              patternPrefix: pattern.slice(0, star),
              patternSuffix: pattern.slice(star + 1),
              scope: "",
              source: "package-manifest",
              targets,
              wildcard: true,
            },
      );
    }
  }
  for (const field of ["module", "main", "types", "typings"] as const) {
    const value = parsed[field];
    if (typeof value === "string") rootTargets.push(value);
  }

  const declaredRoot = manifestTargets(directory, rootTargets);
  rules.push({
    patternPrefix: name,
    patternSuffix: "",
    scope: "",
    source:
      declaredRoot.length > 0 ? "package-manifest" : "package-conventional",
    targets:
      declaredRoot.length > 0
        ? declaredRoot
        : conventionalTargets(directory, "/index"),
    wildcard: false,
  });

  if (!sawSubpathExports) {
    // `@scope/pkg/some/module` in a workspace that publishes no subpath map.
    rules.push({
      patternPrefix: `${name}/`,
      patternSuffix: "",
      scope: "",
      source: "package-conventional",
      targets: conventionalTargets(directory, "/*"),
      wildcard: true,
    });
  }

  return rules;
}

interface TsconfigPaths {
  readonly baseUrl: string | undefined;
  readonly extends: string | undefined;
  readonly paths: Record<string, readonly string[]> | undefined;
}

function readTsconfig(manifestPath: string, text: string): TsconfigPaths {
  const parsed = ts.parseConfigFileTextToJson(manifestPath, text);
  const config = isRecord(parsed.config) ? parsed.config : {};
  const options = isRecord(config["compilerOptions"])
    ? config["compilerOptions"]
    : {};
  const rawPaths = isRecord(options["paths"]) ? options["paths"] : undefined;
  const paths: Record<string, readonly string[]> = {};
  for (const [pattern, value] of Object.entries(rawPaths ?? {})) {
    if (!Array.isArray(value)) continue;
    const targets = value.filter(
      (entry): entry is string => typeof entry === "string",
    );
    if (targets.length > 0) paths[pattern] = targets;
  }
  const baseUrl = options["baseUrl"];
  const extendsValue = config["extends"];
  return {
    baseUrl: typeof baseUrl === "string" ? baseUrl : undefined,
    extends: typeof extendsValue === "string" ? extendsValue : undefined,
    paths: Object.keys(paths).length > 0 ? paths : undefined,
  };
}

const MAX_EXTENDS_DEPTH = 4;

function tsconfigRules(
  manifestPath: string,
  manifests: ReadonlyMap<string, string>,
): AliasRule[] {
  const scope = directoryOf(manifestPath);
  const rules: AliasRule[] = [];
  const visited = new Set<string>();

  let currentPath: string | undefined = manifestPath;
  let inheritedBaseUrl: string | undefined;
  for (let depth = 0; depth < MAX_EXTENDS_DEPTH && currentPath; depth += 1) {
    if (visited.has(currentPath)) break;
    visited.add(currentPath);
    const text = manifests.get(currentPath);
    if (text === undefined) break;
    const config: TsconfigPaths = readTsconfig(currentPath, text);
    const configDirectory = directoryOf(currentPath);
    const baseUrl = config.baseUrl ?? inheritedBaseUrl;
    inheritedBaseUrl = baseUrl;

    if (config.paths) {
      // `paths` are relative to `baseUrl` when one is set, otherwise to the
      // config file's own directory (the TypeScript 5 rule).
      const base =
        baseUrl === undefined
          ? configDirectory
          : (joinRepositoryPath(configDirectory, baseUrl) ?? configDirectory);
      for (const [pattern, values] of Object.entries(config.paths)) {
        const targets: AliasTarget[] = [];
        const seen = new Set<string>();
        for (const value of values) {
          const path = targetPath(base, value);
          if (path === null || path.length === 0 || seen.has(path)) continue;
          seen.add(path);
          targets.push({ path, tier: "resolved" });
          if (targets.length >= MAX_TARGETS_PER_RULE) break;
        }
        if (targets.length === 0) continue;
        const star = pattern.indexOf("*");
        rules.push(
          star === -1
            ? {
                patternPrefix: pattern,
                patternSuffix: "",
                scope,
                source: "tsconfig-paths",
                targets,
                wildcard: false,
              }
            : {
                patternPrefix: pattern.slice(0, star),
                patternSuffix: pattern.slice(star + 1),
                scope,
                source: "tsconfig-paths",
                targets,
                wildcard: true,
              },
        );
      }
    }

    currentPath = config.extends
      ? (joinRepositoryPath(configDirectory, config.extends) ?? undefined)
      : undefined;
    if (currentPath && !manifests.has(currentPath)) {
      // `extends` may name a `.json`-less path or a package; only in-tree
      // files are followed — a node_modules preset is not repository data.
      const withExtension = `${currentPath}.json`;
      currentPath = manifests.has(withExtension) ? withExtension : undefined;
    }
  }

  return rules;
}

const SOURCE_ORDER: Record<AliasSource, number> = {
  "tsconfig-paths": 0,
  "package-manifest": 1,
  "package-conventional": 2,
};

/**
 * Python source roots: the directory a top-level package sits in. Walking up
 * the `__init__.py` chain finds them without any manifest; project manifests
 * add the `src/` layout, which has no `__init__.py` at its own level.
 */
function pythonRootsOf(
  treePaths: ReadonlySet<string>,
  manifestPaths: readonly string[],
): string[] {
  const roots = new Set<string>([""]);
  for (const path of treePaths) {
    if (!path.endsWith(".py")) continue;
    let directory = directoryOf(path);
    for (let depth = 0; depth < 32; depth += 1) {
      if (directory === "") break;
      if (!treePaths.has(`${directory}/__init__.py`)) break;
      directory = directoryOf(directory);
    }
    roots.add(directory);
  }
  for (const manifestPath of manifestPaths) {
    const fileName = manifestPath.slice(manifestPath.lastIndexOf("/") + 1);
    if (!PYTHON_PROJECT_MANIFESTS.has(fileName)) continue;
    const directory = directoryOf(manifestPath);
    roots.add(directory);
    const sourceLayout = joinRepositoryPath(directory, "src");
    if (sourceLayout !== null) roots.add(sourceLayout);
  }
  return [...roots].sort(
    (left, right) =>
      right.split("/").length - left.split("/").length ||
      left.localeCompare(right),
  );
}

/**
 * Build the resolution config from the repository tree and the manifest
 * bodies read this pass. Pure and order-independent: the same inputs give
 * byte-identical rules on either ingest path.
 */
export function buildModuleResolution(input: {
  readonly manifests: ReadonlyMap<string, string>;
  readonly treePaths: ReadonlySet<string>;
}): ModuleResolutionConfig {
  const manifestPaths = [...input.manifests.keys()].sort((left, right) =>
    left.localeCompare(right),
  );
  const aliases: AliasRule[] = [];
  for (const manifestPath of manifestPaths) {
    const text = input.manifests.get(manifestPath);
    if (text === undefined) continue;
    const fileName = manifestPath.slice(manifestPath.lastIndexOf("/") + 1);
    if (fileName === PACKAGE_MANIFEST) {
      aliases.push(...packageRules(manifestPath, text));
    } else if (isTsconfigName(fileName)) {
      aliases.push(...tsconfigRules(manifestPath, input.manifests));
    }
  }

  aliases.sort(
    (left, right) =>
      right.scope.length - left.scope.length ||
      right.patternPrefix.length - left.patternPrefix.length ||
      SOURCE_ORDER[left.source] - SOURCE_ORDER[right.source] ||
      left.patternPrefix.localeCompare(right.patternPrefix) ||
      left.scope.localeCompare(right.scope),
  );

  return {
    aliases,
    pythonRoots: pythonRootsOf(input.treePaths, manifestPaths),
  };
}

export interface AliasMatch {
  readonly candidates: readonly string[];
  readonly tier: ResolutionTier;
}

/**
 * Candidate paths for a non-relative specifier, best rule first. Nothing is
 * asserted here: the caller probes each candidate against the tree and keeps
 * only the ones that name a file the scan actually saw.
 */
export function aliasCandidates(
  specifier: string,
  fromPath: string,
  config: ModuleResolutionConfig,
): readonly AliasMatch[] {
  const matches: AliasMatch[] = [];
  for (const rule of config.aliases) {
    if (!isUnderDirectory(fromPath, rule.scope)) continue;
    let captured: string | null = null;
    if (rule.wildcard) {
      const minimumLength =
        rule.patternPrefix.length + rule.patternSuffix.length;
      if (
        specifier.length >= minimumLength &&
        specifier.startsWith(rule.patternPrefix) &&
        specifier.endsWith(rule.patternSuffix)
      ) {
        captured = specifier.slice(
          rule.patternPrefix.length,
          specifier.length - rule.patternSuffix.length,
        );
      }
    } else if (specifier === rule.patternPrefix) {
      captured = "";
    }
    if (captured === null) continue;
    for (const target of rule.targets) {
      const path = target.path.includes("*")
        ? target.path.replace("*", captured)
        : captured.length > 0
          ? `${target.path}/${captured}`
          : target.path;
      const normalized = joinRepositoryPath(path);
      if (normalized === null || normalized.length === 0) continue;
      matches.push({ candidates: [normalized], tier: target.tier });
    }
  }
  return matches;
}
