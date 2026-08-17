import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseNpmAuditReport } from "../packages/core/src/index";

/** A realistic `npm audit --json` (auditReportVersion 2) excerpt. */
const VALID_REPORT = {
  auditReportVersion: 2,
  metadata: {
    vulnerabilities: { critical: 1, high: 1, info: 0, low: 0, moderate: 1, total: 3 },
  },
  vulnerabilities: {
    lodash: {
      effects: [],
      fixAvailable: true,
      isDirect: true,
      name: "lodash",
      nodes: ["node_modules/lodash"],
      range: "<4.17.21",
      severity: "high",
      via: [
        {
          name: "lodash",
          severity: "high",
          source: 1096820,
          title: "Command Injection in lodash",
          url: "https://github.com/advisories/GHSA-35jh-r3h4-6jhm",
        },
      ],
    },
    minimist: {
      effects: ["mkdirp"],
      fixAvailable: { isSemVerMajor: true, name: "mkdirp", version: "3.0.0" },
      isDirect: false,
      name: "minimist",
      nodes: ["node_modules/minimist"],
      range: "<1.2.6",
      severity: "critical",
      via: [
        {
          name: "minimist",
          severity: "critical",
          source: 1097670,
          title: "Prototype Pollution in minimist",
          url: "https://github.com/advisories/GHSA-xvch-5gv4-984h",
        },
      ],
    },
    // A transitively-caused entry whose `via` is only chain names.
    mkdirp: {
      effects: [],
      fixAvailable: false,
      isDirect: false,
      name: "mkdirp",
      nodes: ["node_modules/mkdirp"],
      range: "0.4.1 - 0.5.1",
      severity: "moderate",
      via: ["minimist"],
    },
  },
};

describe("parseNpmAuditReport", () => {
  it("parses a version-2 report into sorted advisories with recomputed counts", () => {
    const report = parseNpmAuditReport(VALID_REPORT);
    expect(report).not.toBeNull();
    expect(report!.advisories.map(({ name }) => name)).toEqual([
      "minimist",
      "lodash",
      "mkdirp",
    ]);
    expect(report!.counts).toEqual({
      critical: 1,
      high: 1,
      info: 0,
      low: 0,
      moderate: 1,
      total: 3,
    });
    expect(report!.advisories[0]).toEqual({
      fixAvailability: "major",
      isDirect: false,
      name: "minimist",
      range: "<1.2.6",
      severity: "critical",
      title: "Prototype Pollution in minimist",
      url: "https://github.com/advisories/GHSA-xvch-5gv4-984h",
    });
    // fixAvailable: true → patch; false → none.
    expect(report!.advisories[1]!.fixAvailability).toBe("patch");
    expect(report!.advisories[2]).toMatchObject({
      fixAvailability: "none",
      title: null,
      url: null,
    });
  });

  it("parses an empty report as zero advisories, not as absence", () => {
    const report = parseNpmAuditReport({
      auditReportVersion: 2,
      vulnerabilities: {},
    });
    expect(report).not.toBeNull();
    expect(report!.counts.total).toBe(0);
  });

  it.each([
    ["null", null],
    ["a string", "npm audit output"],
    ["version 1", { advisories: {}, auditReportVersion: 1 }],
    ["missing vulnerabilities", { auditReportVersion: 2 }],
    [
      "an unknown severity",
      {
        auditReportVersion: 2,
        vulnerabilities: { x: { fixAvailable: true, severity: "severe", via: [] } },
      },
    ],
  ])("yields null for malformed input (%s) — never a fabricated zero", (_label, input) => {
    expect(parseNpmAuditReport(input)).toBeNull();
  });
});

describe("inspection stays a collector, not a scanner (scope proof)", () => {
  const repoRoot = fileURLToPath(new URL("..", import.meta.url));

  it.each([
    "packages/core/src/inspection/dependency-audit.ts",
    "packages/core/src/inspection/dashboard.ts",
  ])("%s imports no filesystem, process, or network capability", (file) => {
    const source = readFileSync(`${repoRoot}/${file}`, "utf8");
    for (const forbidden of [
      "node:fs",
      "node:child_process",
      "child_process",
      "execSync",
      "spawn(",
      "node:https",
      "node:http",
      "fetch(",
    ]) {
      expect(source, `${file} must not contain ${forbidden}`).not.toContain(
        forbidden,
      );
    }
  });
});
