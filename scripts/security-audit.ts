import { readdir, readFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { scanGuardrails } from "./adr-guardrails";

export type SecurityAuditCategory =
  | "span-rendering-injection"
  | "tenant-isolation"
  | "token-key-handling"
  | "transient-fetch-boundary"
  | "webhook-forgery";

export interface SecurityAuditFinding {
  readonly category: SecurityAuditCategory;
  readonly file: string;
  readonly line: number;
  readonly message: string;
  readonly severity: "critical" | "high";
}

export interface SecurityAuditReport {
  readonly checks: Readonly<Record<SecurityAuditCategory, "fail" | "pass">>;
  readonly findings: readonly SecurityAuditFinding[];
  readonly scannedFiles: number;
  readonly status: "fail" | "pass";
}

const CATEGORIES: readonly SecurityAuditCategory[] = [
  "webhook-forgery",
  "token-key-handling",
  "tenant-isolation",
  "transient-fetch-boundary",
  "span-rendering-injection",
];
const PRODUCTION_ROOTS = ["apps", "packages", "supabase/migrations"] as const;
const SOURCE_EXTENSIONS = new Set([
  ".cjs",
  ".js",
  ".mjs",
  ".sql",
  ".ts",
  ".tsx",
]);
const EXCLUDED_DIRECTORIES = new Set([
  ".next",
  "coverage",
  "dist",
  "node_modules",
]);

function normalized(path: string) {
  return path.replaceAll("\\", "/");
}

function lineAt(source: string, offset: number) {
  return source.slice(0, offset).split("\n").length;
}

async function collectFiles(directory: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const files: string[] = [];
  for (const entry of entries) {
    if (EXCLUDED_DIRECTORIES.has(entry.name)) continue;
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(absolute)));
    else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name)))
      files.push(absolute);
  }
  return files.sort();
}

