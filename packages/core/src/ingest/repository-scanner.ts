import { createHash } from "node:crypto";

import ts from "typescript";

import {
  parseMarkdownStructure,
  type ParsedMarkdownStructure,
} from "../parser/markdown";
import { isBeadsExportPath, parseBeadsExport } from "../progress/beads";
import { parseTodoDocument, type ParsedTodoItem } from "../progress/todos";
import {
  LINK_SCHEMA_VERSION,
  parsePythonLinks,
  parseTypeScriptLinks,
  resolveCodeLinks,
  resolveModuleSpecifier,
  resolveSymbolLinks,
  type CodeLink,
  type ParsedFileLinks,
  type SymbolLink,
} from "./code-links";
import { NULL_GIT_SHA, isScannableCommitSha } from "./commit-sha";
import { clampConcurrency, mapWithConcurrency } from "./concurrency";
import { resolveDocLinks, type DocLink } from "./doc-links";
import { parsePythonRoutes, type RouteDeclaration } from "./route-links";
import {
  parseQueryReferences,
  parseSchemaFile,
  resolveSchemaLinks,
  type DbObject,
  type ParsedQueryReference,
  type SchemaLink,
} from "./schema-links";
import {
  parseDocumentSections,
  parseSectionReferences,
  resolveSectionLinks,
  type DocumentSection,
  type ParsedSectionReference,
  type SectionLink,
} from "./section-links";
import {
  buildModuleResolution,
  isIgnoredManifestPath,
  isManifestPath,
  MAX_MANIFEST_BYTES,
  MAX_MANIFESTS_PER_SCAN,
  type ModuleResolutionConfig,
} from "./module-resolution";
import { isDefaultIgnoredPath } from "./path-conventions";
import {
  EMPTY_REPOSITORY_CONFIG,
  parseRepositoryConfig,
  repositoryIgnoreMatcher,
  repositoryTodoMatcher,
  REPOSITORY_CONFIG_PATH,
  type RepositoryScanConfig,
} from "./repository-config";

/**
 * What a scanned file is, as the scan can tell from its path.
 *
 * Phase 4 Wave A todo 2 adds the four that make a repository's own files
 * visible at all: before it, a `README.md`, a migration, a stylesheet and a
 * `package.json` were not artifacts, so 40% of this repository's tracked
 * files had no node and no edge could reach them (R5 §2.2 D5).
 *
 * The first eight keep their meaning exactly — the rules engine reasons about
 * those and only those, and `doc` deliberately does not join them (a README
 * is a note in the graph, not a source of requirements; see OQ-041).
 */
export type ArtifactClassification =
  | "adr"
  | "agents"
  | "claude"
  | "code_metadata"
  | "config"
  | "cursor_rule"
  | "doc"
  | "schema"
  | "skill"
  | "spec"
  | "style"
  | "todo_progress";

export type PersistedArtifactKind =
  | "adr"
  | "code_metadata"
  | "config"
  | "doc"
  | "instruction"
  | "schema"
  | "spec"
  | "style"
  | "todo";
export type ScanSkipReason = "binary" | "oversized" | "submodule" | "symlink";

export interface RepositoryTreeEntry {
  readonly mode: string;
  readonly path: string;
  readonly sha: string;
  readonly size?: number;
  readonly type: "blob" | "commit" | "tree";
}

export interface RepositoryTree {
  readonly entries: readonly RepositoryTreeEntry[];
  readonly treeSha: string;
  readonly truncated: boolean;
}

export interface RepositorySource {
  fetchContent(path: string, commitSha: string): Promise<Uint8Array>;
  listTree(commitSha: string): Promise<RepositoryTree>;
}

export interface ExportedSymbolMetadata {
  readonly endColumn: number;
  readonly endLine: number;
  readonly kind: string;
  readonly name: string;
  readonly startColumn: number;
  readonly startLine: number;
}

export type RationaleKind = "adr-reference" | "note" | "why";

/**
 * A rationale comment lifted out of code (Phase 2B todo 7 ⑴): `WHY:`/`NOTE:`
 * markers and ADR citations become first-class graph nodes connecting code to
 * intent. Only the comment text travels — never surrounding code.
 */
export interface RationaleNote {
  readonly adrRef: string | null;
  readonly kind: RationaleKind;
  readonly line: number;
  readonly sourceKey: string;
  readonly text: string;
}

export interface ScannedArtifact {
  readonly classification: ArtifactClassification;
  readonly digest: string;
  readonly exportedSymbols: readonly ExportedSymbolMetadata[];
  readonly kind: PersistedArtifactKind;
  readonly path: string;
  readonly rationales: readonly RationaleNote[];
  readonly sizeBytes: number;
  readonly sourceBlobSha: string;
  readonly sourceCommitSha: string;
  /**
   * Which extractor produced `exportedSymbols` (ADR-014). Recorded as
   * artifact provenance so a consumer can tell an exact AST reading from a
   * structural one instead of assuming uniform precision. `null` when the
   * artifact carries no symbols.
   */
  readonly symbolEngine: SymbolExtractionEngine | null;
  readonly todoItems: readonly ParsedTodoItem[];
}

export type PreviousScannedArtifact = Omit<
  ScannedArtifact,
  "rationales" | "symbolEngine" | "todoItems"
>;

export interface ScanSkip {
  readonly detail: string;
  readonly path: string;
  readonly reason: ScanSkipReason;
}

/**
 * Which files' outgoing structure edges this plan speaks for.
 *
 * `incremental` — only the files in `artifacts`; every other file's stored
 * edges stay untouched, which is what makes a rescan cheap.
 * `full` — every code file in the tree was re-parsed, so the plan replaces
 * the repository's structure edges outright (Phase 4 Wave A todo 0).
 */
export type LinkScope = "full" | "incremental";

