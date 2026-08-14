import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { probeRepositoryEvidence } from "../packages/core/src/index";
import { describe, expect, it } from "vitest";

describe("repository metadata evidence probes", () => {
  it("matches paths, globs, and symbols while downgrading regex-derived symbols", () => {
    const result = probeRepositoryEvidence({
      artifacts: [
        {
          exportedSymbols: ["SESSION_TIMEOUT_MS", "isSessionExpired"],
          path: "src/session.ts",
          symbolExtraction: "typescript-compiler",
        },
        {
          exportedSymbols: ["record_login"],
          path: "service/audit.py",
          symbolExtraction: "regex",
        },
      ],
      probes: [
        { id: "exact", kind: "path", pattern: "src/session.ts" },
        { id: "glob", kind: "glob", pattern: "src/**/*.ts" },
        { id: "ts-symbol", kind: "symbol", pattern: "isSessionExpired" },
        { id: "fallback-symbol", kind: "symbol", pattern: "record_login" },
        { id: "missing", kind: "path", pattern: "src/login.ts" },
      ],
    });

    expect(
      result.map(({ confidence, id, matches, reason }) => ({
        confidence,
        id,
        matches,
        reason,
      })),
    ).toEqual([
      {
        confidence: 1,
        id: "exact",
        matches: ["src/session.ts"],
        reason: "Exact path matched scanned metadata.",
      },
      {
        confidence: 1,
        id: "glob",
        matches: ["src/session.ts"],
        reason: "Glob matched scanned metadata.",
      },
      {
        confidence: 1,
        id: "ts-symbol",
        matches: ["src/session.ts#isSessionExpired"],
        reason: "Symbol matched TypeScript compiler metadata.",
      },
      {
        confidence: 0.65,
        id: "fallback-symbol",
        matches: ["service/audit.py#record_login"],
        reason: "Symbol matched regex-derived metadata; confidence downgraded.",
      },
      {
        confidence: 1,
        id: "missing",
        matches: [],
        reason: "Exact path was not found in scanned metadata.",
      },
    ]);
    expect(result.every(({ grade }) => grade === "inferred")).toBe(true);
  });

  it("has no repository-code execution path", async () => {
    const evidenceSources = await Promise.all(
      ["probes.ts", "ci-reports.ts"].map((name) =>
        readFile(
          resolve(import.meta.dirname, "../packages/core/src/evidence", name),
          "utf8",
        ),
      ),
    );
    const implementation = evidenceSources.join("\n");

    expect(implementation).not.toMatch(
      /node:child_process|\bexecFileSync\b|\bspawnSync\b/,
    );
    expect(implementation).not.toMatch(/\beval\s*\(|\bnew Function\b/);
  });
});