function auditWebhook(file: string, source: string): SecurityAuditFinding[] {
  if (
    !/(?:^|\/)github\/webhook\.ts$|\/api\/github\/webhooks\/route\.ts$/.test(
      file,
    )
  ) {
    return [];
  }
  const processesPayload =
    /request\.text\s*\(|JSON\.parse\s*\(|insertEvent\s*\(|normalizeGitHubWebhook/.test(
      source,
    );
  const verifiesBeforeProcessing =
    /handleGitHubWebhook/.test(source) ||
    (/verifyGitHubWebhookSignature/.test(source) &&
      /timingSafeEqual/.test(source));
  if (!processesPayload || verifiesBeforeProcessing) return [];

  const offset = Math.max(
    0,
    source.search(
      /request\.text\s*\(|JSON\.parse\s*\(|insertEvent\s*\(|normalizeGitHubWebhook/,
    ),
  );
  return [
    {
      category: "webhook-forgery",
      file,
      line: lineAt(source, offset),
      message:
        "Webhook payload processing must follow HMAC signature verification.",
      severity: "critical",
    },
  ];
}

function auditTokenKeyHandling(
  file: string,
  source: string,
): SecurityAuditFinding[] {
  const findings: SecurityAuditFinding[] = [];
  const rules = [
    {
      message:
        "Plaintext tokens and provider keys must never enter application logs.",
      pattern:
        /console\.(?:debug|error|info|log|warn)\s*\([^;]{0,800}\b(?:accessToken|apiKey|authorization|byokKey|installationToken|privateKey|providerKey|secret|token)\b[^;]*\)/gi,
    },
    {
      message: "Secrets must never use a NEXT_PUBLIC environment variable.",
      pattern:
        /NEXT_PUBLIC_(?!(?:SUPABASE_)?(?:ANON|PUBLISHABLE)_KEY\b)[A-Z0-9_]*(?:KEY|SECRET|TOKEN)\b/g,
    },
    {
      message:
        "Production sources must never contain a provider or GitHub token literal.",
      pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{16,})\b/g,
    },
    {
      message:
        "Database schemas must store encrypted key material, never plaintext credentials.",
      pattern:
        /\b(?:access_token|api_key|byok_key|installation_token|provider_key)\b\s+(?:text|varchar)\b/gi,
    },
  ] as const;

  for (const rule of rules) {
    rule.pattern.lastIndex = 0;
    let match = rule.pattern.exec(source);
    while (match) {
      findings.push({
        category: "token-key-handling",
        file,
        line: lineAt(source, match.index),
        message: rule.message,
        severity: "critical",
      });
      match = rule.pattern.exec(source);
    }
  }
  return findings;
}

function auditTenantTables(
  sources: readonly { file: string; source: string }[],
): SecurityAuditFinding[] {
  const sqlCorpus = sources
    .filter(
      ({ file }) =>
        file.startsWith("supabase/migrations/") && file.endsWith(".sql"),
    )
    .map(({ source }) => source)
    .join("\n");
  const findings: SecurityAuditFinding[] = [];
  const rlsEnabledTables = new Set<string>();
  const explicitRls =
    /alter\s+table(?:\s+if\s+exists)?\s+public\.([a-z_][a-z0-9_]*)\s+enable\s+row\s+level\s+security\b/gi;
  let explicit = explicitRls.exec(sqlCorpus);
  while (explicit) {
    if (explicit[1]) rlsEnabledTables.add(explicit[1].toLowerCase());
    explicit = explicitRls.exec(sqlCorpus);
  }

  const boundedLoop =
    /foreach\s+([a-z_][a-z0-9_]*)\s+in\s+array\s+array\s*\[([\s\S]*?)\]\s+loop([\s\S]*?)end\s+loop\s*;/gi;
  let loop = boundedLoop.exec(sqlCorpus);
  while (loop) {
    const variable = loop[1];
    const tableList = loop[2] ?? "";
    const loopBody = loop[3] ?? "";
    const enablesRls =
      /alter table public\.%I enable row level security/i.test(loopBody) &&
      variable !== undefined &&
      new RegExp(`,\\s*${variable}\\s*\\)`, "i").test(loopBody);
    if (enablesRls) {
      const tableName = /'([a-z_][a-z0-9_]*)'/gi;
      let name = tableName.exec(tableList);
      while (name) {
        if (name[1]) rlsEnabledTables.add(name[1].toLowerCase());
        name = tableName.exec(tableList);
      }
    }
    loop = boundedLoop.exec(sqlCorpus);
  }

  for (const { file, source } of sources) {
    if (!file.startsWith("supabase/migrations/") || !file.endsWith(".sql"))
      continue;
    const tablePattern =
      /create\s+table(?:\s+if\s+not\s+exists)?\s+public\.([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\);/gi;
    let table = tablePattern.exec(source);
    while (table) {
      const tableName = table[1];
      const tableBody = table[2] ?? "";
      if (tableName && /\bworkspace_id\b/i.test(tableBody)) {
        if (!rlsEnabledTables.has(tableName.toLowerCase())) {
          findings.push({
            category: "tenant-isolation",
            file,
            line: lineAt(source, table.index),
            message: `Tenant table public.${tableName} must enable row-level security.`,
            severity: "critical",
          });
        }
      }
      table = tablePattern.exec(source);
    }
  }
  return findings;
}

function auditSpanRendering(
  file: string,
  source: string,
): SecurityAuditFinding[] {
  if (!/\.(?:c?js|mjs|tsx?)$/.test(file)) return [];
  const pattern =
    /\bdangerouslySetInnerHTML\b|\.innerHTML\s*=|\binsertAdjacentHTML\s*\(|\bdocument\.write\s*\(/g;
  const findings: SecurityAuditFinding[] = [];
  let match = pattern.exec(source);
  while (match) {
    findings.push({
      category: "span-rendering-injection",
      file,
      line: lineAt(source, match.index),
      message:
        "Source spans and repository metadata must render through escaped text nodes.",
      severity: "high",
    });
    match = pattern.exec(source);
  }
  return findings;
}

export async function runSecurityAudit(
  rootDirectory: string,
): Promise<SecurityAuditReport> {
  const root = resolve(rootDirectory);
  const files = (
    await Promise.all(
      PRODUCTION_ROOTS.map((directory) =>
        collectFiles(resolve(root, directory)),
      ),
    )
  ).flat();
  const findings: SecurityAuditFinding[] = [];
  const sources: Array<{ file: string; source: string }> = [];

  for (const absolute of files) {
    const file = normalized(relative(root, absolute));
    const source = await readFile(absolute, "utf8");
    sources.push({ file, source });
    findings.push(...auditWebhook(file, source));
    findings.push(...auditTokenKeyHandling(file, source));
    findings.push(...auditSpanRendering(file, source));
  }
  findings.push(...auditTenantTables(sources));
  const rawPersistence = (await scanGuardrails(root)).filter(
    ({ rule }) => rule === "raw-code-persistence",
  );
  findings.push(
    ...rawPersistence.map((violation): SecurityAuditFinding => ({
      category: "transient-fetch-boundary",
      file: violation.file,
      line: violation.line,
      message: violation.message,
      severity: "critical",
    })),
  );

  findings.sort(
    (left, right) =>
      left.file.localeCompare(right.file) || left.line - right.line,
  );
  const checks = Object.fromEntries(
    CATEGORIES.map((category) => [
      category,
      findings.some((finding) => finding.category === category)
        ? "fail"
        : "pass",
    ]),
  ) as Record<SecurityAuditCategory, "fail" | "pass">;

  return {
    checks,
    findings,
    scannedFiles: files.length,
    status: findings.length === 0 ? "pass" : "fail",
  };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const report = await runSecurityAudit(process.cwd());
  if (report.status === "pass") {
    console.log(
      `PASS security audit: ${CATEGORIES.length} checks, ${report.scannedFiles} files, 0 high/critical findings`,
    );
  } else {
    console.error(
      `FAIL security audit: ${report.findings.length} high/critical findings`,
    );
    for (const finding of report.findings) {
      console.error(
        `- ${finding.severity} ${finding.category} ${finding.file}:${finding.line} ${finding.message}`,
      );
    }
    process.exitCode = 1;
  }
}