export interface RepositoryScanPlan {
  readonly artifacts: readonly ScannedArtifact[];
  /**
   * Cross-file structure links from the files linked this pass (Phase 3
   * Wave B todo 3). Under `linkScope: "incremental"` the links of unchanged
   * files are not recomputed — their stored edges remain valid.
   */
  readonly codeLinks: readonly CodeLink[];
  readonly commitSha: string;
  /**
   * `references` links out of the documents parsed this pass (Phase 4 Wave A
   * todo 2). Scoped exactly like `codeLinks`: an incremental pass speaks only
   * for the documents it re-read, a `full` pass for all of them.
   */
  readonly docLinks: readonly DocLink[];
  /**
   * The repository's own conventions as stated by `.alrescha.json` at this
   * commit (Phase 4 Wave A todo 4). Parsed values only — never the file's
   * text — so both ingest paths carry the same settings and the server can
   * store which commit stated them.
   */
  readonly layoutConfig: RepositoryScanConfig;
  /**
   * Route declarations read from decorators (Phase 4 Wave A′ todo 6).
   * Next.js routes are not here: their URL is in the path, so the scan SQL
   * derives them and the plan stays free of them (ADR-013).
   */
  readonly routes: readonly RouteDeclaration[];
  /**
   * Database objects this commit's migrations declare, and the edges that
   * reach them (Phase 4 Wave A′ todo 7). Names and lines only — the DDL that
   * declares a table is a source body and stays in the file.
   */
  readonly schemaLinks: readonly SchemaLink[];
  readonly schemaObjects: readonly DbObject[];
  readonly sectionLinks: readonly SectionLink[];
  readonly sections: readonly DocumentSection[];
  /**
   * `extends` between exported symbols (Phase 4 Wave F todo 26), scoped
   * exactly like `codeLinks`: an incremental pass speaks for the files it
   * re-read. The symbols themselves are not here — they are already in each
   * artifact's `exportedSymbols`, and the SQL derives the nodes from those.
   */
  readonly symbolLinks: readonly SymbolLink[];
  /** Resolver generation that produced `codeLinks` (see LINK_SCHEMA_VERSION). */
  readonly linkSchemaVersion: number;
  readonly linkScope: LinkScope;
  readonly removedPaths: readonly string[];
  readonly skipped: readonly ScanSkip[];
  readonly touchedRows: number;
  readonly treeSha: string | null;
  readonly unchangedPaths: readonly string[];
}

const TYPESCRIPT_EXTENSIONS = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
]);
const CODE_EXTENSIONS = new Set([...TYPESCRIPT_EXTENSIONS, ".go", ".py"]);
/** Prose the graph carries as notes (Phase 4 Wave A todo 2, design ①). */
const DOC_EXTENSIONS = new Set([".md", ".mdx", ".rst", ".txt"]);
/** Schema definitions — the hub the `db_object` family hangs off (Wave A′). */
const SCHEMA_EXTENSIONS = new Set([".sql", ".prisma", ".graphql", ".gql"]);
const STYLE_EXTENSIONS = new Set([".css", ".scss", ".less", ".sass"]);
/**
 * Configuration, by extension or by exact name. Deliberately not "every
 * `.json`": a fixture, a recorded API response and a lockfile are data, not
 * a statement about how the project is wired.
 */
const CONFIG_EXTENSIONS = new Set([".toml", ".yaml", ".yml"]);
const CONFIG_FILE_NAMES = new Set([
  ".alrescha.json",
  ".env.example",
  ".nvmrc",
  "dockerfile",
  "package.json",
  "pyproject.toml",
  "requirements.txt",
]);
const CONFIG_FILE_PATTERN =
  /^(?:tsconfig[\w.-]*\.json|jsconfig[\w.-]*\.json|[\w.-]*\.config\.[cm]?[jt]s|dockerfile(?:\.[\w-]+)?)$/;

/**
 * Handoff/session files agents leave behind (Phase 2B todo 7 ⑶, H1).
 *
 * The optional numeric head is todo 21: teams number these by date or by
 * sequence — `001-handoff.md`, `2026-09-06-handoff.md` — and the pilot scan
 * recognised none of them, because the name had to *start* with the word.
 */
const HANDOFF_FILE_PATTERN =
  /^(?:\d[\w.-]*[._-])?(session[-_](state|notes?)|current[-_]task|handoff([._-].*)?)\.(md|mdx)$/;

/**
 * Names a repository keeps its task list under (todo 21).
 *
 * `tasks`, `plan` and `backlog` join the original four for the conventions
 * that were measured missing: spec-kit writes `specs/<feature>/tasks.md` and
 * `plan.md` beside a `spec.md`, and `PLAN.md`/`BACKLOG.md` at a root are the
 * two most common hand-written ledgers. The prefix is anchored, so this
 * repository's own `BUILD_PLAN.md` is still a spec — a rule that matched a
 * name anywhere would swallow half of `spec/`.
 */
const TODO_FILE_PATTERN =
  /^(todo|todos|tasks?|plan|plans|backlog|progress|status|roadmap)([._-].*)?\.(md|mdx)$/;

function extension(path: string): string {
  const fileName = path.slice(path.lastIndexOf("/") + 1);
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot).toLowerCase();
}

/**
 * Directories that hold test fixtures by convention. A spec, rule file or
 * ADR under one of them describes a *sample* repository, not this one — the
 * production scan of this very repository turned `fixtures/drifted-demo`'s
 * synthetic MUST statements into 90+ live requirements. Matched as whole
 * path segments (`fixture-notes/spec.md` is still a spec).
 */
const FIXTURE_DIRECTORIES = new Set(["fixtures", "__fixtures__", "testdata"]);

function underFixtureDirectory(lowerPath: string): boolean {
  const segments = lowerPath.split("/");
  return segments
    .slice(0, -1)
    .some((segment) => FIXTURE_DIRECTORIES.has(segment));
}

