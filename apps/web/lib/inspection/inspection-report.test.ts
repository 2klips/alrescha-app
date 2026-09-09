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
/** The blob a stored summary was computed from, when it is current. */
const BLOB = "c".repeat(40);

describe("artifactSummary", () => {
  it("reads the judgment job's merged summary", () => {
    expect(
      artifactSummary(
        { summary: "인증 흐름 요약", summaryBlobSha: BLOB },
        BLOB,
      ),
    ).toBe("인증 흐름 요약");
  });

  it.each([
    ["null metadata", null],
    ["no summary key", { symbolEngine: "typescript-ast" }],
    ["summary is not text", { summary: 42 }],
    ["summary is blank", { summary: "   " }],
  ])("yields null for %s", (_label, metadata) => {
    expect(artifactSummary(metadata, BLOB)).toBeNull();
  });

  /**
   * Codex remedy P0-A. `artifacts.metadata` merges on rescan, so prose
   * written for an older blob is still in the row after a new one lands.
   * The screen calls it a document's description, so it may only show prose
   * whose digest matches the blob the scanner last saw.
   */
  it("shows prose only while it still describes the current blob", () => {
    const metadata = { summary: "현행 스펙", summaryBlobSha: BLOB };
    expect(artifactSummary(metadata, BLOB)).toBe("현행 스펙");
    expect(artifactSummary(metadata, OLD)).toBeNull();
    // Two absent digests are not a match: a legacy summary with no cache
    // key would otherwise read as fresh forever.
    expect(artifactSummary({ summary: "옛 산문" }, null)).toBeNull();
    expect(artifactSummary({ summary: "옛 산문" }, BLOB)).toBeNull();
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
      exported_symbols: [],
      kind: "spec",
      last_seen_commit_sha: "a".repeat(40),
      path: "spec/WORK_SPEC.md",
      source_blob_sha: BLOB,
      summary: "현행 스펙",
      summary_blob_sha: BLOB,
    });
    expect(artifactSummary(row.metadata, row.source_blob_sha)).toBe(
      "현행 스펙",
    );
  });

  it("keeps a non-string summary rejected, matching the full-object path", () => {
    const row = artifactRowFromQuery({
      exported_symbols: [],
      kind: "adr",
      last_seen_commit_sha: null,
      path: "docs/adr/ADR-001.md",
      source_blob_sha: BLOB,
      summary: 42,
      summary_blob_sha: BLOB,
    });
    expect(artifactSummary(row.metadata, row.source_blob_sha)).toBeNull();
  });

  it("treats an absent summary key (SQL NULL) as no summary", () => {
    const row = artifactRowFromQuery({
      exported_symbols: [],
      kind: "adr",
      last_seen_commit_sha: null,
      path: "docs/adr/ADR-001.md",
      source_blob_sha: BLOB,
      summary: null,
      summary_blob_sha: null,
    });
    expect(artifactSummary(row.metadata, row.source_blob_sha)).toBeNull();
  });

  it("carries the digests the freshness rule needs", () => {
    const row = artifactRowFromQuery({
      exported_symbols: [],
      kind: "spec",
      last_seen_commit_sha: null,
      path: "spec/WORK_SPEC.md",
      source_blob_sha: OLD,
      summary: "옛 산문",
      summary_blob_sha: BLOB,
    });
    expect(row.source_blob_sha).toBe(OLD);
    expect(artifactSummary(row.metadata, row.source_blob_sha)).toBeNull();
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
          metadata: { summary: "현행 스펙", summaryBlobSha: BLOB },
          path: "spec/WORK_SPEC.md",
          source_blob_sha: BLOB,
        },
        {
          kind: "adr",
          last_seen_commit_sha: OLD,
          // Prose from a blob this document has moved past: the entry still
          // appears, with no summary rather than last week's (P0-A).
          metadata: { summary: "옛 결정", summaryBlobSha: OLD },
          path: "docs/adr/ADR-001.md",
          source_blob_sha: BLOB,
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
    const stale = dashboard.documents.entries.find(
      ({ path }) => path === "docs/adr/ADR-001.md",
    );
    expect(stale).toBeDefined();
    expect(stale?.summary).toBeNull();
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

/**
 * The detail the analysis already stored (Phase 4 Wave D todo 19 ⑶).
 *
 * `findings.provenance` has carried `{reason, spans, suggestedAction,
 * evidenceLinks}` since the analyze job first ran, and this screen read a
 * title and a severity — enough to know something is wrong and not enough to
 * do anything about it.
 */
describe("finding detail", () => {
  const finding = {
    confidence: "0.62",
    evidence_grade: "inferred",
    id: "finding-1",
    kind: "stale-doc",
    provenance: {
      evidenceLinks: ["node-a", 7, "node-b"],
      reason: "deterministic stale-doc rule",
      spans: [
        { endLine: 12, path: "spec/auth.md", startLine: 9 },
        { path: "spec/auth.md" },
      ],
      suggestedAction: "문서를 다시 읽고 갱신하세요",
    },
    severity: "medium",
    status: "open",
    title: "문서가 코드보다 오래됐습니다",
  };

  it("carries the path, the line, the confidence and the recommendation", () => {
    const dashboard = buildWorkspaceInspectionDashboard({
      ...EMPTY,
      findings: [finding],
    });

    expect(dashboard.findings.entries[0]?.detail).toEqual({
      confidence: 0.62,
      evidenceGrade: "inferred",
      // A non-string link is dropped; the two real ones survive.
      evidenceLinks: ["node-a", "node-b"],
      reason: "deterministic stale-doc rule",
      // A span with no lines is dropped, and the complete one is kept —
      // field by field, so a malformed part never costs the whole finding.
      spans: [{ endLine: 12, path: "spec/auth.md", startLine: 9 }],
      suggestedAction: "문서를 다시 읽고 갱신하세요",
    });
  });

  it("still describes a finding whose provenance is the older shape", () => {
    const dashboard = buildWorkspaceInspectionDashboard({
      ...EMPTY,
      findings: [{ ...finding, provenance: { reason: "old shape" } }],
    });

    expect(dashboard.findings.entries[0]?.detail).toMatchObject({
      evidenceLinks: [],
      reason: "old shape",
      spans: [],
      suggestedAction: null,
    });
  });

  /**
   * A grade is a claim about execution evidence. A row whose grade is
   * missing or malformed does not get the benefit of the doubt (ADR-001).
   */
  it("reads anything but the stored word `verified` as inferred", () => {
    const dashboard = buildWorkspaceInspectionDashboard({
      ...EMPTY,
      findings: [
        { ...finding, evidence_grade: "VERIFIED", id: "a" },
        { ...finding, evidence_grade: null, id: "b" },
        { ...finding, evidence_grade: "verified", id: "c" },
      ],
    });

    expect(
      dashboard.findings.entries.map(({ detail }) => detail?.evidenceGrade),
    ).toEqual(["inferred", "inferred", "verified"]);
  });

  /** todo 19 ⑷: why it left the board, on the board. */
  it("carries a dismissal's reason and nothing when there is none", () => {
    const dashboard = buildWorkspaceInspectionDashboard({
      ...EMPTY,
      findings: [
        {
          ...finding,
          dismissed_reason: "설계상 의도된 차이",
          id: "dismissed",
          status: "dismissed",
        },
        { ...finding, id: "open" },
      ],
    });

    // A dismissal leaves the open list and joins its own, so the decision
    // stays reviewable instead of looking like a deletion.
    expect(dashboard.findings.entries.map(({ id }) => id)).toEqual(["open"]);
    expect(dashboard.dismissed.entries).toHaveLength(1);
    expect(dashboard.dismissed.entries[0]?.dismissedReason).toBe(
      "설계상 의도된 차이",
    );
    expect(dashboard.dismissed.state).toBe("ok");
  });
});
