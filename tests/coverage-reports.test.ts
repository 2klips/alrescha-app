import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ingestCoverageReports,
  resolveReportedPath,
  type CoverageReportArtifact,
} from "../packages/core/src/index";

/**
 * Coverage reports, read for one fact (Phase 4 Wave C todo 18).
 *
 * The percentage is dropped on purpose. A repository that never ran a
 * coverage job has *not measured* its files, and a `0%` on a screen is read
 * as "measured, and none of it is covered" — a different claim, and a false
 * one. What survives parsing is the set of files a run executed, which is
 * what lets the risk map grey a file out instead of reddening it (todo 21).
 */

const HEAD = "c".repeat(40);

function lcov(content: string): CoverageReportArtifact {
  return {
    artifactId: 9001,
    artifactName: "coverage",
    content,
    format: "lcov",
    headSha: HEAD,
  };
}

function istanbul(content: string): CoverageReportArtifact {
  return {
    artifactId: 9002,
    artifactName: "coverage",
    content,
    format: "istanbul-json",
    headSha: HEAD,
  };
}

describe("coverage report ingestion", () => {
  it("reads which files an LCOV trace measured, and no number from it", async () => {
    const result = ingestCoverageReports([
      lcov(
        [
          "TN:",
          "SF:src/auth.ts",
          "FNF:3",
          "FNH:2",
          "LF:40",
          "LH:31",
          "end_of_record",
          "TN:",
          "SF:src/audit.ts",
          "LF:10",
          "LH:0",
          "end_of_record",
        ].join("\n"),
      ),
    ]);

    expect(result.diagnostics).toEqual([]);
    expect(result.measured.map(({ reportedPath }) => reportedPath)).toEqual([
      "src/audit.ts",
      "src/auth.ts",
    ]);
    // `src/audit.ts` has LH:0 — zero lines hit. It is still *measured*, and
    // the record carries no hit count to be mistaken for a grade.
    for (const file of result.measured) {
      expect(Object.keys(file).sort()).toEqual([
        "artifactId",
        "artifactName",
        "format",
        "reportedPath",
      ]);
    }
    expect(JSON.stringify(result.measured)).not.toMatch(
      /\b(?:LH|LF|percent)\b/,
    );
  });

  it("reads an istanbul map's keys and drops its total row", () => {
    const result = ingestCoverageReports([
      istanbul(
        JSON.stringify({
          "/runner/work/app/app/src/auth.ts": { lines: { pct: 82 } },
          total: { lines: { pct: 77 } },
        }),
      ),
    ]);

    expect(result.measured.map(({ reportedPath }) => reportedPath)).toEqual([
      "/runner/work/app/app/src/auth.ts",
    ]);
  });

  /**
   * One broken artifact must not erase what the others measured — the same
   * rule `ingestCiTestReports` gets wrong on purpose for test evidence, where
   * a half-read run is worse than none.
   */
  it("keeps what parsed when one report does not", () => {
    const result = ingestCoverageReports([
      lcov("this is not an lcov file"),
      istanbul(JSON.stringify({ "src/auth.ts": {} })),
    ]);

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.artifactId).toBe(9001);
    expect(result.measured.map(({ reportedPath }) => reportedPath)).toEqual([
      "src/auth.ts",
    ]);
  });

  it("reports nothing measured when there is no report", () => {
    expect(ingestCoverageReports([])).toEqual({
      diagnostics: [],
      measured: [],
    });
  });
});

describe("resolving a reported path", () => {
  const scanned = new Set([
    "packages/core/src/a.ts",
    "src/a.ts",
    "tests/auth.test.ts",
  ]);

  it("finds the repository path inside a CI machine's absolute path", () => {
    expect(
      resolveReportedPath(
        "/home/runner/work/app/app/tests/auth.test.ts",
        scanned,
      ),
    ).toBe("tests/auth.test.ts");
    expect(resolveReportedPath("./tests/auth.test.ts", scanned)).toBe(
      "tests/auth.test.ts",
    );
    expect(resolveReportedPath("tests\\auth.test.ts", scanned)).toBe(
      "tests/auth.test.ts",
    );
  });

  /**
   * Longest first. A repository that vendors a copy of a tree has two files
   * whose paths end the same way, and the report names which one.
   */
  it("prefers the longest suffix that is a scanned path", () => {
    expect(resolveReportedPath("/runner/packages/core/src/a.ts", scanned)).toBe(
      "packages/core/src/a.ts",
    );
    expect(resolveReportedPath("/runner/other/src/a.ts", scanned)).toBe(
      "src/a.ts",
    );
  });

  it("returns null rather than something that looks close", () => {
    expect(resolveReportedPath("/runner/src/b.ts", scanned)).toBeNull();
    expect(resolveReportedPath("", scanned)).toBeNull();
  });
});

/**
 * Inherited from the evidence-probe suite this replaced: whatever else the
 * evidence layer does, it does not run the repository. Both parsers read text
 * and nothing else, and the assertion moves with them rather than being
 * dropped along with the module it used to cover.
 */
describe("the evidence parsers", () => {
  it("have no repository-code execution path", async () => {
    const sources = await Promise.all(
      ["ci-reports.ts", "coverage-reports.ts"].map((name) =>
        readFile(
          resolve(import.meta.dirname, "../packages/core/src/evidence", name),
          "utf8",
        ),
      ),
    );
    const implementation = sources.join("\n");

    expect(implementation).not.toMatch(
      /node:child_process|\bexecFileSync\b|\bspawnSync\b/,
    );
    expect(implementation).not.toMatch(/\beval\s*\(|\bnew Function\b/);
  });
});