export function classifyArtifactPath(
  inputPath: string,
  /**
   * The repository's own `todoFiles`/`progressDocs`, as a matcher
   * (`repositoryTodoMatcher`). A repository knows which of its documents is
   * its task list; a filename rule only guesses.
   */
  declaredTodo?: (path: string) => boolean,
): ArtifactClassification | null {
  const path = inputPath.replaceAll("\\", "/");
  const lower = path.toLowerCase();
  if (underFixtureDirectory(lower) || isDefaultIgnoredPath(lower)) {
    return null;
  }
  const fileName = lower.slice(lower.lastIndexOf("/") + 1);
  const fileExtension = extension(lower);

  if (fileName === "agents.md") {
    return "agents";
  }
  if (
    fileName === "claude.md" ||
    lower.includes("/.claude/rules/") ||
    lower.startsWith(".claude/rules/")
  ) {
    return "claude";
  }
  if (fileName === "skill.md") {
    return "skill";
  }
  if (lower.includes("/.cursor/rules/") || lower.startsWith(".cursor/rules/")) {
    return "cursor_rule";
  }
  // The repository's own list runs after the four instruction identities and
  // before every rule that guesses from a name. Those four are excluded
  // deliberately: the instruction-cost table is built from them, so a
  // repository that could relabel its `AGENTS.md` as a todo list would take
  // its own always-loaded bytes out of its own bill. Everything below here
  // is inference, and a repository's statement about its files beats it.
  if (declaredTodo?.(path)) {
    return "todo_progress";
  }
  if (
    (fileExtension === ".md" || fileExtension === ".mdx") &&
    (fileName.startsWith("adr-") ||
      lower.includes("/adr/") ||
      lower.includes("/adrs/"))
  ) {
    return "adr";
  }
  // A beads export is issues, in JSON lines. It is a todo document that no
  // markdown rule could ever match, which is why the pilot scan saw none.
  if (isBeadsExportPath(lower)) {
    return "todo_progress";
  }
  if (
    (fileExtension === ".md" || fileExtension === ".mdx") &&
    (TODO_FILE_PATTERN.test(fileName) || HANDOFF_FILE_PATTERN.test(fileName))
  ) {
    return "todo_progress";
  }
  if (
    (fileExtension === ".md" || fileExtension === ".mdx") &&
    (/^(spec|prd|requirements?)([._-].*)?\.(md|mdx)$/.test(fileName) ||
      lower.startsWith("spec/") ||
      lower.startsWith("specs/") ||
      lower.includes("/spec/") ||
      lower.includes("/specs/"))
  ) {
    return "spec";
  }
  if (CODE_EXTENSIONS.has(fileExtension)) {
    return "code_metadata";
  }
  // Every remaining text file is a note of some sort. The order matters only
  // where a name and an extension disagree: `requirements.txt` is a config
  // file, not prose, so the name list is consulted first.
  if (CONFIG_FILE_NAMES.has(fileName) || CONFIG_FILE_PATTERN.test(fileName)) {
    return "config";
  }
  if (DOC_EXTENSIONS.has(fileExtension)) {
    return "doc";
  }
  if (SCHEMA_EXTENSIONS.has(fileExtension)) {
    return "schema";
  }
  if (STYLE_EXTENSIONS.has(fileExtension)) {
    return "style";
  }
  if (CONFIG_EXTENSIONS.has(fileExtension)) {
    return "config";
  }
  return null;
}

/**
 * Classifications whose body the scan parses as markdown for `references`
 * links (Phase 4 Wave A todo 2). Instruction files and specs were already
 * read for their spans; `doc` joins them so a README's links reach the graph.
 */
const DOC_LINK_CLASSIFICATIONS = new Set<ArtifactClassification>([
  "adr",
  "agents",
  "claude",
  "cursor_rule",
  "doc",
  "skill",
  "spec",
  "todo_progress",
]);

export function isMarkdownArtifact(
  classification: ArtifactClassification,
): boolean {
  return DOC_LINK_CLASSIFICATIONS.has(classification);
}

export function persistedKind(
  classification: ArtifactClassification,
): PersistedArtifactKind {
  switch (classification) {
    case "adr":
      return "adr";
    case "code_metadata":
      return "code_metadata";
    case "config":
      return "config";
    case "doc":
      return "doc";
    case "schema":
      return "schema";
    case "spec":
      return "spec";
    case "style":
      return "style";
    case "todo_progress":
      return "todo";
    case "agents":
    case "claude":
    case "cursor_rule":
    case "skill":
      return "instruction";
  }
}

function symbolKind(node: ts.Node): string {
  if (ts.isClassDeclaration(node)) return "class";
  if (ts.isEnumDeclaration(node)) return "enum";
  if (ts.isFunctionDeclaration(node)) return "function";
  if (ts.isInterfaceDeclaration(node)) return "interface";
  if (ts.isModuleDeclaration(node)) return "namespace";
  if (ts.isTypeAliasDeclaration(node)) return "type";
  if (ts.isVariableDeclaration(node)) return "variable";
  return "export";
}

function symbolMetadata(
  sourceFile: ts.SourceFile,
  node: ts.Node,
  name: string,
): ExportedSymbolMetadata {
  const start = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile),
  );
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  return {
    endColumn: end.character + 1,
    endLine: end.line + 1,
    kind: symbolKind(node),
    name,
    startColumn: start.character + 1,
    startLine: start.line + 1,
  };
}

function hasExportModifier(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    Boolean(
      ts
        .getModifiers(node)
        ?.some(({ kind }) => kind === ts.SyntaxKind.ExportKeyword),
    )
  );
}

