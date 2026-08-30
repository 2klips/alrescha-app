import ts from "typescript";

/**
 * Structural code links (Phase 3 Wave B todo 3).
 *
 * Two-tier honesty, recorded per link (RESEARCH_KG_FUSION §1/§2):
 * - `resolved` — the connection is deterministic: a module specifier resolved
 *   against the repository tree, or a call through an import binding.
 * - `reference` — a name match: plausible, provenance-carried, but not proven
 *   by resolution. Rendered thinner (`edgeStroke`).
 *
 * Only metadata travels: paths, symbol names, line spans. No checker program
 * is built (ADR-014 keeps the engine chain) and no source text leaves the
 * scan; parsing is per-file and resolution runs over the collected metadata.
 */

export type CodeLinkKind = "calls" | "imports";
export type CodeLinkMethod =
  "import-binding" | "module-resolution" | "name-match";
export type CodeLinkTier = "reference" | "resolved";

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

interface RawImport {
  readonly bindings: readonly RawImportBinding[];
  readonly names: readonly string[];
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

export interface ParsedFileLinks {
  readonly calls: readonly RawCall[];
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
        names,
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
      if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements)
          names.push(element.propertyName?.text ?? element.name.text);
      } else {
        names.push("*");
      }
      imports.push({
        bindings: [],
        names,
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
        names: ["*"],
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

  return { calls, imports, localNames };
}

/** Python `import a.b` / `from a.b import c` — imports only, structural tier. */
export function parsePythonLinks(source: string): ParsedFileLinks {
  const imports: RawImport[] = [];
  source.split(/\r?\n/).forEach((line, index) => {
    const span = { endLine: index + 1, startLine: index + 1 };
    const plain = /^\s*import\s+([\w.]+(?:\s*,\s*[\w.]+)*)/.exec(line);
    if (plain?.[1]) {
      for (const module of plain[1].split(",")) {
        imports.push({
          bindings: [],
          names: ["*"],
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
      imports.push({ bindings: [], names, span, specifier: named[1] });
    }
  });
  return { calls: [], imports, localNames: new Set() };
}

function directoryOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
}

/** Normalize `a/b/../c` → `a/c`; returns null when it escapes the repo root. */
function normalizePath(path: string): string | null {
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

/** Resolve a relative TS/JS specifier against the repository tree. */
export function resolveTypeScriptSpecifier(
  specifier: string,
  fromPath: string,
  knownPaths: ReadonlySet<string>,
): string | null {
  if (!specifier.startsWith(".")) return null;
  const joined = normalizePath(`${directoryOf(fromPath)}/${specifier}`);
  if (joined === null) return null;

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

/** Resolve a Python module to a repo file, relative dots included. */
export function resolvePythonModule(
  specifier: string,
  fromPath: string,
  knownPaths: ReadonlySet<string>,
): string | null {
  let base = "";
  let module = specifier;
  const relative = /^(\.+)(.*)$/.exec(specifier);
  if (relative?.[1]) {
    base = directoryOf(fromPath);
    for (let index = 1; index < relative[1].length; index += 1) {
      base = directoryOf(base);
    }
    module = relative[2] ?? "";
  }
  const modulePath = module.replaceAll(".", "/");
  const joined = normalizePath(
    [base, modulePath].filter((part) => part.length > 0).join("/"),
  );
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

/**
 * Resolve parsed files into cross-file links, one per
 * (sourcePath, targetPath, kind) — the persisted edge granularity.
 */
export function resolveCodeLinks(input: ResolveCodeLinksInput): CodeLink[] {
  const links = new Map<string, MutableLink>();
  const symbolOwners = buildSymbolOwnerIndex(input.exportsByPath);

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
    // Import target per local binding, for the call pass.
    const importTargets = new Map<
      string,
      { symbol: string | null; target: string }
    >();

    for (const rawImport of parsed.imports) {
      const target = isPython(path)
        ? resolvePythonModule(rawImport.specifier, path, input.knownPaths)
        : resolveTypeScriptSpecifier(
            rawImport.specifier,
            path,
            input.knownPaths,
          );
      if (!target) continue;
      record(
        "imports",
        path,
        target,
        // Python parsing is structural (no AST), so its links stay reference.
        isPython(path) ? "reference" : "resolved",
        "module-resolution",
        rawImport.span,
        rawImport.names.filter((name) => name !== "*"),
      );
      for (const binding of rawImport.bindings) {
        importTargets.set(binding.local, { symbol: binding.symbol, target });
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
