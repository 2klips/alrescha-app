import { describe, expect, it } from "vitest";

import {
  artifactRowFromQuery,
  artifactSummary,
  buildWorkspaceInspectionDashboard,
  type WorkspaceInspectionRows,
} from "./inspection-report";

/** Phase 2C todo 1 — the row→dashboard builder behind `/inspection`. */

const EMPTY: WorkspaceInspectionRows = {
  artifacts: [],
  dependencyAuditJson: null,
  findings: [],
  headCommitSha: null,
  ruledOut: [],
  todos: [],
};

const HEAD = "a".repeat(40);
const OLD = "b".repeat(40);

describe("artifactSummary", () => {
  it("reads the judgment job's merged summary", () => {
    expect(artifactSummary({ summary: "인증 흐름 요약" })).toBe(
      "인증 흐름 요약",
    );
  });

  it.each([
    ["null metadata", null],
    ["no summary key", { symbolEngine: "typescript-ast" }],
    ["summary is not text", { summary: 42 }],
    ["summary is blank", { summary: "   " }],
  ])("yields null for %s", (_label, metadata) => {
    expect(artifactSummary(metadata)).toBeNull();
  });
});

describe("artifactRowFromQuery", () => {
  /**
   * QW-9: the artifacts query now projects `metadata->summary` (a single
   * jsonb value, preserving its native type) instead of the whole,
   * unbounded `metadata` blob. This proves that re-wrapping keeps
   * `artifactSummary` behaving exactly as it did against the full object.
   */
  it("re-wraps the projected summary so artifactSummary still reads it", () => {
    const row = artifactRowFromQuery({
      kind: "spec",
      last_seen_commit_sha: "a".repeat(40),
      path: "spec/WORK_SPEC.md",
      summary: "현행 스펙",
    });
    expect(artifactSummary(row.metadata)).toBe("현행 스펙");
  });

  it("keeps a non-string summary rejected, matching the full-object path", () => {
    const row = artifactRowFromQuery({
      kind: "adr",
      last_seen_commit_sha: null,
      path: "docs/adr/ADR-001.md",
      summary: 42,
    });
    expect(artifactSummary(row.metadata)).toBeNull();
  });

  it("treats an absent summary key (SQL NULL) as no summary", () => {
    const row = artifactRowFromQuery({
      kind: "adr",
      last_seen_commit_sha: null,
      path: "docs/adr/ADR-001.md",
      summary: null,
    });
    expect(artifactSummary(row.metadata)).toBeNull();
  });
});

describe("workspace inspection dashboard", () => {
  it("an empty workspace reports absent evidence, never demo data", () => {
    const dashboard = buildWorkspaceInspectionDashboard(EMPTY);
    for (const section of [
      dashboard.dependencyAudit,
      dashboard.documents,
      dashboard.driftRisks,
      dashboard.findings,
      dashboard.progress,
      dashboard.ruledOut,
    ]) {
      expect(section.state).toBe("insufficient-evidence");
    }
    expect(dashboard.progress.percent).toBeNull();
  });

  it("counts open findings by severity and separates drift risks", () => {
    const dashboard = buildWorkspaceInspectionDashboard({
      ...EMPTY,
      findings: [
        {
          id: "f1",
          kind: "stale-doc",
          severity: "high",
          status: "open",
          title: "낡은 문서",
        },
        {
          id: "f2",
          kind: "missing-test",
          severity: "critical",
          status: "open",
          title: "테스트 없음",
        },
        {
          id: "f3",
          kind: "missing-test",
          severity: "low",
          status: "resolved",
          title: "해소됨",
        },
      ],
    });
    expect(dashboard.findings.openBySeverity).toMatchObject({
      critical: 1,
      high: 1,
    });
    expect(dashboard.driftRisks.entries.map(({ id }) => id)).toEqual(["f1"]);
  });

  it("drops a row the contract does not know rather than coercing it", () => {
    const dashboard = buildWorkspaceInspectionDashboard({
      ...EMPTY,
      findings: [
        {
          id: "bad",
          kind: "not-a-kind",
          severity: "high",
          status: "open",
          title: "정체불명",
        },
      ],
    });
    expect(dashboard.findings.entries).toEqual([]);
    expect(dashboard.findings.state).toBe("insufficient-evidence");
  });

  it("labels document freshness against the head commit and keeps summaries inferred", () => {
    const dashboard = buildWorkspaceInspectionDashboard({
      ...EMPTY,
      artifacts: [
        {
          kind: "spec",
          last_seen_commit_sha: HEAD,
          metadata: { summary: "현행 스펙" },
          path: "spec/WORK_SPEC.md",
        },
        {
          kind: "adr",
          last_seen_commit_sha: OLD,
          metadata: {},
          path: "docs/adr/ADR-001.md",
        },
        // Code is not documentation — it must not reach this widget.
        {
          kind: "code_metadata",
          last_seen_commit_sha: HEAD,
          metadata: {},
          path: "packages/core/src/index.ts",
        },
      ],
      headCommitSha: HEAD,
    });
    expect(dashboard.documents.entries.map(({ path }) => path)).toEqual([
      "docs/adr/ADR-001.md",
      "spec/WORK_SPEC.md",
    ]);
    const current = dashboard.documents.entries.find(
      ({ path }) => path === "spec/WORK_SPEC.md",
    );
    expect(current?.freshness).toBe("current");
    expect(current?.summary).toEqual({ grade: "inferred", text: "현행 스펙" });
  });

  it("distinguishes 'no todos stored' from '0 of 0 done'", () => {
    expect(buildWorkspaceInspectionDashboard(EMPTY).progress.state).toBe(
      "insufficient-evidence",
    );
    const measured = buildWorkspaceInspectionDashboard({
      ...EMPTY,
      todos: [{ status: "done" }, { status: "open" }, { status: "blocked" }],
    });
    expect(measured.progress).toMatchObject({ done: 1, percent: 33, total: 3 });
  });

  it("passes the uploaded audit through the parser, not a scanner", () => {
    const dashboard = buildWorkspaceInspectionDashboard({
      ...EMPTY,
      dependencyAuditJson: {
        auditReportVersion: 2,
        vulnerabilities: {
          lodash: {
            fixAvailable: true,
            isDirect: true,
            name: "lodash",
            range: "<4.17.21",
            severity: "high",
            via: [
              {
                name: "lodash",
                severity: "high",
                title: "Prototype pollution",
              },
            ],
          },
        },
      },
    });
    expect(dashboard.dependencyAudit.state).not.toBe("insufficient-evidence");
    expect(dashboard.dependencyAudit.report?.advisories ?? []).toHaveLength(1);
  });

  it("carries ruled-out attempts through with their refs", () => {
    const dashboard = buildWorkspaceInspectionDashboard({
      ...EMPTY,
      ruledOut: [
        {
          hypothesis: "웹훅 서명",
          id: "r1",
          outcome: "재현 안 됨",
          recorded_at: "2026-08-18T00:00:00.000Z",
          refs: null,
        },
      ],
    });
    expect(dashboard.ruledOut.entries[0]).toMatchObject({
      hypothesis: "웹훅 서명",
      refs: [],
    });
  });
});