export function extractExportedSymbols(
  path: string,
  source: string,
): readonly ExportedSymbolMetadata[] {
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
  const symbols: ExportedSymbolMetadata[] = [];

  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement) && hasExportModifier(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          symbols.push(
            symbolMetadata(sourceFile, declaration, declaration.name.text),
          );
        }
      }
      continue;
    }

    if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const element of statement.exportClause.elements) {
        symbols.push(symbolMetadata(sourceFile, element, element.name.text));
      }
      continue;
    }

    if (ts.isExportAssignment(statement)) {
      symbols.push(symbolMetadata(sourceFile, statement, "default"));
      continue;
    }

    if (!hasExportModifier(statement)) {
      continue;
    }

    if (
      ts.isClassDeclaration(statement) ||
      ts.isEnumDeclaration(statement) ||
      ts.isFunctionDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isModuleDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement)
    ) {
      const name = statement.name?.getText(sourceFile) ?? "default";
      symbols.push(symbolMetadata(sourceFile, statement, name));
    }
  }

  return symbols.sort(
    (left, right) =>
      left.startLine - right.startLine || left.startColumn - right.startColumn,
  );
}

export type SymbolExtractionEngine =
  "go-structural" | "python-structural" | "typescript-ast";

function structuralSymbol(
  name: string,
  kind: string,
  lineIndex: number,
  column: number,
): ExportedSymbolMetadata {
  return {
    endColumn: column + name.length,
    endLine: lineIndex + 1,
    kind,
    name,
    startColumn: column + 1,
    startLine: lineIndex + 1,
  };
}

