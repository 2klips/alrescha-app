import { describe, expect, it } from "vitest";

import {
  buildRiskMap,
  parseNpmAuditReport,
  type BuildRiskMapInput,
  type RiskEntry,
} from "../packages/core/src/index";

/**
 * The risk map (Phase 4 Wave D todo 21, risk audit P2).
 *
 * `/app/inspection` could say how many findings are open. It could not answer
 * what somebody opens it to ask — *what should I look at first* — because
 * nothing ranked files against each other.
 *
 * The contract worth protecting is not the arithmetic. It is that every
 * entry states at least one checkable factor, that nothing here claims to be
 * execution evidence, that only `imports` and `calls` propagate risk, and
 * that an unmeasured signal is reported as unmeasured rather than scored as
 * zero.
 */

const NOW = "2026-09-06T12:00:00.000Z";
const daysAgo = (days: number): string =>
  new Date(Date.parse(NOW) - days * 24 * 60 * 60 * 1000).toISOString();

function code(path: string) {
  return { classification: "code_metadata", nodeId: `node:${path}`, path };
}

function input(overrides: Partial<BuildRiskMapInput> = {}): BuildRiskMapInput {
  return {
    artifacts: [],
    edges: [],
    findings: [],
    now: NOW,
    ...overrides,
  };
}

const entryFor = (
  map: { entries: readonly RiskEntry[] },
  path: string,
): RiskEntry | undefined => map.entries.find((entry) => entry.path === path);

