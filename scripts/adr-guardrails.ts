import { readdir, readFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";

export type GuardrailRule =
  | "direct-branch-mutation"
  | "deprecated-mcp-capability"
  | "doc-body-inlining"
  | "network-in-core"
  | "raw-code-persistence"
  | "repo-write-outside-pr-proposal";

export interface GuardrailViolation {
  readonly column: number;
  readonly file: string;
  readonly line: number;
  readonly message: string;
  readonly rule: GuardrailRule;
}

const SOURCE_EXTENSIONS = new Set([".cjs", ".js", ".mjs", ".ts", ".tsx"]);
const PRODUCTION_ROOTS = ["apps", "packages", "supabase/migrations"] as const;
const EXCLUDED_SEGMENTS = new Set([".next", "coverage", "dist", "node_modules"]);

interface PatternRule {
  readonly message: (match: RegExpExecArray) => string;
  readonly pattern: RegExp;
  readonly rule: GuardrailRule;
  readonly when: (file: string) => boolean;
}

function normalized(file: string): string {
  return file.replaceAll("\\", "/");
}

function isTestFile(file: string): boolean {
  return /(?:^|\/)(?:__tests__|test|tests)(?:\/|$)|\.(?:spec|test)\.[cm]?[jt]sx?$/.test(file);
}

function isTransientPath(file: string): boolean {
  return /(?:^|\/)transient(?:\/|$)/.test(file);
}

function isPrProposalPath(file: string): boolean {
  return /(?:^|\/)(?:pr-proposal|index-pr)(?:\/|\.[cm]?[jt]sx?$)/.test(file);
}

function isIndexTemplatePath(file: string): boolean {
  return /(?:minimal-index|index-template|pr-proposal|index-pr)/.test(file);
}

const RULES: readonly PatternRule[] = [
  {
    rule: "direct-branch-mutation",
    pattern:
      /\.pulls\.merge\s*\(|\.(?:mergePullRequest|updateDefaultBranch|pushToDefaultBranch)\s*\(/g,
    when: () => true,
    message: () =>
      "Direct branch mutation and pull-request merge paths are forbidden; proposals remain advisory-only.",
  },
  {
    rule: "deprecated-mcp-capability",
    pattern:
      /import\s+(?:type\s+)?\{[^}]*\b(Sampling|Roots|Logging)\b[^}]*\}\s+from\s+["'][^"']*(?:modelcontextprotocol|mcp)[^"']*["']/g,
    when: () => true,
    message: (match) =>
      `MCP ${match[1] ?? "deprecated"} capability is forbidden; MCP 2026-07-28 is stateless.`,
  },
  {
    rule: "deprecated-mcp-capability",
    pattern: /\b(?:capabilities|serverCapabilities)\s*[:=]\s*\{[^}]{0,600}\b(sampling|roots|logging)\s*:/gi,
    when: () => true,
    message: (match) =>
      `MCP ${match[1] ?? "deprecated"} capability is forbidden; MCP 2026-07-28 is stateless.`,
  },
  {
    rule: "deprecated-mcp-capability",
    pattern: /\b(?:sessionId|protocolSession)\s*:/g,
    when: () => true,
    message: () => "Protocol session state is forbidden; MCP 2026-07-28 must remain stateless.",
  },
  {
    rule: "raw-code-persistence",
    pattern: /\b(?:raw_source|source_code|code_body|raw_code)\b\s+(?:jsonb|text|varchar)\b/gi,
    when: (file) => !isTransientPath(file),
    message: () => "Raw source-code persistence is forbidden outside an allowlisted transient path.",
  },
  {
    rule: "raw-code-persistence",
    pattern:
      /\b(?:insert|persist|save|update|upsert)\w*\s*\([^;]{0,240}\b(?:rawCode|rawSource|sourceCode|codeBody)\b/gi,
    when: (file) => !isTransientPath(file),
    message: () => "Raw source-code persistence is forbidden outside an allowlisted transient path.",
  },
  {
    rule: "doc-body-inlining",
    pattern: /(?:\$\{\s*)?(?:artifact|doc|document)\.(?:body|content|raw|sourceText)\b|\b(?:docBody|fullDocument|artifactContent)\b/g,
    when: isIndexTemplatePath,
    message: () => "Document bodies must not be inlined into minimal-index templates.",
  },
  {
    rule: "repo-write-outside-pr-proposal",
    pattern:
      /\.(?:createCommit|createOrUpdateFileContents|createRef|deleteRef|updateRef)\s*\(|\.pulls\.create\s*\(|\bgit\s+push\b/g,
    when: (file) => !isPrProposalPath(file),
    message: () => "Repository writes are allowed only inside the advisory PR-proposal module.",
  },
  {
    rule: "network-in-core",
    pattern:
      /\bfetch\s*\(|\bnew\s+(?:EventSource|WebSocket|XMLHttpRequest)\b|from\s+["'](?:axios|node:https?|undici)["']/g,
    when: (file) => file.startsWith("packages/core/src/"),
    message: () => "Core must receive network access through an injected port; direct network calls are forbidden.",
  },
];

function locationAt(text: string, offset: number): { line: number; column: number } {
  const prefix = text.slice(0, offset);
  const line = prefix.split("\n").length;
  const lastNewline = prefix.lastIndexOf("\n");
  return { line, column: offset - lastNewline };
}

export function scanGuardrailFile(file: string, text: string): readonly GuardrailViolation[] {
  const relativeFile = normalized(file);

  if (isTestFile(relativeFile)) {
    return [];
  }

  const violations: GuardrailViolation[] = [];

  for (const definition of RULES) {
    if (!definition.when(relativeFile)) {
      continue;
    }

    definition.pattern.lastIndex = 0;
    let match = definition.pattern.exec(text);

    while (match) {
      const location = locationAt(text, match.index);
      violations.push({
        column: location.column,
        file: relativeFile,
        line: location.line,
        message: definition.message(match),
        rule: definition.rule,
      });

      match = definition.pattern.exec(text);
    }
  }

  return violations;
}

async function collectFiles(directory: string): Promise<string[]> {
  let entries;

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }

  const files: string[] = [];

  for (const entry of entries) {
    if (EXCLUDED_SEGMENTS.has(entry.name)) {
      continue;
    }

    const absolute = resolve(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(absolute)));
    } else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))) {
      files.push(absolute);
    }
  }

  return files.sort();
}

export async function scanGuardrails(rootDir: string): Promise<readonly GuardrailViolation[]> {
  const root = resolve(rootDir);
  const files = (
    await Promise.all(PRODUCTION_ROOTS.map((productionRoot) => collectFiles(resolve(root, productionRoot))))
  ).flat();
  const violations: GuardrailViolation[] = [];

  for (const file of files) {
    const source = await readFile(file, "utf8");
    violations.push(...scanGuardrailFile(relative(root, file), source));
  }

  return violations.sort(
    (left, right) =>
      left.file.localeCompare(right.file) || left.line - right.line || left.column - right.column,
  );
}
