import { readdir, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildInstructionCostTable,
  type InstructionArtifactInput,
  type InstructionClassification,
} from "./instruction-cost";
import { classifyArtifactPath } from "../ingest/repository-scanner";
import { CHARS_PER_TOKEN } from "../stats/token-estimate";

const REPOSITORY_ROOT = resolve(import.meta.dirname, "../../../..");
const SKIPPED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
]);

function artifact(
  overrides: Partial<InstructionArtifactInput> &
    Pick<InstructionArtifactInput, "classification" | "path">,
): InstructionArtifactInput {
  return {
    id: overrides.path,
    repositoryId: "repo-1",
    sizeBytes: 4_000,
    ...overrides,
  };
}

async function realInstructionArtifacts(
  directory: string,
): Promise<InstructionArtifactInput[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const found: InstructionArtifactInput[] = [];
  for (const entry of entries) {
    if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await realInstructionArtifacts(absolute)));
      continue;
    }
    if (!entry.isFile()) continue;
    const path = relative(REPOSITORY_ROOT, absolute).replaceAll("\\", "/");
    const classification = classifyArtifactPath(path);
    if (
      classification !== "agents" &&
      classification !== "claude" &&
      classification !== "cursor_rule" &&
      classification !== "skill"
    ) {
      continue;
    }
    found.push({
      classification: classification as InstructionClassification,
      id: path,
      path,
      repositoryId: "alrescha",
      sizeBytes: (await stat(absolute)).size,
    });
  }
  return found;
}

