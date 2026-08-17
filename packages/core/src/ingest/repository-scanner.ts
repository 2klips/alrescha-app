import { createHash } from "node:crypto";

import ts from "typescript";

import { parseTodoDocument, type ParsedTodoItem } from "../progress/todos";

export type ArtifactClassification =
  | "adr"
  | "agents"
  | "claude"
  | "code_metadata"
  | "cursor_rule"
  | "skill"
  | "spec"
  | "todo_progress";

export type PersistedArtifactKind =
  "adr" | "code_metadata" | "instruction" | "spec" | "todo";
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

export interface RepositoryScanPlan {
  readonly artifacts: readonly ScannedArtifact[];
  readonly commitSha: string;
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

/** Handoff/session files agents leave behind (Phase 2B todo 7 ⑶, H1). */
const HANDOFF_FILE_PATTERN =
  /^(session[-_](state|notes?)|current[-_]task|handoff([._-].*)?)\.(md|mdx)$/;

function extension(path: string): string {
  const fileName = path.slice(path.lastIndexOf("/") + 1);
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot).toLowerCase();
}

export function classifyArtifactPath(
  inputPath: string,
): ArtifactClassification | null {
  const path = inputPath.replaceAll("\\", "/");
  const lower = path.toLowerCase();
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
  if (
    (fileExtension === ".md" || fileExtension === ".mdx") &&
    (fileName.startsWith("adr-") ||
      lower.includes("/adr/") ||
      lower.includes("/adrs/"))
  ) {
    return "adr";
  }
  if (
    (fileExtension === ".md" || fileExtension === ".mdx") &&
    (/^(todo|todos|progress|status|roadmap)([._-].*)?\.(md|mdx)$/.test(
      fileName,
    ) ||
      HANDOFF_FILE_PATTERN.test(fileName))
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
  return null;
}

export function persistedKind(
  classification: ArtifactClassification,
): PersistedArtifactKind {
  switch (classification) {
    case "adr":
      return "adr";
    case "code_metadata":
      return "code_metadata";
    case "spec":
      return "spec";
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

export async function scanRepository(input: {
  readonly commitSha: string;
  readonly maxFileBytes?: number;
  readonly previousArtifacts?: readonly PreviousScannedArtifact[];
  readonly previousCommitSha?: string | null;
  readonly source: RepositorySource;
}): Promise<RepositoryScanPlan> {
  if (!/^[0-9a-f]{40}$/.test(input.commitSha)) {
    throw new Error(
      "Repository scan commit SHA must be 40 lowercase hexadecimal characters.",
    );
  }

  if (input.previousCommitSha === input.commitSha) {
    return {
      artifacts: [],
      commitSha: input.commitSha,
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

  for (const entry of [...tree.entries].sort((left, right) =>
    left.path.localeCompare(right.path),
  )) {
    if (entry.type === "commit" || entry.mode === "160000") {
      skipped.push({
        detail: "Git submodules are not followed.",
        path: entry.path,
        reason: "submodule",
      });
      continue;
    }
    if (entry.mode === "120000") {
      skipped.push({
        detail: "Symbolic links are not followed.",
        path: entry.path,
        reason: "symlink",
      });
      continue;
    }
    if (entry.type !== "blob") {
      continue;
    }

    const classification = classifyArtifactPath(entry.path);
    if (!classification) {
      continue;
    }
    observedPaths.add(entry.path);

    if ((entry.size ?? 0) > maxFileBytes) {
      skipped.push({
        detail: `File size ${entry.size} exceeds ${maxFileBytes} bytes.`,
        path: entry.path,
        reason: "oversized",
      });
      continue;
    }

    const previous = previousByPath.get(entry.path);
    if (previous?.sourceBlobSha === entry.sha) {
      unchangedPaths.push(entry.path);
      continue;
    }

    const bytes = await input.source.fetchContent(entry.path, input.commitSha);
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
    if (previous?.digest === digest) {
      unchangedPaths.push(entry.path);
      continue;
    }

    const extraction =
      classification === "code_metadata"
        ? extractSymbols(entry.path, source)
        : null;

    artifacts.push({
      classification,
      digest,
      exportedSymbols: extraction?.symbols ?? [],
      kind: persistedKind(classification),
      path: entry.path,
      rationales:
        classification === "code_metadata"
          ? extractRationales(entry.path, source)
          : [],
      sizeBytes: bytes.byteLength,
      sourceBlobSha: entry.sha,
      sourceCommitSha: input.commitSha,
      symbolEngine: extraction?.engine ?? null,
      todoItems:
        classification === "todo_progress"
          ? parseTodoDocument({ path: entry.path, source })
          : [],
    });
  }

  const removedPaths = [...previousByPath.keys()]
    .filter((path) => !observedPaths.has(path))
    .sort();
  return {
    artifacts,
    commitSha: input.commitSha,
    removedPaths,
    skipped,
    touchedRows: artifacts.length + removedPaths.length + skipped.length,
    treeSha: tree.treeSha,
    unchangedPaths: unchangedPaths.sort(),
  };
}
