import ts from "typescript";

import {
  aliasCandidates,
  EMPTY_MODULE_RESOLUTION,
  type ModuleResolutionConfig,
  type ResolutionTier,
} from "./module-resolution";
import {
  directoryOf,
  isTestPath,
  joinRepositoryPath,
  normalizeRepositoryPath,
} from "./path-conventions";

/**
 * Structural code links (Phase 3 Wave B todo 3, widened in Phase 4 Wave A
 * todo 0).
 *
 * Two-tier honesty, recorded per link (RESEARCH_KG_FUSION §1/§2):
 * - `resolved` — the connection is deterministic: a module specifier resolved
 *   against the repository tree (relative, or through a mapping a manifest
 *   states outright), or a call through an import binding.
 * - `reference` — a name match, a layout convention, or a structural parse:
 *   plausible, provenance-carried, but not proven by resolution. Rendered
 *   thinner (`edgeStroke`).
 *
 * Only metadata travels: paths, symbol names, line spans. No checker program
 * is built (ADR-014 keeps the engine chain) and no source text leaves the
 * scan; parsing is per-file and resolution runs over the collected metadata.
 */

export type CodeLinkKind = "calls" | "imports" | "tests";
export type CodeLinkMethod =
  | "alias-resolution"
  | "barrel-resolution"
  | "import-binding"
  | "module-resolution"
  | "name-match"
  | "test-import";
export type CodeLinkTier = ResolutionTier;

/**
 * Bumped whenever this resolver can derive links it could not derive before.
 * A repository stamped with an older version is re-linked in full on its next
 * scan (`scanRepository({ mode: "full" })`) instead of keeping the thin graph
 * an incremental pass would preserve — unchanged files are never re-parsed by
 * an incremental scan, so a resolver improvement would otherwise only reach
 * files that happen to change afterwards (R5 §2.2 D2).
 *
 * 1 — relative specifiers only.
 * 2 — workspace/tsconfig aliases, barrel re-exports, Python source roots,
 *     and the derived `tests` relation.
 * 3 — every text file is an artifact, and documents resolve `references`
 *     links to the code and documents they name (Phase 4 Wave A todo 2).
 */
export const LINK_SCHEMA_VERSION = 3;

export interface CodeLinkSpan {
  readonly endLine: number;
  readonly startLine: number;
}

export interface CodeLink {
  readonly kind: CodeLinkKind;
  readonly method: CodeLinkMethod;
  readonly sourcePath: string;
  readonly span: CodeLinkSpan;
  readonly symbols: readonly string[];
  readonly targetPath: string;
  readonly tier: CodeLinkTier;
}

interface RawImportBinding {
  /** Local identifier the file uses (`import { a as b }` → b, `* as ns` → ns). */
  readonly local: string;
  /** Exported name on the target (`a`), or null for a namespace binding. */
  readonly symbol: string | null;
}

/** `export { a as b } from "./x"` — the barrel exports `b`, sourced as `a`. */
interface RawReExport {
  readonly exportedAs: string;
  readonly sourceName: string;
}

interface RawImport {
  readonly bindings: readonly RawImportBinding[];
  /** `export … from` rather than `import …`. */
  readonly isReExport: boolean;
  readonly names: readonly string[];
  readonly reExports: readonly RawReExport[];
  readonly span: CodeLinkSpan;
  readonly specifier: string;
}

interface RawCall {
  /** Identifier the call site is bound to (`foo()` → foo, `ns.foo()` → ns). */
  readonly binding: string;
  /** Member name for `ns.foo()`; null for a bare call. */
  readonly member: string | null;
  readonly span: CodeLinkSpan;
}

/** A base as written: `Base` → binding, or `ns.Base` → binding + member. */
export interface RawHeritageTarget {
  readonly binding: string;
  readonly member: string | null;
}

/**
 * `class A extends B` / `interface I extends J, K` on an exported
 * declaration (Phase 4 Wave F todo 26). `implements` is not here: it is a
 * different claim and the plan asks for `extends` only.
 */
export interface RawHeritage {
  readonly kind: "class" | "interface";
  readonly name: string;
  readonly span: CodeLinkSpan;
  readonly targets: readonly RawHeritageTarget[];
}

