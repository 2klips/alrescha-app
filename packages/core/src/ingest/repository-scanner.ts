import { createHash } from "node:crypto";

import ts from "typescript";

export type ArtifactClassification =
  | "adr"
  | "agents"
  | "claude"
  | "code_metadata"
  | "cursor_rule"
  | "skill"
  | "spec"
  | "todo_progress";

export type PersistedArtifactKind = "adr" | "code_metadata" | "instruction" | "spec" | "todo";
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

export interface ScannedArtifact {
  readonly classification: ArtifactClassification;
  readonly digest: string;
  readonly exportedSymbols: readonly ExportedSymbolMetadata[];
  readonly kind: PersistedArtifactKind;
  readonly path: string;
  readonly sizeBytes: number;
  readonly sourceBlobSha: string;
  readonly sourceCommitSha: string;
}

export type PreviousScannedArtifact = ScannedArtifact;

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

const CODE_EXTENSIONS = new Set([".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"]);

function extension(path: string): string {
  const fileName = path.slice(path.lastIndexOf("/") + 1);
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot).toLowerCase();
}

export function classifyArtifactPath(inputPath: string): ArtifactClassification | null {
  const path = inputPath.replaceAll("\\", "/");
  const lower = path.toLowerCase();
  const fileName = lower.slice(lower.lastIndexOf("/") + 1);
  const fileExtension = extension(lower);

  if (fileName === "agents.md") {
    return "agents";
  }
  if (fileName === "claude.md" || lower.includes("/.claude/rules/") || lower.startsWith(".claude/rules/")) {
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
    (fileName.startsWith("adr-") || lower.includes("/adr/") || lower.includes("/adrs/"))
  ) {
    return "adr";
  }
  if (
    (fileExtension === ".md" || fileExtension === ".mdx") &&
    /^(todo|todos|progress|status|roadmap)([._-].*)?\.(md|mdx)$/.test(fileName)
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

export function persistedKind(classification: ArtifactClassification): PersistedArtifactKind {
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

function symbolMetadata(sourceFile: ts.SourceFile, node: ts.Node, name: string): ExportedSymbolMetadata {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
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
  return ts.canHaveModifiers(node) && Boolean(ts.getModifiers(node)?.some(({ kind }) => kind === ts.SyntaxKind.ExportKeyword));
}

export function extractExportedSymbols(path: string, source: string): readonly ExportedSymbolMetadata[] {
  const scriptKind = path.toLowerCase().endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, scriptKind);
  const symbols: ExportedSymbolMetadata[] = [];

  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement) && hasExportModifier(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          symbols.push(symbolMetadata(sourceFile, declaration, declaration.name.text));
        }
      }
      continue;
    }

    if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
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

  return symbols.sort((left, right) => left.startLine - right.startLine || left.startColumn - right.startColumn);
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
    throw new Error("Repository scan commit SHA must be 40 lowercase hexadecimal characters.");
  }

  if (input.previousCommitSha === input.commitSha) {
    return {
      artifacts: [],
      commitSha: input.commitSha,
      removedPaths: [],
      skipped: [],
      touchedRows: 0,
      treeSha: null,
      unchangedPaths: (input.previousArtifacts ?? []).map(({ path }) => path).sort(),
    };
  }

  const tree = await input.source.listTree(input.commitSha);
  if (tree.truncated) {
    throw new Error("Repository source returned a truncated tree.");
  }

  const maxFileBytes = input.maxFileBytes ?? 1024 * 1024;
  const previousByPath = new Map((input.previousArtifacts ?? []).map((artifact) => [artifact.path, artifact]));
  const observedPaths = new Set<string>();
  const artifacts: ScannedArtifact[] = [];
  const skipped: ScanSkip[] = [];
  const unchangedPaths: string[] = [];

  for (const entry of [...tree.entries].sort((left, right) => left.path.localeCompare(right.path))) {
    if (entry.type === "commit" || entry.mode === "160000") {
      skipped.push({ detail: "Git submodules are not followed.", path: entry.path, reason: "submodule" });
      continue;
    }
    if (entry.mode === "120000") {
      skipped.push({ detail: "Symbolic links are not followed.", path: entry.path, reason: "symlink" });
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
      skipped.push({ detail: "File is not valid UTF-8 text.", path: entry.path, reason: "binary" });
      continue;
    }

    const digest = createHash("sha256").update(bytes).digest("hex");
    if (previous?.digest === digest) {
      unchangedPaths.push(entry.path);
      continue;
    }

    artifacts.push({
      classification,
      digest,
      exportedSymbols: classification === "code_metadata" ? extractExportedSymbols(entry.path, source) : [],
      kind: persistedKind(classification),
      path: entry.path,
      sizeBytes: bytes.byteLength,
      sourceBlobSha: entry.sha,
      sourceCommitSha: input.commitSha,
    });
  }

  const removedPaths = [...previousByPath.keys()].filter((path) => !observedPaths.has(path)).sort();
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
