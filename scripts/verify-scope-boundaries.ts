import { readdir, readFile, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { scanGuardrailFile, type GuardrailRule } from "./adr-guardrails";

export const SCOPE_BOUNDARIES = [
  "local-cli",
  "team-ui",
  "external-billing",
  "non-github-provider",
  "marketplace",
  "skill-security-scanning",
  "direct-autonomous-writes",
  "raw-code-persistence",
  "always-loaded-generated-context",
  "deprecated-mcp",
  "unsupported-savings-claims",
] as const;

export type ScopeBoundary = (typeof SCOPE_BOUNDARIES)[number];

export interface ScopeFinding {
  readonly boundary: ScopeBoundary;
  readonly column: number;
  readonly file: string;
  readonly line: number;
  readonly message: string;
}

export interface ScopeReport {
  readonly boundaryCount: number;
  readonly findings: readonly ScopeFinding[];
  readonly scannedFiles: number;
  readonly status: "fail" | "pass";
}

const SOURCE_EXTENSIONS = new Set([
  ".cjs",
  ".js",
  ".json",
  ".jsx",
  ".mjs",
  ".sql",
  ".ts",
  ".tsx",
]);
const PRODUCT_ROOTS = ["apps", "packages", "supabase/migrations"] as const;
const ROOT_PRODUCT_FILES = ["package.json", "README.md"] as const;
const EXCLUDED_SEGMENTS = new Set([
  ".next",
  "coverage",
  "dist",
  "node_modules",
]);
const GUARDRAIL_BOUNDARIES: ReadonlyMap<GuardrailRule, ScopeBoundary> = new Map(
  [
    ["direct-branch-mutation", "direct-autonomous-writes"],
    ["repo-write-outside-pr-proposal", "direct-autonomous-writes"],
    ["raw-code-persistence", "raw-code-persistence"],
    ["doc-body-inlining", "always-loaded-generated-context"],
    ["deprecated-mcp-capability", "deprecated-mcp"],
  ],
);

function normalized(file: string): string {
  return file.replaceAll("\\", "/");
}

function isTestFile(file: string): boolean {
  return /(?:^|\/)(?:__tests__|test|tests)(?:\/|$)|\.(?:spec|test)\.[cm]?[jt]sx?$/.test(
    file,
  );
}

function findingAt(
  boundary: ScopeBoundary,
  file: string,
  source: string,
  offset: number,
  message: string,
): ScopeFinding {
  const prefix = source.slice(0, offset);
  const lastNewline = prefix.lastIndexOf("\n");

  return {
    boundary,
    column: offset - lastNewline,
    file,
    line: prefix.split("\n").length,
    message,
  };
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

async function collectRootProductFiles(root: string): Promise<string[]> {
  const files: string[] = [];

  for (const candidate of ROOT_PRODUCT_FILES) {
    const absolute = resolve(root, candidate);

    try {
      if ((await stat(absolute)).isFile()) {
        files.push(absolute);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  return files;
}

function scanLocalCli(file: string, source: string): readonly ScopeFinding[] {
  const route = /(?:^|\/)(?:cli|command-line)(?:\/|\.|$)/i.exec(file);
  const manifestBin = file.endsWith("package.json")
    ? /"bin"\s*:/i.exec(source)
    : null;
  const shebang = /^#!.*\b(?:node|deno|bun)\b/im.exec(source);
  const match = route ?? manifestBin ?? shebang;

  if (!match) {
    return [];
  }

  return [
    findingAt(
      "local-cli",
      file,
      route ? file : source,
      match.index,
      "A reachable local CLI surface is outside the MVP scope.",
    ),
  ];
}

function scanTeamUi(file: string): readonly ScopeFinding[] {
  if (
    !/(?:^|\/)(?:team|teams|organization|organizations|members)(?:\/|\.|$)/i.test(
      file,
    )
  ) {
    return [];
  }

  return [
    {
      boundary: "team-ui",
      column: 1,
      file,
      line: 1,
      message: "Team and organization UI is outside the single-user MVP scope.",
    },
  ];
}

function scanExternalBilling(
  file: string,
  source: string,
): readonly ScopeFinding[] {
  const route = /(?:^|\/)(?:billing|checkout|payments?)(?:\/|\.|$)/i.exec(file);

  if (route) {
    return [
      findingAt(
        "external-billing",
        file,
        file,
        route.index,
        "External billing is outside the MVP scope.",
      ),
    ];
  }

  const integration =
    /(?:(?:from\s+|import\s*\(|require\s*\()\s*["'](?:stripe|@stripe\/[^"']+|@paddle\/[^"']+|paddle-sdk|@lemonsqueezy\/[^"']+)["']|["'](?:stripe|@stripe\/[^"']+|@paddle\/[^"']+|paddle-sdk|@lemonsqueezy\/[^"']+)["']\s*:)/i.exec(
      source,
    );

  return integration
    ? [
        findingAt(
          "external-billing",
          file,
          source,
          integration.index,
          "External billing is outside the MVP scope.",
        ),
      ]
    : [];
}

function scanNonGithubProvider(
  file: string,
  source: string,
): readonly ScopeFinding[] {
  const route = /(?:^|\/)(?:gitlab|bitbucket|azure-devops)(?:\/|\.|$)/i.exec(
    file,
  );
  const integration =
    /(?:(?:from\s+|import\s*\(|require\s*\()\s*["'](?:@gitbeaker\/[^"']+|bitbucket|bitbucket-api|azure-devops-node-api)["']|["'](?:@gitbeaker\/[^"']+|bitbucket|bitbucket-api|azure-devops-node-api)["']\s*:)/i.exec(
      source,
    );
  const match = route ?? integration;

  return match
    ? [
        findingAt(
          "non-github-provider",
          file,
          route ? file : source,
          match.index,
          "Repository providers other than GitHub are outside the MVP scope.",
        ),
      ]
    : [];
}

function scanMarketplace(
  file: string,
  source: string,
): readonly ScopeFinding[] {
  const route =
    /(?:^|\/)marketplace(?:\/|\.|$)/i.exec(file) ??
    /^apps\/[^/]+\/(?:app|pages|src\/routes)\/store(?:\/|\.|$)/i.exec(file);
  const link =
    /(?:href|url)\s*=\s*["'][^"']*\/(?:marketplace|store)(?:\/|["'])/i.exec(
      source,
    );
  const match = route ?? link;

  return match
    ? [
        findingAt(
          "marketplace",
          file,
          route ? file : source,
          match.index,
          "Marketplace surfaces are outside the MVP scope.",
        ),
      ]
    : [];
}

function scanSkillSecurity(
  file: string,
  source: string,
): readonly ScopeFinding[] {
  const route = /(?:^|\/)skill-(?:security|scanner|audit)(?:\/|\.|$)/i.exec(
    file,
  );
  const scanner =
    /\b(?:scan|audit|inspect)(?:Skill|Skills)(?:For)?(?:Security|Malware|Vulnerabilit(?:y|ies))/i.exec(
      source,
    );
  const match = route ?? scanner;

  return match
    ? [
        findingAt(
          "skill-security-scanning",
          file,
          route ? file : source,
          match.index,
          "Skill security scanning is outside the MVP scope.",
        ),
      ]
    : [];
}

function scanUnsupportedSavings(
  file: string,
  source: string,
): readonly ScopeFinding[] {
  const claim =
    /\b(?:save[sd]?|reduc(?:e[sd]?|tion)|cut(?:s)?|lower(?:s|ed)?)\b[^<>\n]{0,40}\b\d{1,3}(?:\.\d+)?%[^<>\n]{0,40}\b(?:tokens?|costs?|time|context)\b|\b\d{1,3}(?:\.\d+)?%[^<>\n]{0,40}\b(?:less|lower|faster|saving|reduction)\b[^<>\n]{0,40}\b(?:tokens?|costs?|time|context)\b/i.exec(
      source,
    );
  const evidenceLink =
    /href\s*=\s*["'][^"']*(?:evidence|benchmark|report|methodology)[^"']*["']/i.test(
      source,
    );

  return claim && !evidenceLink
    ? [
        findingAt(
          "unsupported-savings-claims",
          file,
          source,
          claim.index,
          "Numeric savings claims require reachable supporting evidence.",
        ),
      ]
    : [];
}

function scanGuardrailBoundaries(
  file: string,
  source: string,
): readonly ScopeFinding[] {
  return scanGuardrailFile(file, source).flatMap((violation) => {
    const boundary = GUARDRAIL_BOUNDARIES.get(violation.rule);

    return boundary
      ? [
          {
            boundary,
            column: violation.column,
            file: violation.file,
            line: violation.line,
            message: violation.message,
          },
        ]
      : [];
  });
}

export async function verifyScopeBoundaries(
  rootDir: string,
): Promise<ScopeReport> {
  const root = resolve(rootDir);
  const files = [
    ...(
      await Promise.all(
        PRODUCT_ROOTS.map((productRoot) =>
          collectFiles(resolve(root, productRoot)),
        ),
      )
    ).flat(),
    ...(await collectRootProductFiles(root)),
  ].filter((absolute) => !isTestFile(normalized(relative(root, absolute))));
  const findings: ScopeFinding[] = [];

  for (const absolute of files) {
    const file = normalized(relative(root, absolute));

    const source = await readFile(absolute, "utf8");
    findings.push(...scanLocalCli(file, source));
    findings.push(...scanTeamUi(file));
    findings.push(...scanExternalBilling(file, source));
    findings.push(...scanNonGithubProvider(file, source));
    findings.push(...scanMarketplace(file, source));
    findings.push(...scanSkillSecurity(file, source));
    findings.push(...scanUnsupportedSavings(file, source));
    findings.push(...scanGuardrailBoundaries(file, source));
  }

  findings.sort(
    (left, right) =>
      left.file.localeCompare(right.file) ||
      left.line - right.line ||
      left.column - right.column,
  );

  return {
    boundaryCount: SCOPE_BOUNDARIES.length,
    findings,
    scannedFiles: files.length,
    status: findings.length === 0 ? "pass" : "fail",
  };
}

async function main(): Promise<void> {
  const report = await verifyScopeBoundaries(process.cwd());

  if (report.status === "pass") {
    console.log(
      `PASS scope fidelity: ${report.boundaryCount} boundaries, ${report.scannedFiles} files, 0 forbidden paths`,
    );
    return;
  }

  for (const finding of report.findings) {
    console.error(
      `${finding.file}:${finding.line}:${finding.column} [${finding.boundary}] ${finding.message}`,
    );
  }

  console.error(
    `FAIL scope fidelity: ${report.findings.length} forbidden path(s)`,
  );
  process.exitCode = 1;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;

if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