describe("the risk map", () => {
  /**
   * The contract, stated once: no entry without a reason, no reason without
   * a sentence, and no claim of execution evidence.
   */
  it("gives every entry at least one factor, each with a checkable detail", () => {
    const map = buildRiskMap(
      input({
        artifacts: [code("src/a.ts"), code("src/b.ts")],
        edges: [
          {
            relation: "imports",
            sourcePath: "src/b.ts",
            targetPath: "src/a.ts",
          },
          { relation: "tests", sourcePath: "t", targetPath: "src/b.ts" },
        ],
        findings: [
          {
            kind: "stale-doc",
            sourcePath: "src/a.ts",
            status: "open",
            targetPath: null,
          },
        ],
      }),
    );

    expect(map.entries.length).toBeGreaterThan(0);
    for (const entry of map.entries) {
      expect(entry.factors.length).toBeGreaterThan(0);
      expect(entry.grade).toBe("inferred");
      expect(entry.score).toBeGreaterThan(0);
      for (const factor of entry.factors) {
        expect(factor.detail.trim().length).toBeGreaterThan(0);
        expect(factor.weight).toBeGreaterThan(0);
      }
    }
  });

  it("leaves a file with nothing against it off the list entirely", () => {
    const map = buildRiskMap(
      input({
        artifacts: [code("src/a.ts")],
        coverage: ["src/a.ts"],
        edges: [{ relation: "tests", sourcePath: "t", targetPath: "src/a.ts" }],
      }),
    );

    // Not a zero-score entry: a file with no factor is not on a list of
    // things to look at.
    expect(map.entries).toEqual([]);
  });

  it("counts open findings from either end and ignores closed ones", () => {
    const map = buildRiskMap(
      input({
        artifacts: [code("src/a.ts")],
        findings: [
          {
            kind: "stale-doc",
            sourcePath: "docs/a.md",
            status: "open",
            targetPath: "src/a.ts",
          },
          {
            kind: "untested-code",
            sourcePath: "src/a.ts",
            status: "open",
            targetPath: null,
          },
          {
            kind: "orphan-doc",
            sourcePath: "src/a.ts",
            status: "dismissed",
            targetPath: null,
          },
          {
            kind: "orphan-doc",
            sourcePath: "src/a.ts",
            status: "resolved",
            targetPath: null,
          },
        ],
      }),
    );

    const factor = entryFor(map, "src/a.ts")?.factors.find(
      ({ kind }) => kind === "open-finding",
    );
    // Two open, and the dismissed and resolved ones do not count — a
    // decision somebody made is not a risk signal.
    expect(factor?.detail).toBe("2 open findings anchored here");
    expect(factor?.weight).toBe(2);
  });

  /**
   * 보완 R-03. A folder containing a file, a README naming it and a
   * similarity edge are all real edges, and none of them means "editing this
   * breaks that".
   */
  it("propagates fan-in through imports and calls and nothing else", () => {
    const map = buildRiskMap(
      input({
        artifacts: [
          code("src/hub.ts"),
          code("src/one.ts"),
          code("docs/x.md"),
          code("src/dir.ts"),
        ],
        edges: [
          {
            relation: "imports",
            sourcePath: "src/one.ts",
            targetPath: "src/hub.ts",
          },
          // Not dependency channels:
          {
            relation: "references",
            sourcePath: "docs/x.md",
            targetPath: "src/dir.ts",
          },
          {
            relation: "contains",
            sourcePath: "docs/x.md",
            targetPath: "src/dir.ts",
          },
        ],
      }),
    );

    expect(
      entryFor(map, "src/hub.ts")?.factors.map(({ kind }) => kind),
    ).toContain("fan-in");
    // `src/dir.ts` is on the list for being untested, and for nothing else.
    expect(
      entryFor(map, "src/dir.ts")?.factors.map(({ kind }) => kind),
    ).toEqual(["untested"]);
  });

  it("ranks a widely depended-upon file above a leaf with the same raw count", () => {
    const map = buildRiskMap(
      input({
        artifacts: [
          code("src/core.ts"),
          code("src/leaf.ts"),
          code("src/a.ts"),
          code("src/b.ts"),
        ],
        edges: [
          // Everything reaches core; only `a` reaches leaf.
          {
            relation: "imports",
            sourcePath: "src/a.ts",
            targetPath: "src/core.ts",
          },
          {
            relation: "imports",
            sourcePath: "src/b.ts",
            targetPath: "src/core.ts",
          },
          {
            relation: "imports",
            sourcePath: "src/leaf.ts",
            targetPath: "src/core.ts",
          },
          {
            relation: "imports",
            sourcePath: "src/a.ts",
            targetPath: "src/leaf.ts",
          },
        ],
      }),
    );

    const core = entryFor(map, "src/core.ts");
    const leaf = entryFor(map, "src/leaf.ts");
    expect(core?.score).toBeGreaterThan(leaf?.score ?? 0);
    // The detail is the count, because that is what a reader can check.
    expect(core?.factors.find(({ kind }) => kind === "fan-in")?.detail).toBe(
      "3 files import or call this file",
    );
  });

  /**
   * The first consumer of todo 18's coverage rows. A file a coverage report
   * executed is not "untested" just because the scan derived no `tests`
   * edge from its imports.
   */
  it("uses coverage to tell untested from unmeasured", () => {
    const withoutCoverage = buildRiskMap(
      input({ artifacts: [code("src/a.ts")] }),
    );
    expect(entryFor(withoutCoverage, "src/a.ts")?.factors[0]?.detail).toMatch(
      /no coverage report has been read/,
    );
    expect(withoutCoverage.unmeasured.map(({ signal }) => signal)).toContain(
      "coverage",
    );

    const covered = buildRiskMap(
      input({ artifacts: [code("src/a.ts")], coverage: ["src/a.ts"] }),
    );
    // Measured and executed: nothing against it, so it is not on the list.
    expect(covered.entries).toEqual([]);
    expect(covered.unmeasured.map(({ signal }) => signal)).not.toContain(
      "coverage",
    );

    const measuredAndMissed = buildRiskMap(
      input({ artifacts: [code("src/a.ts")], coverage: ["src/b.ts"] }),
    );
    // A report ran and did not execute this file — a stronger statement
    // than "nobody looked", and the sentence says which.
    expect(entryFor(measuredAndMissed, "src/a.ts")?.factors[0]?.detail).toMatch(
      /no coverage report executed it/,
    );
  });

  it("reports an unmeasured signal instead of scoring it as zero", () => {
    const map = buildRiskMap(input({ artifacts: [code("src/a.ts")] }));

    expect(map.unmeasured.map(({ signal }) => signal).sort()).toEqual([
      "coverage",
      "dependency-audit",
    ]);
    for (const entry of map.unmeasured) {
      expect(entry.reason).toMatch(/unknown rather than/);
    }
  });

  it("decays a co-change that stopped happening", () => {
    const recent = buildRiskMap(
      input({
        artifacts: [code("src/a.ts"), code("src/b.ts")],
        coChanges: [
          {
            changeCount: 10,
            observedAt: daysAgo(1),
            pathA: "src/a.ts",
            pathB: "src/b.ts",
          },
        ],
      }),
    );
    const old = buildRiskMap(
      input({
        artifacts: [code("src/a.ts"), code("src/b.ts")],
        coChanges: [
          {
            changeCount: 10,
            observedAt: daysAgo(720),
            pathA: "src/a.ts",
            pathB: "src/b.ts",
          },
        ],
      }),
    );

    const recentWeight = entryFor(recent, "src/a.ts")?.factors.find(
      ({ kind }) => kind === "co-changed",
    )?.weight;
    const oldWeight = entryFor(old, "src/a.ts")?.factors.find(
      ({ kind }) => kind === "co-changed",
    )?.weight;
    expect(recentWeight).toBeGreaterThan(0);
    // Two years and eight half-lives later the pair is history, not coupling.
    expect(oldWeight ?? 0).toBeLessThan(0.01);
  });

  it("puts an advisory on the manifest that declares the dependency", () => {
    const audit = parseNpmAuditReport({
      auditReportVersion: 2,
      vulnerabilities: {
        lodash: {
          name: "lodash",
          severity: "high",
          via: [{ title: "Prototype pollution", url: "https://example.test" }],
        },
      },
    });
    const map = buildRiskMap(
      input({
        artifacts: [
          {
            classification: "config",
            nodeId: "node:pkg",
            path: "package.json",
          },
          code("src/a.ts"),
        ],
        coverage: ["src/a.ts"],
        dependencyAudit: audit,
        edges: [{ relation: "tests", sourcePath: "t", targetPath: "src/a.ts" }],
      }),
    );

    // An advisory names a package, not a file; the manifest is the file
    // somebody would open.
    expect(entryFor(map, "package.json")?.factors[0]).toMatchObject({
      kind: "dependency-audit",
    });
    expect(entryFor(map, "src/a.ts")).toBeUndefined();
    expect(map.unmeasured.map(({ signal }) => signal)).not.toContain(
      "dependency-audit",
    );
  });

  it("orders riskiest first and breaks ties by path", () => {
    const map = buildRiskMap(
      input({
        artifacts: [code("src/b.ts"), code("src/a.ts"), code("src/hot.ts")],
        findings: [
          {
            kind: "stale-doc",
            sourcePath: "src/hot.ts",
            status: "open",
            targetPath: null,
          },
        ],
      }),
    );

    expect(map.entries.map(({ path }) => path)).toEqual([
      "src/hot.ts",
      "src/a.ts",
      "src/b.ts",
    ]);
    // Deterministic: the same input in a different order is the same map.
    const shuffled = buildRiskMap(
      input({
        artifacts: [code("src/hot.ts"), code("src/b.ts"), code("src/a.ts")],
        findings: [
          {
            kind: "stale-doc",
            sourcePath: "src/hot.ts",
            status: "open",
            targetPath: null,
          },
        ],
      }),
    );
    expect(shuffled).toEqual(map);
  });

  /**
   * The plan's acceptance criterion: a repository with no documentation still
   * produces a ranked list. Risk does not depend on anyone having written
   * prose.
   */
  it("is not empty on a repository with no documents at all", () => {
    const paths = Array.from({ length: 12 }, (_, at) => `src/mod${at}.ts`);
    const map = buildRiskMap(
      input({
        artifacts: paths.map(code),
        edges: paths.slice(1).map((path) => ({
          relation: "imports",
          sourcePath: path,
          targetPath: "src/mod0.ts",
        })),
      }),
    );

    expect(map.entries.length).toBeGreaterThanOrEqual(10);
    expect(map.entries.slice(0, 10).every(({ score }) => score > 0)).toBe(true);
    expect(map.entries[0]?.path).toBe("src/mod0.ts");
    expect(map.entries[0]?.level).not.toBe("low");
  });

  it("never grades anything verified, whatever the score", () => {
    const map = buildRiskMap(
      input({
        artifacts: [code("src/a.ts")],
        findings: Array.from({ length: 20 }, () => ({
          kind: "stale-doc",
          sourcePath: "src/a.ts",
          status: "open",
          targetPath: null,
        })),
      }),
    );

    expect(entryFor(map, "src/a.ts")?.level).toBe("high");
    // A risk map is a place to look, never a verdict (ADR-001).
    expect(map.entries.every(({ grade }) => grade === "inferred")).toBe(true);
  });
});
