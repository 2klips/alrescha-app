import { describe, expect, it } from "vitest";

import {
  buildInspectionDashboard,
  type BuildInspectionDashboardInput,
  type InspectionFindingInput,
} from "../packages/core/src/index";

const HEAD = "a".repeat(40);
const OLD = "b".repeat(40);

const FINDINGS: readonly InspectionFindingInput[] = [
  {
    id: "f-claim",
    kind: "unproven-claim",
    severity: "high",
    status: "open",
    title: "성능 주장에 실행 증거가 없습니다",
  },
  {
    id: "f-stale",
    kind: "stale-doc",
    severity: "medium",
    status: "open",
    title: "docs/auth.md가 구현과 어긋납니다",
  },
  {
    id: "f-test",
    kind: "missing-test",
    severity: "critical",
    status: "open",
    title: "결제 요구사항에 테스트가 없습니다",
  },
  {
    id: "f-resolved",
    kind: "stale-doc",
    severity: "low",
    status: "resolved",
    title: "해소된 문서 드리프트",
  },
];

function build(
  overrides: Partial<BuildInspectionDashboardInput>,
): ReturnType<typeof buildInspectionDashboard> {
  return buildInspectionDashboard({
    dependencyAuditJson: null,
    documents: [],
    findings: [],
    headCommitSha: null,
    ruledOutAttempts: [],
    todos: null,
    ...overrides,
  });
}

describe("buildInspectionDashboard", () => {
  it("marks every widget insufficient-evidence when nothing is stored", () => {
    const dashboard = build({});
    for (const section of [
      dashboard.dependencyAudit,
      dashboard.documents,
      dashboard.driftRisks,
      dashboard.findings,
      dashboard.progress,
      dashboard.ruledOut,
    ]) {
      expect(section.state).toBe("insufficient-evidence");
      expect(section.sourceLabel.length).toBeGreaterThan(0);
    }
    expect(dashboard.progress.percent).toBeNull();
  });

  it("counts only open findings, ordered by severity", () => {
    const dashboard = build({ findings: FINDINGS });
    expect(dashboard.findings.entries.map(({ id }) => id)).toEqual([
      "f-test",
      "f-claim",
      "f-stale",
    ]);
    expect(dashboard.findings.openBySeverity).toEqual({
      critical: 1,
      high: 1,
      low: 0,
      medium: 1,
    });
  });

  it("derives drift risk only from drift-shaped finding kinds", () => {
    const dashboard = build({ findings: FINDINGS });
    expect(dashboard.driftRisks.entries.map(({ id }) => id)).toEqual([
      "f-claim",
      "f-stale",
    ]);
  });

  it("labels document freshness against head and stale-doc findings", () => {
    const dashboard = build({
      documents: [
        { lastSeenCommitSha: HEAD, path: "AGENTS.md", summary: null },
        { lastSeenCommitSha: OLD, path: "docs/old.md", summary: null },
        { lastSeenCommitSha: HEAD, path: "docs/auth.md", summary: null },
      ],
      findings: FINDINGS,
      headCommitSha: HEAD,
    });
    const byPath = Object.fromEntries(
      dashboard.documents.entries.map((entry) => [entry.path, entry.freshness]),
    );
    expect(byPath).toEqual({
      "AGENTS.md": "current",
      "docs/auth.md": "drift-suspected",
      "docs/old.md": "outdated",
    });
  });

  it("wraps every document summary as inferred — no exceptions", () => {
    const dashboard = build({
      documents: [
        {
          lastSeenCommitSha: HEAD,
          path: "spec/spec.md",
          summary: "인증 흐름과 크레딧 규칙을 정의하는 스펙.",
        },
        { lastSeenCommitSha: HEAD, path: "TODO.md", summary: null },
      ],
      headCommitSha: HEAD,
    });
    const summarized = dashboard.documents.entries.find(
      ({ path }) => path === "spec/spec.md",
    );
    expect(summarized?.summary).toEqual({
      grade: "inferred",
      text: "인증 흐름과 크레딧 규칙을 정의하는 스펙.",
    });
    expect(
      dashboard.documents.entries.find(({ path }) => path === "TODO.md")
        ?.summary,
    ).toBeNull();
  });

  it("keeps the ruled-out history append-only: repeats survive, newest first", () => {
    const dashboard = build({
      ruledOutAttempts: [
        {
          hypothesis: "재시도 횟수를 늘리면 해결된다",
          id: "r-1",
          outcome: "재현 — 원인은 lease 만료였다",
          recordedAt: "2026-08-15T10:00:00.000Z",
          refs: ["apps/worker/src/queue.ts"],
        },
        {
          hypothesis: "재시도 횟수를 늘리면 해결된다",
          id: "r-2",
          outcome: "다시 시도했지만 같은 이유로 배제",
          recordedAt: "2026-08-16T10:00:00.000Z",
          refs: [],
        },
      ],
    });
    expect(dashboard.ruledOut.entries.map(({ id }) => id)).toEqual([
      "r-2",
      "r-1",
    ]);
    // Both entries with the same hypothesis remain — that is the point.
    expect(dashboard.ruledOut.entries).toHaveLength(2);
  });

  it("treats a zero-total todo board as unmeasured, not as 0%", () => {
    expect(build({ todos: { done: 0, total: 0 } }).progress.percent).toBeNull();
    const measured = build({ todos: { done: 3, total: 4 } }).progress;
    expect(measured.percent).toBe(75);
    expect(measured.state).toBe("ok");
  });

  it("passes the dependency audit through the parser", () => {
    const dashboard = build({
      dependencyAuditJson: {
        auditReportVersion: 2,
        vulnerabilities: {
          lodash: {
            fixAvailable: true,
            isDirect: true,
            name: "lodash",
            range: "<4.17.21",
            severity: "high",
            via: [],
          },
        },
      },
    });
    expect(dashboard.dependencyAudit.state).toBe("ok");
    expect(dashboard.dependencyAudit.report?.counts.high).toBe(1);
    // Malformed upload → insufficient evidence, not zero findings.
    expect(
      build({ dependencyAuditJson: "raw text" }).dependencyAudit.state,
    ).toBe("insufficient-evidence");
  });
});