describe("instruction cost table", () => {
  it("sums only what an agent loads without being asked", () => {
    const table = buildInstructionCostTable([
      artifact({ classification: "agents", path: "AGENTS.md", sizeBytes: 800 }),
      artifact({
        classification: "claude",
        path: "CLAUDE.md",
        sizeBytes: 400,
      }),
      artifact({
        classification: "agents",
        path: "apps/web/AGENTS.md",
        sizeBytes: 1_200,
      }),
      artifact({
        classification: "skill",
        path: ".claude/skills/review/SKILL.md",
        sizeBytes: 2_000,
      }),
      artifact({
        classification: "cursor_rule",
        path: ".cursor/rules/testing.mdc",
        sizeBytes: 600,
      }),
    ]);

    // 200 + 100. The nested AGENTS.md is the largest file in the set and is
    // deliberately not in this number.
    expect(table.totals.alwaysTokens).toBe(300);
    expect(table.totals.alwaysFiles).toBe(2);
    expect(table.totals.conditionalTokens).toBe(300);
    expect(table.totals.onDemandTokens).toBe(500);
    expect(table.totals.unknownTokens).toBe(150);
    expect(table.totals.files).toBe(5);
    expect(table.totals.sizeBytes).toBe(5_000);
    // Only the two unconditional files, so a reader cannot divide the table
    // total by the always total and get a ratio that means nothing.
    expect(table.totals.alwaysSizeBytes).toBe(1_200);
    // A loader that sees files but loads none of them unprompted still gets a
    // line: "this repository gives Claude Code nothing at session start".
    expect(
      table.totals.perLoader.find(({ loader }) => loader === "claude_code"),
    ).toEqual({
      alwaysFiles: 1,
      alwaysTokens: 100,
      files: 2,
      loader: "claude_code",
      unresolvedFiles: 0,
    });
    // Four buckets, no overlap, and together they are the whole table.
    expect(
      table.totals.alwaysTokens +
        table.totals.conditionalTokens +
        table.totals.onDemandTokens +
        table.totals.unknownTokens,
    ).toBe(table.rows.reduce((total, row) => total + row.estimatedTokens, 0));
  });

  it("names the tokenizer assumption rather than implying one", () => {
    const table = buildInstructionCostTable([]);
    expect(table.assumption).toEqual({ basis: "bytes", charsPerToken: 4 });
    expect(table.totals.perLoader).toEqual([]);
  });

  it("puts the unconditional cost at the top", () => {
    const table = buildInstructionCostTable([
      artifact({
        classification: "cursor_rule",
        path: ".cursor/rules/a.mdc",
        sizeBytes: 40_000,
      }),
      artifact({ classification: "claude", path: "CLAUDE.md", sizeBytes: 40 }),
      artifact({ classification: "agents", path: "AGENTS.md", sizeBytes: 80 }),
    ]);
    expect(table.rows.map(({ path }) => path)).toEqual([
      "AGENTS.md",
      "CLAUDE.md",
      ".cursor/rules/a.mdc",
    ]);
  });

  it("says which agent loads each file, and why", () => {
    const table = buildInstructionCostTable([
      artifact({ classification: "agents", path: "AGENTS.md" }),
      artifact({ classification: "claude", path: ".claude/rules/style.md" }),
      artifact({ classification: "claude", path: "apps/web/CLAUDE.md" }),
      artifact({
        classification: "claude",
        path: "apps/web/.claude/rules/forms.md",
      }),
    ]);
    const byPath = new Map(table.rows.map((row) => [row.path, row]));
    expect(byPath.get("AGENTS.md")?.loaders).toEqual([
      {
        loader: "codex",
        mode: "always",
        reason: "Codex reads the AGENTS.md chain from the repository root.",
      },
    ]);
    expect(byPath.get(".claude/rules/style.md")?.mode).toBe("always");
    expect(byPath.get("apps/web/CLAUDE.md")?.loaders[0]?.reason).toContain(
      "only while working under apps/web",
    );
    expect(
      byPath.get("apps/web/.claude/rules/forms.md")?.loaders[0]?.reason,
    ).toContain("only while working under apps/web");
  });

  it("reports an unreadable Cursor rule as unknown rather than guessing it", () => {
    const table = buildInstructionCostTable([
      artifact({
        classification: "cursor_rule",
        path: ".cursor/rules/testing.mdc",
        sizeBytes: 1_000,
      }),
    ]);
    const [row] = table.rows;
    expect(row?.mode).toBe("unknown");
    // Guessing `true` would put a maybe in the always-loaded total; guessing
    // `false` would hide a real cost. It does neither.
    expect(table.totals.alwaysTokens).toBe(0);
    expect(table.totals.unknownTokens).toBe(250);
    expect(row?.loaders[0]?.reason).toContain("alwaysApply");
    expect(row?.loaders[0]?.reason).toContain("no file bodies");
  });

  it("counts per loader, and leaves out a loader with nothing to load", () => {
    const table = buildInstructionCostTable([
      artifact({ classification: "agents", path: "AGENTS.md", sizeBytes: 400 }),
      artifact({
        classification: "agents",
        path: "packages/core/AGENTS.md",
        sizeBytes: 400,
      }),
      artifact({ classification: "claude", path: "CLAUDE.md", sizeBytes: 200 }),
    ]);
    expect(table.totals.perLoader).toEqual([
      {
        alwaysFiles: 1,
        alwaysTokens: 50,
        files: 1,
        loader: "claude_code",
        unresolvedFiles: 0,
      },
      {
        alwaysFiles: 1,
        alwaysTokens: 100,
        files: 2,
        loader: "codex",
        unresolvedFiles: 1,
      },
    ]);
  });

  /**
   * The acceptance criterion, on this repository rather than a fixture: the
   * table's per-file rounding must not drift from the byte total it came
   * from. Per-file `ceil` can only ever run ahead of the aggregate, so the
   * check that matters is that it stays within a tenth of it.
   */
  it("agrees with the stored byte totals on this repository (±10%)", async () => {
    const artifacts = await realInstructionArtifacts(REPOSITORY_ROOT);
    expect(artifacts.length).toBeGreaterThan(0);

    const table = buildInstructionCostTable(artifacts);
    const tableTokens = table.rows.reduce(
      (total, row) => total + row.estimatedTokens,
      0,
    );
    const fromBytes = table.totals.sizeBytes / CHARS_PER_TOKEN;

    expect(table.totals.sizeBytes).toBe(
      artifacts.reduce((total, { sizeBytes }) => total + sizeBytes, 0),
    );
    expect(Math.abs(tableTokens - fromBytes) / fromBytes).toBeLessThanOrEqual(
      0.1,
    );
    // The repository's own harness is real, unconditional cost — if this ever
    // reaches zero the walk has stopped finding the files it is measuring.
    expect(table.totals.alwaysTokens).toBeGreaterThan(0);
    expect(table.rows.map(({ path }) => path)).toContain("AGENTS.md");
  });
});