/** Top-level `def`/`class` declarations; private (`_`) names stay out. */
function extractPythonSymbols(source: string): ExportedSymbolMetadata[] {
  const symbols: ExportedSymbolMetadata[] = [];
  source.split(/\r?\n/).forEach((line, index) => {
    const definition = /^(async\s+)?def\s+([A-Za-z_][\w]*)\s*\(/.exec(line);
    if (definition?.[2] && !definition[2].startsWith("_")) {
      symbols.push(
        structuralSymbol(
          definition[2],
          "function",
          index,
          line.indexOf(definition[2]),
        ),
      );
      return;
    }
    const classDefinition = /^class\s+([A-Za-z_][\w]*)/.exec(line);
    if (classDefinition?.[1] && !classDefinition[1].startsWith("_")) {
      symbols.push(
        structuralSymbol(
          classDefinition[1],
          "class",
          index,
          line.indexOf(classDefinition[1]),
        ),
      );
    }
  });
  return symbols;
}

/** Go's export rule is the capital initial — only those are recorded. */
function extractGoSymbols(source: string): ExportedSymbolMetadata[] {
  const symbols: ExportedSymbolMetadata[] = [];
  const push = (
    name: string | undefined,
    kind: string,
    index: number,
    line: string,
  ) => {
    if (name && /^[A-Z]/.test(name)) {
      symbols.push(structuralSymbol(name, kind, index, line.indexOf(name)));
    }
  };
  source.split(/\r?\n/).forEach((line, index) => {
    const func = /^func\s+(?:\([^)]*\)\s*)?([A-Za-z_][\w]*)\s*\(/.exec(line);
    if (func) {
      push(func[1], "function", index, line);
      return;
    }
    const typeDeclaration =
      /^type\s+([A-Za-z_][\w]*)\s+(struct|interface)\b/.exec(line);
    if (typeDeclaration) {
      push(typeDeclaration[1], typeDeclaration[2] ?? "type", index, line);
      return;
    }
    const valueDeclaration = /^(?:var|const)\s+([A-Za-z_][\w]*)\b/.exec(line);
    if (valueDeclaration) {
      push(valueDeclaration[1], "variable", index, line);
    }
  });
  return symbols;
}

/**
 * Multi-language symbol extraction (Phase 2B todo 7 ⑵): an AST engine where
 * one is available (the TypeScript compiler for ts/js), deterministic
 * structural parsing as the fallback tier for Python and Go. The tree-sitter
 * promotion is recorded as OQ-015 — it needs a dependency decision.
 */
export function extractSymbols(
  path: string,
  source: string,
): {
  engine: SymbolExtractionEngine;
  symbols: readonly ExportedSymbolMetadata[];
} {
  const fileExtension = extension(path.toLowerCase());
  if (fileExtension === ".py") {
    return {
      engine: "python-structural",
      symbols: extractPythonSymbols(source),
    };
  }
  if (fileExtension === ".go") {
    return { engine: "go-structural", symbols: extractGoSymbols(source) };
  }
  return {
    engine: "typescript-ast",
    symbols: extractExportedSymbols(path, source),
  };
}

const RATIONALE_MARKER_PATTERN =
  /^\s*(?:\/\/|#|\*|\/\*|--)\s*(WHY|NOTE):\s*(.+?)\s*(?:\*\/)?\s*$/;
const COMMENT_LINE_PATTERN =
  /^\s*(?:\/\/|#|\*|\/\*|--)\s*(.+?)\s*(?:\*\/)?\s*$/;
const ADR_REFERENCE_PATTERN = /\bADR-\d{1,4}\b/;
const MAX_RATIONALE_TEXT = 240;

/** WHY:/NOTE: markers and ADR citations in comments — the comment text only. */
export function extractRationales(
  path: string,
  source: string,
): RationaleNote[] {
  const rationales: RationaleNote[] = [];
  source.split(/\r?\n/).forEach((line, index) => {
    const marker = RATIONALE_MARKER_PATTERN.exec(line);
    if (marker?.[1] && marker[2]) {
      rationales.push({
        adrRef: ADR_REFERENCE_PATTERN.exec(marker[2])?.[0] ?? null,
        kind: marker[1] === "WHY" ? "why" : "note",
        line: index + 1,
        sourceKey: `rationale:${path}:${index + 1}`,
        text: marker[2].slice(0, MAX_RATIONALE_TEXT),
      });
      return;
    }
    const comment = COMMENT_LINE_PATTERN.exec(line);
    const adrReference = comment?.[1]
      ? ADR_REFERENCE_PATTERN.exec(comment[1])
      : null;
    if (comment?.[1] && adrReference) {
      rationales.push({
        adrRef: adrReference[0],
        kind: "adr-reference",
        line: index + 1,
        sourceKey: `rationale:${path}:${index + 1}`,
        text: comment[1].slice(0, MAX_RATIONALE_TEXT),
      });
    }
  });
  return rationales;
}

function decodedText(bytes: Uint8Array): string | null {
  if (bytes.subarray(0, 8192).includes(0)) {
    return null;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Default width for the content-fetch pass — perf research MT-3. Every blob
 * the scan needs is a separate round trip to the repository host, and on a
 * first scan every file is "changed", so a strictly serial loop made
 * onboarding wait for thousands of sequential round trips. Eight is
 * deliberately modest: the point is to overlap latency, not to lean on the
 * host rate limiter.
 */
export const DEFAULT_SCAN_FETCH_CONCURRENCY = 8;

/** `index.ts` and friends — the file shape a re-export barrel takes. */
const BARREL_FILE_PATTERN = /(?:^|\/)index\.[cm]?[jt]sx?$/;
/** Extra bodies read per scan to attribute imports through barrels. */
const MAX_BARREL_FETCHES = 200;
/** Barrels re-exporting barrels; the resolver's own walk stops at 4 too. */
const MAX_BARREL_ROUNDS = 4;

function isPythonPath(path: string): boolean {
  return extension(path.toLowerCase()) === ".py";
}

/**
 * Read the barrels this pass's imports resolve through, when the pass did not
 * already read them, and add their parses to `parsedLinks` in place.
 *
 * A first scan and a full relink parse everything, so this adds no fetches
 * there; only an incremental pass pays, and only for the index files and
 * package entry points its changed files actually import.
 */
async function readBarrelBodies(input: {
  readonly commitSha: string;
  readonly concurrency: number;
  readonly knownCodePaths: ReadonlySet<string>;
  readonly maxFileBytes: number;
  readonly parsedLinks: Map<string, ParsedFileLinks>;
  readonly resolution: ModuleResolutionConfig;
  readonly source: RepositorySource;
}): Promise<void> {
  let frontier = [...input.parsedLinks.keys()];
  let budget = MAX_BARREL_FETCHES;

  for (let round = 0; round < MAX_BARREL_ROUNDS && budget > 0; round += 1) {
    const wanted = new Set<string>();
    for (const path of frontier) {
      if (isPythonPath(path)) continue;
      const parsed = input.parsedLinks.get(path);
      if (!parsed) continue;
      for (const rawImport of parsed.imports) {
        if (wanted.size >= budget) break;
        const resolved = resolveModuleSpecifier(
          rawImport.specifier,
          path,
          input.knownCodePaths,
          input.resolution,
        );
        if (!resolved) continue;
        const target = resolved.targetPath;
        if (input.parsedLinks.has(target) || wanted.has(target)) continue;
        if (isPythonPath(target)) continue;
        // A package entry point is a barrel by role even when it is not
        // called `index`; anything else has to look like one.
        if (
          resolved.method !== "alias-resolution" &&
          !BARREL_FILE_PATTERN.test(target)
        ) {
          continue;
        }
        wanted.add(target);
      }
      if (wanted.size >= budget) break;
    }
    if (wanted.size === 0) return;

    const paths = [...wanted].sort((left, right) => left.localeCompare(right));
    budget -= paths.length;
    const bodies = await mapWithConcurrency(
      paths,
      input.concurrency,
      async (path) => {
        try {
          return await input.source.fetchContent(path, input.commitSha);
        } catch {
          return new Uint8Array();
        }
      },
    );

    const added: string[] = [];
    paths.forEach((path, index) => {
      const bytes = bodies[index];
      if (
        !bytes ||
        bytes.byteLength === 0 ||
        bytes.byteLength > input.maxFileBytes
      ) {
        return;
      }
      const text = decodedText(bytes);
      if (text === null) return;
      input.parsedLinks.set(path, parseTypeScriptLinks(path, text));
      added.push(path);
    });
    if (added.length === 0) return;
    frontier = added;
  }
}

export async function scanRepository(input: {
  readonly commitSha: string;
  /**
   * Blob fetches in flight at once. Clamped to [1, 32]; anything else falls
   * back to `DEFAULT_SCAN_FETCH_CONCURRENCY`. The scan plan is identical at
   * every setting — see `mapWithConcurrency`.
   */
  readonly fetchConcurrency?: number;
  readonly maxFileBytes?: number;
  /**
   * `full` re-parses every code file in the tree, including ones whose blob
   * is unchanged, so the plan carries the repository's complete link set.
   * Bodies are still read transiently and never stored — the only difference
   * is that an unchanged file contributes links instead of nothing. Use it
   * when the resolver generation moved (LINK_SCHEMA_VERSION) or when a user
   * asks for a rescan of an already-ingested repository.
   */
  readonly mode?: LinkScope;
  readonly previousArtifacts?: readonly PreviousScannedArtifact[];
  readonly previousCommitSha?: string | null;
  readonly source: RepositorySource;
}): Promise<RepositoryScanPlan> {
  if (!isScannableCommitSha(input.commitSha)) {
    // The null id passes the format check and names no commit; saying so
    // here replaces an opaque 404 on the tree lookup, and keeps a job that
    // carries it from ever touching the repository host.
    throw new Error(
      input.commitSha === NULL_GIT_SHA
        ? "Repository scan commit SHA is the null sha (a deleted ref): there is no tree to scan."
        : "Repository scan commit SHA must be 40 lowercase hexadecimal characters.",
    );
  }

  const linkScope: LinkScope = input.mode ?? "incremental";

  // Same commit, incremental pass: nothing to say. A full relink still runs —
  // the commit did not move, but the resolver did.
  if (input.previousCommitSha === input.commitSha && linkScope !== "full") {
    return {
      artifacts: [],
      codeLinks: [],
      commitSha: input.commitSha,
      docLinks: [],
      layoutConfig: EMPTY_REPOSITORY_CONFIG,
      linkSchemaVersion: LINK_SCHEMA_VERSION,
      routes: [],
      schemaLinks: [],
      schemaObjects: [],
      sectionLinks: [],
      sections: [],
      symbolLinks: [],
      linkScope,
      removedPaths: [],
      skipped: [],
      touchedRows: 0,
      treeSha: null,
      unchangedPaths: (input.previousArtifacts ?? [])
        .map(({ path }) => path)
        .sort(),
    };
  }

  const tree = await input.source.listTree(input.commitSha);
  if (tree.truncated) {
    throw new Error("Repository source returned a truncated tree.");
  }

  const maxFileBytes = input.maxFileBytes ?? 1024 * 1024;
  const previousByPath = new Map(
    (input.previousArtifacts ?? []).map((artifact) => [
      artifact.path,
      artifact,
    ]),
  );
  const observedPaths = new Set<string>();
  const artifacts: ScannedArtifact[] = [];
  const skipped: ScanSkip[] = [];
  const unchangedPaths: string[] = [];
  const parsedLinks = new Map<string, ParsedFileLinks>();
  const parsedDocuments = new Map<string, ParsedMarkdownStructure>();
  const routes: RouteDeclaration[] = [];
  const schemaObjects: DbObject[] = [];
  const sections: DocumentSection[] = [];
  const sectionReferences = new Map<
    string,
    readonly ParsedSectionReference[]
  >();
  const citingRationales: {
    adrRef: string | null;
    line: number;
    sourcePath: string;
  }[] = [];
  const rawSchemaLinks: SchemaLink[] = [];
  const queryReferences = new Map<string, readonly ParsedQueryReference[]>();
  const knownCodePaths = new Set<string>();
  /** Every artifact path in the tree — what a document link resolves against. */
  const knownArtifactPaths = new Set<string>();
  const treePaths = new Set<string>();
  /**
   * Manifest bodies read this pass, for `buildModuleResolution`. Transient by
   * construction: the map is local to the call and nothing derived from it
   * carries file text into the plan (WORK_SPEC §3-3).
   */
  const manifestTexts = new Map<string, string>();

  /**
   * Pass 1 — classification, no I/O (perf research MT-3). Every decision that
   * does not need the file body is made here, in path order, and each entry
   * lands in a slot. The blob-sha skip already happened before any fetch in
   * the old sequential loop, so the set of files that really need fetching is
   * fully known before the first request goes out.
   */
  type ScanSlot =
    | { readonly kind: "skipped"; readonly skip: ScanSkip }
    | { readonly kind: "unchanged"; readonly path: string }
    | {
        /**
         * A file whose text this pass needs for module resolution. Since
         * Phase 4 Wave A todo 2 a manifest is usually an artifact too
         * (`package.json` is config), so the slot carries the classification
         * and one fetch serves both: the alias rules and the artifact row.
         */
        readonly kind: "manifest";
        readonly classification: ArtifactClassification | null;
        readonly entry: RepositoryTreeEntry;
        readonly previous: PreviousScannedArtifact | undefined;
      }
    | {
        readonly kind: "fetch";
        readonly classification: ArtifactClassification;
        readonly entry: RepositoryTreeEntry;
        readonly previous: PreviousScannedArtifact | undefined;
        /**
         * The blob is unchanged and only its links are wanted: the body is
         * read to re-parse, no artifact row is emitted, and the path stays in
         * `unchangedPaths`. Only a `full` pass produces these.
         */
        readonly relinkOnly: boolean;
      };

  const slots: ScanSlot[] = [];
  let manifestCount = 0;

  const sortedEntries = [...tree.entries].sort((left, right) =>
    left.path.localeCompare(right.path),
  );
  for (const entry of sortedEntries) {
    if (entry.type === "blob") treePaths.add(entry.path);
  }

  // The repository's own scan settings, read before anything is classified
  // because they decide what a file even is. One extra round trip, and only
  // for a repository that ships the file (Phase 4 Wave A todo 2, OQ-043).
  const configEntry = sortedEntries.find(
    (entry) =>
      entry.type === "blob" &&
      entry.path === REPOSITORY_CONFIG_PATH &&
      (entry.size ?? 0) <= MAX_MANIFEST_BYTES,
  );
  let repositoryConfig = EMPTY_REPOSITORY_CONFIG;
  if (configEntry) {
    try {
      const text = decodedText(
        await input.source.fetchContent(configEntry.path, input.commitSha),
      );
      if (text !== null) repositoryConfig = parseRepositoryConfig(text);
    } catch {
      // A settings file that cannot be read is a setting we do not have,
      // not a scan that fails.
    }
  }
  const ignoredByRepository = repositoryIgnoreMatcher(repositoryConfig);
  const declaredTodo = repositoryTodoMatcher(repositoryConfig);

  for (const entry of sortedEntries) {
    if (entry.type === "commit" || entry.mode === "160000") {
      slots.push({
        kind: "skipped",
        skip: {
          detail: "Git submodules are not followed.",
          path: entry.path,
          reason: "submodule",
        },
      });
      continue;
    }
    if (entry.mode === "120000") {
      slots.push({
        kind: "skipped",
        skip: {
          detail: "Symbolic links are not followed.",
          path: entry.path,
          reason: "symlink",
        },
      });
      continue;
    }
    if (entry.type !== "blob") {
      continue;
    }

    // The repository's own list runs first: `.alrescha.json` is how a
    // repository keeps its evidence logs or generated notes out of the
    // graph, and it has to be able to exclude a file the defaults keep.
    if (ignoredByRepository(entry.path)) {
      continue;
    }

    const classification = classifyArtifactPath(entry.path, declaredTodo);
    // A manifest is read for the mappings a non-relative specifier resolves
    // through — package names, `exports`/`main` targets, tsconfig `paths`,
    // Python source roots (Wave A todo 0, R5 §2.2 D1) — and is re-read on
    // every pass, including incremental ones, because a partial alias table
    // resolves fewer specifiers than a full scan of the same commit would.
    const isManifest =
      manifestCount < MAX_MANIFESTS_PER_SCAN &&
      isManifestPath(entry.path) &&
      !isIgnoredManifestPath(entry.path) &&
      !underFixtureDirectory(entry.path.toLowerCase()) &&
      (entry.size ?? 0) <= MAX_MANIFEST_BYTES;

    if (!classification && !isManifest) {
      continue;
    }
    if (classification) {
      observedPaths.add(entry.path);
      knownArtifactPaths.add(entry.path);
      if (classification === "code_metadata") {
        knownCodePaths.add(entry.path);
      }
    }
    if (isManifest) {
      manifestCount += 1;
      slots.push({
        classification,
        entry,
        kind: "manifest",
        previous: previousByPath.get(entry.path),
      });
      continue;
    }
    // Unreachable at runtime — the compound check above sent every
    // unclassified entry on — but it is what tells the compiler so.
    if (!classification) continue;

    if ((entry.size ?? 0) > maxFileBytes) {
      slots.push({
        kind: "skipped",
        skip: {
          detail: `File size ${entry.size} exceeds ${maxFileBytes} bytes.`,
          path: entry.path,
          reason: "oversized",
        },
      });
      continue;
    }

    const previous = previousByPath.get(entry.path);
    if (previous?.sourceBlobSha === entry.sha) {
      // A full relink re-reads every file whose links this scan derives —
      // documents as well as code. Without the document half, a resolver
      // improvement would reach only the prose that happens to change next
      // (R5 §2.2 D2), which is the defect todo 0 fixed for imports.
      if (
        linkScope === "full" &&
        (classification === "code_metadata" ||
          (isMarkdownArtifact(classification) &&
            !isBeadsExportPath(entry.path)))
      ) {
        slots.push({
          classification,
          entry,
          kind: "fetch",
          previous,
          relinkOnly: true,
        });
        continue;
      }
      slots.push({ kind: "unchanged", path: entry.path });
      continue;
    }

    slots.push({
      classification,
      entry,
      kind: "fetch",
      previous,
      relinkOnly: false,
    });
  }

  /**
   * Pass 2 — fetch the bodies, several at a time. Results come back in slot
   * order and a failure surfaces as the first one in slot order, so both the
   * plan and the thrown error are what the sequential loop produced.
   */
  const pending = slots.filter(
    (slot): slot is Extract<ScanSlot, { kind: "fetch" | "manifest" }> =>
      slot.kind === "fetch" || slot.kind === "manifest",
  );
  const fetched = await mapWithConcurrency(
    pending,
    clampConcurrency(input.fetchConcurrency, DEFAULT_SCAN_FETCH_CONCURRENCY),
    async (slot) => {
      if (slot.kind !== "manifest") {
        return input.source.fetchContent(slot.entry.path, input.commitSha);
      }
      // A manifest is an optimisation, never a requirement: a read that
      // fails costs the repository some alias rules, not the scan.
      try {
        return await input.source.fetchContent(
          slot.entry.path,
          input.commitSha,
        );
      } catch {
        return new Uint8Array();
      }
    },
  );

  /**
   * Pass 3 — the original post-fetch work, in the original order. Nothing here
   * touches the network, so `artifacts`, `skipped`, `unchangedPaths` and the
   * `parsedLinks` insertion order are what they always were.
   */
  let fetchIndex = 0;
  for (const slot of slots) {
    if (slot.kind === "skipped") {
      skipped.push(slot.skip);
      continue;
    }
    if (slot.kind === "unchanged") {
      unchangedPaths.push(slot.path);
      continue;
    }

    // Both remaining slot kinds carry exactly one fetched body, in slot
    // order. A manifest that is also an artifact — every `package.json` is,
    // since todo 2 — reads its bytes once and does both jobs with them.
    const { classification, entry, previous } = slot;
    const relinkOnly = slot.kind === "fetch" && slot.relinkOnly;
    const bytes = fetched[fetchIndex] as Uint8Array;
    fetchIndex += 1;

    if (slot.kind === "manifest" && bytes.byteLength > 0) {
      const text = decodedText(bytes);
      if (text !== null) manifestTexts.set(entry.path, text);
    }
    // A manifest outside the artifact vocabulary stops here.
    if (classification === null) continue;
    if (bytes.byteLength > maxFileBytes) {
      skipped.push({
        detail: `Fetched file size ${bytes.byteLength} exceeds ${maxFileBytes} bytes.`,
        path: entry.path,
        reason: "oversized",
      });
      continue;
    }
    const source = decodedText(bytes);
    if (source === null) {
      skipped.push({
        detail: "File is not valid UTF-8 text.",
        path: entry.path,
        reason: "binary",
      });
      continue;
    }

    const digest = createHash("sha256").update(bytes).digest("hex");
    if (previous?.digest === digest && !relinkOnly) {
      unchangedPaths.push(entry.path);
      continue;
    }

    const extraction =
      classification === "code_metadata"
        ? extractSymbols(entry.path, source)
        : null;

    if (extraction?.engine === "typescript-ast") {
      parsedLinks.set(entry.path, parseTypeScriptLinks(entry.path, source));
    } else if (extraction?.engine === "python-structural") {
      parsedLinks.set(entry.path, parsePythonLinks(source));
    }

    // A beads export is `todo_progress` but is not prose: the classification
    // says what a file means, the path says whether a markdown parser can
    // read it, and those are two different questions.
    if (isMarkdownArtifact(classification) && !isBeadsExportPath(entry.path)) {
      const document = parseMarkdownStructure({ path: entry.path, source });
      parsedDocuments.set(entry.path, document);
      // ID-token headings become hubs, and every document that names one
      // hangs off it (todo 8). Both halves read the body already in hand.
      sections.push(
        ...parseDocumentSections({
          config: repositoryConfig,
          document,
          path: entry.path,
        }),
      );
      const cited = parseSectionReferences({
        config: repositoryConfig,
        source,
      });
      if (cited.length > 0) sectionReferences.set(entry.path, cited);
    }

    // Decorator routes, read from the body already in hand and reduced to
    // method, path and line before anything is kept (todo 6).
    if (extraction?.engine === "python-structural") {
      for (const declaration of parsePythonRoutes(source)) {
        routes.push({ ...declaration, sourcePath: entry.path });
      }
    }

    // A `WHY: … ADR-013` comment is a citation of a decision, so it hangs off
    // the same section node a document's mention does (todo 8). Extracted
    // here rather than at artifact-push time because a full relink re-reads
    // the body without writing an artifact row, and a citation that appeared
    // only on a first scan would make the two scan modes disagree.
    const rationales =
      classification === "code_metadata"
        ? extractRationales(entry.path, source)
        : [];
    for (const rationale of rationales) {
      if (rationale.adrRef) {
        citingRationales.push({
          adrRef: rationale.adrRef,
          line: rationale.line,
          sourcePath: entry.path,
        });
      }
    }

    // Database objects and the code that names them (todo 7). Both sides
    // keep names and lines only.
    if (classification === "schema") {
      const parsed = parseSchemaFile({ path: entry.path, source });
      schemaObjects.push(...parsed.objects);
      rawSchemaLinks.push(...parsed.links);
    } else if (classification === "code_metadata") {
      const references = parseQueryReferences(source);
      if (references.length > 0) queryReferences.set(entry.path, references);
    }

    if (relinkOnly) {
      // The body was read to re-parse its links and is now discarded: the
      // artifact row on record is already correct for this blob.
      unchangedPaths.push(entry.path);
      continue;
    }

    artifacts.push({
      classification,
      digest,
      exportedSymbols: extraction?.symbols ?? [],
      kind: persistedKind(classification),
      path: entry.path,
      rationales,
      sizeBytes: bytes.byteLength,
      sourceBlobSha: entry.sha,
      sourceCommitSha: input.commitSha,
      symbolEngine: extraction?.engine ?? null,
      // Two readers, because a todo document is not always prose. Which one
      // runs is decided by the path, not by the classification: a beads
      // export and a `TODO.md` are both `todo_progress`, and reading JSON
      // lines with a markdown parser would produce a todo per file instead
      // of a todo per issue.
      todoItems:
        classification === "todo_progress"
          ? isBeadsExportPath(entry.path)
            ? parseBeadsExport({ path: entry.path, source })
            : parseTodoDocument({ path: entry.path, source })
          : [],
    });
  }

  const removedPaths = [...previousByPath.keys()]
    .filter((path) => !observedPaths.has(path))
    .sort();

  // Name-match resolution sees every known export: files scanned this pass
  // override their previous record; unchanged files keep their stored symbols.
  const exportsByPath = new Map<string, ReadonlySet<string>>();
  for (const [path, previous] of previousByPath) {
    if (observedPaths.has(path)) {
      exportsByPath.set(
        path,
        new Set(previous.exportedSymbols.map(({ name }) => name)),
      );
    }
  }
  for (const artifact of artifacts) {
    if (artifact.classification === "code_metadata") {
      exportsByPath.set(
        artifact.path,
        new Set(artifact.exportedSymbols.map(({ name }) => name)),
      );
    }
  }
  const resolution = buildModuleResolution({
    manifests: manifestTexts,
    treePaths,
  });

  /**
   * Pass 4 — read the barrels this pass's imports point through.
   *
   * Attributing `import { scanRepository } from "@alrescha/core"` to the file
   * that declares it needs the barrel's own `export … from` list, and an
   * incremental pass only parses files that changed. Without this pass the
   * edge would land on the barrel or on the declaring file depending on
   * whether the barrel happened to be rescanned — the same commit yielding
   * different edges on different scan histories. These bodies are read
   * transiently like every other, and produce no artifact rows.
   */
  await readBarrelBodies({
    commitSha: input.commitSha,
    concurrency: clampConcurrency(
      input.fetchConcurrency,
      DEFAULT_SCAN_FETCH_CONCURRENCY,
    ),
    knownCodePaths,
    maxFileBytes,
    parsedLinks,
    resolution,
    source: input.source,
  });

  const codeLinks = resolveCodeLinks({
    exportsByPath,
    files: parsedLinks,
    knownPaths: knownCodePaths,
    resolution,
  });
  // Symbol-to-symbol links resolve against the same export index, so a base
  // in a file this pass did not re-read still attributes to its declaring
  // file — the previous scan's symbols are in `exportsByPath` for that.
  const symbolLinks = resolveSymbolLinks({
    exportsByPath,
    files: parsedLinks,
    knownPaths: knownCodePaths,
    resolution,
  });

  // Documents resolve against every artifact path in the tree, not only the
  // ones this pass re-read: a spec that did not change still points at a file
  // that did, and the target has to exist for the edge to be storable.
  const docLinks = resolveDocLinks({
    documents: parsedDocuments,
    knownPaths: knownArtifactPaths,
  });

  return {
    artifacts,
    codeLinks,
    commitSha: input.commitSha,
    docLinks,
    layoutConfig: repositoryConfig,
    linkSchemaVersion: LINK_SCHEMA_VERSION,
    routes,
    schemaLinks: resolveSchemaLinks({
      objects: schemaObjects,
      queries: queryReferences,
      schemaLinks: rawSchemaLinks,
    }),
    schemaObjects,
    sectionLinks: resolveSectionLinks({
      rationales: citingRationales,
      references: sectionReferences,
      sections,
    }),
    sections,
    symbolLinks,
    linkScope,
    removedPaths,
    skipped,
    touchedRows: artifacts.length + removedPaths.length + skipped.length,
    treeSha: tree.treeSha,
    unchangedPaths: unchangedPaths.sort(),
  };
}