export interface ParsedFileLinks {
  readonly calls: readonly RawCall[];
  /** Exported classes and interfaces, and what they extend. */
  readonly heritage: readonly RawHeritage[];
  readonly imports: readonly RawImport[];
  /** Names declared in this file — a bare call to one is not a cross-file link. */
  readonly localNames: ReadonlySet<string>;
}

const TS_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
];

function isExported(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    Boolean(
      ts
        .getModifiers(node)
        ?.some(({ kind }) => kind === ts.SyntaxKind.ExportKeyword),
    )
  );
}

/** The `extends` clause's bases, as identifiers or one-level member accesses. */
function heritageTargets(
  declaration: ts.ClassDeclaration | ts.InterfaceDeclaration,
): RawHeritageTarget[] {
  const targets: RawHeritageTarget[] = [];
  for (const clause of declaration.heritageClauses ?? []) {
    if (clause.token !== ts.SyntaxKind.ExtendsKeyword) continue;
    for (const type of clause.types) {
      const expression = type.expression;
      if (ts.isIdentifier(expression)) {
        targets.push({ binding: expression.text, member: null });
      } else if (
        ts.isPropertyAccessExpression(expression) &&
        ts.isIdentifier(expression.expression)
      ) {
        targets.push({
          binding: expression.expression.text,
          member: expression.name.text,
        });
      }
    }
  }
  return targets;
}

function lineSpan(sourceFile: ts.SourceFile, node: ts.Node): CodeLinkSpan {
  const start = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile),
  );
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  return { endLine: end.line + 1, startLine: start.line + 1 };
}

/** Per-file parse: import/export specifiers, call sites, local declarations. */
export function parseTypeScriptLinks(
  path: string,
  source: string,
): ParsedFileLinks {
  const scriptKind = path.toLowerCase().endsWith("x")
    ? ts.ScriptKind.TSX
    : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );

  const imports: RawImport[] = [];
  const calls: RawCall[] = [];
  const localNames = new Set<string>();
  const heritage: RawHeritage[] = [];

  for (const statement of sourceFile.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      const names: string[] = [];
      const bindings: RawImportBinding[] = [];
      const clause = statement.importClause;
      if (clause?.name) {
        names.push("default");
        bindings.push({ local: clause.name.text, symbol: "default" });
      }
      if (clause?.namedBindings) {
        if (ts.isNamespaceImport(clause.namedBindings)) {
          names.push("*");
          bindings.push({
            local: clause.namedBindings.name.text,
            symbol: null,
          });
        } else {
          for (const element of clause.namedBindings.elements) {
            const symbol = element.propertyName?.text ?? element.name.text;
            names.push(symbol);
            bindings.push({ local: element.name.text, symbol });
          }
        }
      }
      imports.push({
        bindings,
        isReExport: false,
        names,
        reExports: [],
        span: lineSpan(sourceFile, statement),
        specifier: statement.moduleSpecifier.text,
      });
      continue;
    }
    if (
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      const names: string[] = [];
      const reExports: RawReExport[] = [];
      if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          const sourceName = element.propertyName?.text ?? element.name.text;
          names.push(sourceName);
          reExports.push({ exportedAs: element.name.text, sourceName });
        }
      } else {
        names.push("*");
      }
      imports.push({
        bindings: [],
        isReExport: true,
        names,
        reExports,
        span: lineSpan(sourceFile, statement),
        specifier: statement.moduleSpecifier.text,
      });
      continue;
    }
    // Top-level declarations become local names the call pass must ignore.
    if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isEnumDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement)) &&
      statement.name
    ) {
      localNames.add(statement.name.getText(sourceFile));
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name))
          localNames.add(declaration.name.text);
      }
    }
    // Only exported declarations become symbol nodes, so only their bases
    // are worth recording: an `extends` from a private class has no source
    // node to hang from.
    if (
      (ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement)) &&
      statement.name &&
      isExported(statement)
    ) {
      const targets = heritageTargets(statement);
      if (targets.length > 0) {
        heritage.push({
          kind: ts.isClassDeclaration(statement) ? "class" : "interface",
          name: statement.name.text,
          span: lineSpan(sourceFile, statement),
          targets,
        });
      }
    }
  }

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      node.arguments.length === 1 &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      imports.push({
        bindings: [],
        isReExport: false,
        names: ["*"],
        reExports: [],
        span: lineSpan(sourceFile, node),
        specifier: node.arguments[0].text,
      });
    } else if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression)) {
        calls.push({
          binding: node.expression.text,
          member: null,
          span: lineSpan(sourceFile, node),
        });
      } else if (
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression)
      ) {
        calls.push({
          binding: node.expression.expression.text,
          member: node.expression.name.text,
          span: lineSpan(sourceFile, node),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return { calls, heritage, imports, localNames };
}

/** Python `import a.b` / `from a.b import c` — imports only, structural tier. */
export function parsePythonLinks(source: string): ParsedFileLinks {
  const imports: RawImport[] = [];
  const heritage: RawHeritage[] = [];
  source.split(/\r?\n/).forEach((line, index) => {
    const span = { endLine: index + 1, startLine: index + 1 };
    // `class User(Model):` — the bases, structurally (ADR-014: a line, not
    // an AST). Keyword arguments (`metaclass=`), `object` and anything the
    // one-line reading cannot name are left out rather than guessed.
    const classDefinition = /^class\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*:/.exec(
      line,
    );
    if (
      classDefinition?.[1] &&
      classDefinition[2] &&
      !classDefinition[1].startsWith("_")
    ) {
      const targets = classDefinition[2]
        .split(",")
        .flatMap((part): RawHeritageTarget[] => {
          const base = part.trim().replace(/\[.*$/, "");
          if (base.length === 0 || base.includes("=") || base === "object") {
            return [];
          }
          const segments = base.split(".");
          if (segments.some((segment) => !/^[A-Za-z_]\w*$/.test(segment))) {
            return [];
          }
          const [first, second] = segments;
          if (segments.length === 1 && first) {
            return [{ binding: first, member: null }];
          }
          if (segments.length === 2 && first && second) {
            return [{ binding: first, member: second }];
          }
          return [];
        });
      if (targets.length > 0) {
        heritage.push({
          kind: "class",
          name: classDefinition[1],
          span,
          targets,
        });
      }
      return;
    }
    const plain = /^\s*import\s+([\w.]+(?:\s*,\s*[\w.]+)*)/.exec(line);
    if (plain?.[1]) {
      for (const module of plain[1].split(",")) {
        imports.push({
          bindings: [],
          isReExport: false,
          names: ["*"],
          reExports: [],
          span,
          specifier: module.trim(),
        });
      }
      return;
    }
    const named = /^\s*from\s+([\w.]+|\.+[\w.]*)\s+import\s+(.+)$/.exec(line);
    if (named?.[1] && named[2]) {
      const names = named[2]
        .replace(/\(|\)/g, "")
        .split(",")
        .map((part) => part.trim().split(/\s+as\s+/)[0] ?? "")
        .filter((name) => /^[\w*]+$/.test(name));
      imports.push({
        bindings: [],
        isReExport: false,
        names,
        reExports: [],
        span,
        specifier: named[1],
      });
    }
  });
  return { calls: [], heritage, imports, localNames: new Set() };
}

/** Extension and index probing for a repo-relative module path. */
function probeModulePath(
  joined: string,
  knownPaths: ReadonlySet<string>,
): string | null {
  const candidates: string[] = [joined];
  // NodeNext style: `./x.js` written for an on-disk `./x.ts`.
  const withoutExtension = joined.replace(/\.(?:[cm]?js|jsx)$/, "");
  for (const extension of TS_EXTENSIONS) {
    candidates.push(`${joined}${extension}`);
    if (withoutExtension !== joined)
      candidates.push(`${withoutExtension}${extension}`);
  }
  for (const extension of TS_EXTENSIONS) {
    candidates.push(`${joined}/index${extension}`);
  }
  return candidates.find((candidate) => knownPaths.has(candidate)) ?? null;
}

/** Resolve a relative TS/JS specifier against the repository tree. */
export function resolveTypeScriptSpecifier(
  specifier: string,
  fromPath: string,
  knownPaths: ReadonlySet<string>,
): string | null {
  if (!specifier.startsWith(".")) return null;
  const joined = normalizeRepositoryPath(
    `${directoryOf(fromPath)}/${specifier}`,
  );
  if (joined === null) return null;
  return probeModulePath(joined, knownPaths);
}

export interface ResolvedSpecifier {
  readonly method: CodeLinkMethod;
  readonly targetPath: string;
  readonly tier: CodeLinkTier;
}

/**
 * Resolve any TS/JS specifier: relative against the tree, non-relative
 * through the manifest-derived alias rules. A specifier that names a real
 * dependency (`react`) matches no rule and produces nothing — the scanner
 * never invents an edge to code it cannot see.
 */
export function resolveModuleSpecifier(
  specifier: string,
  fromPath: string,
  knownPaths: ReadonlySet<string>,
  resolution: ModuleResolutionConfig,
): ResolvedSpecifier | null {
  if (specifier.startsWith(".")) {
    const relative = resolveTypeScriptSpecifier(
      specifier,
      fromPath,
      knownPaths,
    );
    return relative === null
      ? null
      : {
          method: "module-resolution",
          targetPath: relative,
          tier: "resolved",
        };
  }
  for (const match of aliasCandidates(specifier, fromPath, resolution)) {
    for (const candidate of match.candidates) {
      const probed = probeModulePath(candidate, knownPaths);
      if (probed !== null) {
        return {
          method: "alias-resolution",
          targetPath: probed,
          tier: match.tier,
        };
      }
    }
  }
  return null;
}

/**
 * Resolve a Python module to a repo file, relative dots included. Absolute
 * modules are tried against the source roots — the importing file's own root
 * first, then any root that matches uniquely.
 */
export function resolvePythonModule(
  specifier: string,
  fromPath: string,
  knownPaths: ReadonlySet<string>,
  pythonRoots: readonly string[] = [""],
): string | null {
  const relative = /^(\.+)(.*)$/.exec(specifier);
  if (relative?.[1]) {
    let base = directoryOf(fromPath);
    for (let index = 1; index < relative[1].length; index += 1) {
      base = directoryOf(base);
    }
    return probePythonModule(base, relative[2] ?? "", knownPaths);
  }

  const roots = pythonRoots.length > 0 ? pythonRoots : [""];
  const ownRoot = roots
    .filter((root) => root === "" || fromPath.startsWith(`${root}/`))
    .sort((left, right) => right.length - left.length)[0];
  if (ownRoot !== undefined) {
    const own = probePythonModule(ownRoot, specifier, knownPaths);
    if (own !== null) return own;
  }

  const hits: string[] = [];
  for (const root of roots) {
    if (root === ownRoot) continue;
    const hit = probePythonModule(root, specifier, knownPaths);
    if (hit !== null && !hits.includes(hit)) hits.push(hit);
  }
  return hits.length === 1 ? (hits[0] ?? null) : null;
}

function probePythonModule(
  base: string,
  module: string,
  knownPaths: ReadonlySet<string>,
): string | null {
  const joined = joinRepositoryPath(base, module.replaceAll(".", "/"));
  if (joined === null || joined.length === 0) return null;
  for (const candidate of [`${joined}.py`, `${joined}/__init__.py`]) {
    if (knownPaths.has(candidate)) return candidate;
  }
  return null;
}

export interface ResolveCodeLinksInput {
  /** Exported symbol names per code file — current scan plus previous state. */
  readonly exportsByPath: ReadonlyMap<string, ReadonlySet<string>>;
  /** Per-file parse output for every file scanned this pass. */
  readonly files: ReadonlyMap<string, ParsedFileLinks>;
  /** Every code-file path in the tree (changed or not) — resolution targets. */
  readonly knownPaths: ReadonlySet<string>;
  /** Manifest-derived alias rules and Python roots; empty when unavailable. */
  readonly resolution?: ModuleResolutionConfig;
}

interface MutableLink {
  kind: CodeLinkKind;
  method: CodeLinkMethod;
  sourcePath: string;
  span: CodeLinkSpan;
  symbols: Set<string>;
  targetPath: string;
  tier: CodeLinkTier;
}

const MAX_SYMBOLS_PER_LINK = 8;

function isPython(path: string): boolean {
  return path.toLowerCase().endsWith(".py");
}

/**
 * How many owner paths a symbol needs on record to answer "does exactly one
 * *other* file export this?" for any calling file, without ever storing
 * every owner. 2 is not enough: if the calling file itself exports the
 * symbol (self is one slot) and there are 2 genuine other owners, a
 * 2-slot cap could see only [self, otherA] and wrongly call it unambiguous
 * once self is filtered out. A 3rd slot absorbs that one extra "self might
 * be occupying a slot" case; beyond 3 the true owner count is >=2 no matter
 * which entries got dropped, so the bucketing (0 / exactly 1 / ambiguous)
 * this function needs is never affected by the cap.
 */
const MAX_OWNERS_PER_SYMBOL = 3;

/**
 * symbol name -> up to MAX_OWNERS_PER_SYMBOL paths that export it, built
 * once per scan instead of the old per-call full scan over every code
 * file's export set (O(bareCalls x codeFiles) -> O(totalExportedSymbols)).
 */
function buildSymbolOwnerIndex(
  exportsByPath: ReadonlyMap<string, ReadonlySet<string>>,
): ReadonlyMap<string, readonly string[]> {
  const index = new Map<string, string[]>();
  for (const [ownerPath, names] of exportsByPath) {
    for (const name of names) {
      let owners = index.get(name);
      if (!owners) {
        owners = [];
        index.set(name, owners);
      }
      if (owners.length < MAX_OWNERS_PER_SYMBOL) owners.push(ownerPath);
    }
  }
  return index;
}

interface BarrelTable {
  /** Exported name → the specifier it is re-exported from. */
  readonly named: ReadonlyMap<string, RawReExport & { specifier: string }>;
  /** `export * from` specifiers, in source order. */
  readonly stars: readonly string[];
}

/**
 * Index of the re-export declarations in each file scanned this pass. A file
 * with no `export … from` never appears, so the lookup below is also the
 * "is this a barrel?" test.
 */
function buildBarrelTables(
  files: ReadonlyMap<string, ParsedFileLinks>,
): ReadonlyMap<string, BarrelTable> {
  const tables = new Map<string, BarrelTable>();
  for (const [path, parsed] of files) {
    const named = new Map<string, RawReExport & { specifier: string }>();
    const stars: string[] = [];
    for (const rawImport of parsed.imports) {
      if (!rawImport.isReExport) continue;
      if (rawImport.reExports.length === 0) {
        stars.push(rawImport.specifier);
        continue;
      }
      for (const reExport of rawImport.reExports) {
        if (!named.has(reExport.exportedAs))
          named.set(reExport.exportedAs, {
            ...reExport,
            specifier: rawImport.specifier,
          });
      }
    }
    if (named.size > 0 || stars.length > 0) tables.set(path, { named, stars });
  }
  return tables;
}

const MAX_BARREL_DEPTH = 4;

/**
 * Follow a name through `index.ts`-style re-exports to the file that actually
 * declares it. An `import { scanRepository } from "@alrescha/core"` should
 * connect to the scanner, not pile another edge onto a hub the reader learns
 * nothing from (R5 §2.5). Ambiguity ends the walk: a name reachable through
 * two different `export *` chains resolves to neither.
 */
function resolveThroughBarrel(
  barrelPath: string,
  name: string,
  context: {
    readonly barrels: ReadonlyMap<string, BarrelTable>;
    readonly exportsByPath: ReadonlyMap<string, ReadonlySet<string>>;
    readonly knownPaths: ReadonlySet<string>;
    readonly resolution: ModuleResolutionConfig;
  },
  depth = 0,
  visited: ReadonlySet<string> = new Set(),
): string | null {
  if (depth >= MAX_BARREL_DEPTH || visited.has(barrelPath)) return null;
  const table = context.barrels.get(barrelPath);
  if (!table) return null;
  const nextVisited = new Set(visited).add(barrelPath);

  const direct = table.named.get(name);
  if (direct) {
    const resolved = resolveModuleSpecifier(
      direct.specifier,
      barrelPath,
      context.knownPaths,
      context.resolution,
    );
    if (!resolved) return null;
    const deeper = resolveThroughBarrel(
      resolved.targetPath,
      direct.sourceName,
      context,
      depth + 1,
      nextVisited,
    );
    return deeper ?? resolved.targetPath;
  }

  const hits: string[] = [];
  for (const specifier of table.stars) {
    const resolved = resolveModuleSpecifier(
      specifier,
      barrelPath,
      context.knownPaths,
      context.resolution,
    );
    if (!resolved) continue;
    if (context.exportsByPath.get(resolved.targetPath)?.has(name)) {
      if (!hits.includes(resolved.targetPath)) hits.push(resolved.targetPath);
      continue;
    }
    const deeper = resolveThroughBarrel(
      resolved.targetPath,
      name,
      context,
      depth + 1,
      nextVisited,
    );
    if (deeper !== null && !hits.includes(deeper)) hits.push(deeper);
  }
  return hits.length === 1 ? (hits[0] ?? null) : null;
}

/**
 * Resolve parsed files into cross-file links, one per
 * (sourcePath, targetPath, kind) — the persisted edge granularity.
 */
export function resolveCodeLinks(input: ResolveCodeLinksInput): CodeLink[] {
  const links = new Map<string, MutableLink>();
  const symbolOwners = buildSymbolOwnerIndex(input.exportsByPath);
  const resolution = input.resolution ?? EMPTY_MODULE_RESOLUTION;
  const barrels = buildBarrelTables(input.files);
  const barrelContext = {
    barrels,
    exportsByPath: input.exportsByPath,
    knownPaths: input.knownPaths,
    resolution,
  };

  function record(
    kind: CodeLinkKind,
    sourcePath: string,
    targetPath: string,
    tier: CodeLinkTier,
    method: CodeLinkMethod,
    span: CodeLinkSpan,
    symbols: readonly string[],
  ): void {
    if (sourcePath === targetPath) return;
    const key = `${kind} ${sourcePath} ${targetPath}`;
    const existing = links.get(key);
    if (!existing) {
      links.set(key, {
        kind,
        method,
        sourcePath,
        span,
        symbols: new Set(symbols),
        targetPath,
        tier,
      });
      return;
    }
    // A resolved sighting upgrades the link; the first span is kept.
    if (existing.tier === "reference" && tier === "resolved") {
      existing.tier = "resolved";
      existing.method = method;
    }
    for (const symbol of symbols) {
      if (existing.symbols.size < MAX_SYMBOLS_PER_LINK)
        existing.symbols.add(symbol);
    }
  }

  for (const [path, parsed] of input.files) {
    const sourceIsTest = isTestPath(path);
    // Import target per local binding, for the call pass.
    const importTargets = new Map<
      string,
      { symbol: string | null; target: string }
    >();

    /**
     * A test file's import is also the closest deterministic statement the
     * repository makes about coverage. It is a *reference*: the file is
     * exercised, which is not the same as a passing run, so this never
     * promotes anything to `verified` (WORK_SPEC §3-1, OQ-036).
     */
    function recordTestEdge(
      targetPath: string,
      span: CodeLinkSpan,
      symbols: readonly string[],
    ): void {
      if (!sourceIsTest || isTestPath(targetPath)) return;
      record(
        "tests",
        path,
        targetPath,
        "reference",
        "test-import",
        span,
        symbols,
      );
    }

    for (const rawImport of parsed.imports) {
      if (isPython(path)) {
        const target = resolvePythonModule(
          rawImport.specifier,
          path,
          input.knownPaths,
          resolution.pythonRoots,
        );
        if (!target) continue;
        const symbols = rawImport.names.filter((name) => name !== "*");
        // Python parsing is structural (no AST), so its links stay reference.
        record(
          "imports",
          path,
          target,
          "reference",
          "module-resolution",
          rawImport.span,
          symbols,
        );
        recordTestEdge(target, rawImport.span, symbols);
        continue;
      }

      const resolved = resolveModuleSpecifier(
        rawImport.specifier,
        path,
        input.knownPaths,
        resolution,
      );
      if (!resolved) continue;

      const namedImports = rawImport.names.filter((name) => name !== "*");
      const owners = new Map<string, string>();
      if (barrels.has(resolved.targetPath)) {
        for (const name of namedImports) {
          const owner = resolveThroughBarrel(
            resolved.targetPath,
            name,
            barrelContext,
          );
          if (owner !== null && owner !== path) owners.set(name, owner);
        }
      }

      for (const [name, owner] of owners) {
        record(
          "imports",
          path,
          owner,
          "resolved",
          "barrel-resolution",
          rawImport.span,
          [name],
        );
        recordTestEdge(owner, rawImport.span, [name]);
      }

      // The barrel itself stays on the graph whenever it still carries part
      // of this import: a namespace/default form, or a name the walk could
      // not attribute to exactly one declaring file.
      const unattributed = namedImports.filter((name) => !owners.has(name));
      if (unattributed.length > 0 || namedImports.length === 0) {
        record(
          "imports",
          path,
          resolved.targetPath,
          resolved.tier,
          resolved.method,
          rawImport.span,
          unattributed,
        );
        recordTestEdge(resolved.targetPath, rawImport.span, unattributed);
      }

      for (const binding of rawImport.bindings) {
        const owner = binding.symbol ? owners.get(binding.symbol) : undefined;
        importTargets.set(binding.local, {
          symbol: binding.symbol,
          target: owner ?? resolved.targetPath,
        });
      }
    }

    for (const call of parsed.calls) {
      const bound = importTargets.get(call.binding);
      if (bound) {
        // A namespace binding's called symbol is the member (`ns.foo()` → foo).
        const symbol = call.member ?? bound.symbol;
        record(
          "calls",
          path,
          bound.target,
          "resolved",
          "import-binding",
          call.span,
          symbol ? [symbol] : [],
        );
        continue;
      }
      if (call.member !== null) continue;
      if (parsed.localNames.has(call.binding)) continue;
      // Name match: a bare call whose name is exported by exactly one other
      // file. Ambiguous names stay out — a guessed edge is worse than none.
      const owners = (symbolOwners.get(call.binding) ?? []).filter(
        (ownerPath) => ownerPath !== path,
      );
      if (owners.length === 1 && owners[0]) {
        record("calls", path, owners[0], "reference", "name-match", call.span, [
          call.binding,
        ]);
      }
    }
  }

  return [...links.values()]
    .map((link) => ({
      kind: link.kind,
      method: link.method,
      sourcePath: link.sourcePath,
      span: link.span,
      symbols: [...link.symbols].sort(),
      targetPath: link.targetPath,
      tier: link.tier,
    }))
    .sort(
      (left, right) =>
        left.sourcePath.localeCompare(right.sourcePath) ||
        left.targetPath.localeCompare(right.targetPath) ||
        left.kind.localeCompare(right.kind),
    );
}

/** How a base was attributed to the file that declares it. */
export type SymbolLinkMethod = CodeLinkMethod | "local-declaration";

/**
 * A symbol-to-symbol link (Phase 4 Wave F todo 26): an exported class or
 * interface and the exported symbol it extends. Both ends are named by
 * (path, name) — the identity `symbolStableKey` reads — and the SQL joins
 * them to the symbol rows it derived from `exported_symbols`, so a base
 * that is not an exported symbol anywhere in the tree yields no edge rather
 * than a dangling one.
 */
export interface SymbolLink {
  readonly kind: "extends";
  readonly method: SymbolLinkMethod;
  readonly sourceKind: "class" | "interface";
  readonly sourceName: string;
  readonly sourcePath: string;
  readonly span: CodeLinkSpan;
  readonly targetName: string;
  readonly targetPath: string;
  readonly tier: CodeLinkTier;
}

interface BaseBinding {
  readonly method: SymbolLinkMethod;
  /** The exported name on the target, or null for a whole-module binding. */
  readonly symbol: string | null;
  readonly target: string;
  readonly tier: CodeLinkTier;
}

interface AttributedBase {
  readonly method: SymbolLinkMethod;
  readonly targetName: string;
  readonly targetPath: string;
  readonly tier: CodeLinkTier;
}

/**
 * Where one base lives. A local declaration is this file — and shadows an
 * import of the same name, as it does at run time. A named binding is the
 * module the import pass attributed it to; a member of a whole-module
 * binding (`ns.Base`, `models.Model`) is that name in that module. Either
 * way the target has to be an exported symbol the tree knows, because that
 * is the only kind of symbol that has a node.
 */
function attributeBase(
  base: RawHeritageTarget,
  path: string,
  parsed: ParsedFileLinks,
  bindings: ReadonlyMap<string, BaseBinding>,
  exported: (targetPath: string, name: string) => boolean,
  python: boolean,
): AttributedBase | null {
  const bound = bindings.get(base.binding);
  if (base.member !== null) {
    if (!bound || bound.symbol !== null) return null;
    return exported(bound.target, base.member)
      ? {
          method: bound.method,
          targetName: base.member,
          targetPath: bound.target,
          tier: bound.tier,
        }
      : null;
  }
  const declaredHere = python
    ? exported(path, base.binding)
    : parsed.localNames.has(base.binding);
  if (declaredHere) {
    return exported(path, base.binding)
      ? {
          method: "local-declaration",
          targetName: base.binding,
          targetPath: path,
          tier: python ? "reference" : "resolved",
        }
      : null;
  }
  if (!bound || bound.symbol === null) return null;
  return exported(bound.target, bound.symbol)
    ? {
        method: bound.method,
        targetName: bound.symbol,
        targetPath: bound.target,
        tier: bound.tier,
      }
    : null;
}

/**
 * Resolve every `extends` the parse recorded to the file and name that
 * declares the base. The attribution rules are the import pass's own: a
 * local name is this file, an imported binding is its module (followed
 * through a barrel when the barrel re-exports it), a member of a
 * whole-module binding is that name in that module. Python bases resolve
 * through `from x import B` and `import x` + `x.B` at the `reference` tier,
 * as its imports do. Anything else — a base from a package outside the
 * tree, a chained member access — is not a link.
 */
export function resolveSymbolLinks(input: ResolveCodeLinksInput): SymbolLink[] {
  const resolution = input.resolution ?? EMPTY_MODULE_RESOLUTION;
  const barrels = buildBarrelTables(input.files);
  const barrelContext = {
    barrels,
    exportsByPath: input.exportsByPath,
    knownPaths: input.knownPaths,
    resolution,
  };
  const exported = (targetPath: string, name: string): boolean =>
    input.exportsByPath.get(targetPath)?.has(name) ?? false;
  const links = new Map<string, SymbolLink>();

  for (const [path, parsed] of input.files) {
    if (parsed.heritage.length === 0) continue;
    const python = isPython(path);
    const bindings = new Map<string, BaseBinding>();

    for (const rawImport of parsed.imports) {
      if (rawImport.isReExport) continue;
      if (python) {
        const target = resolvePythonModule(
          rawImport.specifier,
          path,
          input.knownPaths,
          resolution.pythonRoots,
        );
        if (!target) continue;
        if (rawImport.names.length === 1 && rawImport.names[0] === "*") {
          // `import a.models` binds `models`; `models.Model` reads through it.
          const binding = rawImport.specifier.split(".").pop();
          if (binding) {
            bindings.set(binding, {
              method: "module-resolution",
              symbol: null,
              target,
              tier: "reference",
            });
          }
          continue;
        }
        for (const name of rawImport.names) {
          if (name === "*") continue;
          bindings.set(name, {
            method: "module-resolution",
            symbol: name,
            target,
            tier: "reference",
          });
        }
        continue;
      }

      const resolved = resolveModuleSpecifier(
        rawImport.specifier,
        path,
        input.knownPaths,
        resolution,
      );
      if (!resolved) continue;
      for (const binding of rawImport.bindings) {
        const owner =
          binding.symbol !== null && barrels.has(resolved.targetPath)
            ? resolveThroughBarrel(
                resolved.targetPath,
                binding.symbol,
                barrelContext,
              )
            : null;
        bindings.set(binding.local, {
          method: owner !== null ? "barrel-resolution" : resolved.method,
          symbol: binding.symbol,
          target: owner ?? resolved.targetPath,
          tier: resolved.tier,
        });
      }
    }

    for (const declaration of parsed.heritage) {
      for (const base of declaration.targets) {
        const attributed = attributeBase(
          base,
          path,
          parsed,
          bindings,
          exported,
          python,
        );
        if (!attributed) continue;
        if (
          attributed.targetPath === path &&
          attributed.targetName === declaration.name
        ) {
          continue;
        }
        const key = [
          path,
          declaration.name,
          attributed.targetPath,
          attributed.targetName,
        ].join("\u0000");
        if (links.has(key)) continue;
        links.set(key, {
          kind: "extends",
          method: attributed.method,
          sourceKind: declaration.kind,
          sourceName: declaration.name,
          sourcePath: path,
          span: declaration.span,
          targetName: attributed.targetName,
          targetPath: attributed.targetPath,
          tier: attributed.tier,
        });
      }
    }
  }

  return [...links.values()].sort(
    (left, right) =>
      left.sourcePath.localeCompare(right.sourcePath) ||
      left.sourceName.localeCompare(right.sourceName) ||
      left.targetPath.localeCompare(right.targetPath) ||
      left.targetName.localeCompare(right.targetName),
  );
}
