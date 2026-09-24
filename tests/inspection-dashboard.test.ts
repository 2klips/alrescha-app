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
    // A real stale-doc finding names the *referenced* file in its title
    // and the *document that drifted* in its span. Freshness reads the span
    // (todo 21); before that it matched the title, which is about a
    // different file, so drift-suspected never appeared in production.
    detail: {
      confidence: 0.98,
      evidenceGrade: "inferred" as const,
      evidenceLinks: [],
      reason: "deterministic stale-doc rule",
      spans: [{ endLine: 4, path: "docs/auth.md", startLine: 4 }],
      suggestedAction: "Update or remove the stale path and symbol reference.",
    },
    id: "f-stale",
    kind: "stale-doc",
    severity: "medium",
    status: "open",
    title: "The documented src/auth.ts source reference does not exist.",
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

  it("puts the newest ruled-out attempt first by instant, not by collation", () => {
    // PostgREST writes timestamptz with trailing fractional zeros trimmed and
    // no fraction at all at zero microseconds; a collating compare ranks `.`
    // before `+` and read `…:56+00:00` as later than `…:56.5+00:00`. A zone
    // with daylight time writes the fall-back hour with two offsets, which
    // text order reads backwards. The later attempt's id sorts last and each
    // pair is read in both orders, so neither can supply the answer.
    const attempt = (id: string, recordedAt: string) => ({
      hypothesis: "재시도 횟수를 늘리면 해결된다",
      id,
      outcome: "배제",
      recordedAt,
      refs: [],
    });
    const newestFirst = (earlier: string, later: string) => {
      const attempts = [attempt("r-a", earlier), attempt("r-b", later)];
      return [attempts, [...attempts].reverse()].map((ruledOutAttempts) =>
        build({ ruledOutAttempts }).ruledOut.entries.map(({ id }) => id),
      );
    };

    expect(
      newestFirst("2026-09-24T03:12:56+00:00", "2026-09-24T03:12:56.5+00:00"),
    ).toEqual([
      ["r-b", "r-a"],
      ["r-b", "r-a"],
    ]);
    expect(
      newestFirst("2026-11-01T01:30:00-04:00", "2026-11-01T01:10:00-05:00"),
    ).toEqual([
      ["r-b", "r-a"],
      ["r-b", "r-a"],
    ]);
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

/**
 * The two widgets todo 21 fixed (Phase 4 Wave D).
 *
 * `drift-suspected` matched a finding's title against a document's path, and
 * a stale-doc title names the file the document *references*, not the
 * document itself — so the state existed and never appeared. And the loader
 * drops a finding whose kind the contract does not list, which silently
 * discarded every `untested-code` finding since the rule shipped.
 */
describe("buildInspectionDashboard — drift and the risk widget", () => {
  const drifted = {
    detail: {
      confidence: 0.98,
      evidenceGrade: "inferred" as const,
      evidenceLinks: [],
      reason: "deterministic stale-doc rule",
      spans: [{ endLine: 4, path: "docs/auth.md", startLine: 4 }],
      suggestedAction: "Update or remove the stale path and symbol reference.",
    },
    id: "f-stale",
    kind: "stale-doc" as const,
    severity: "medium" as const,
    status: "open" as const,
    title: "The documented src/auth.ts source reference does not exist.",
  };

  it("names the drifted document from the finding's span, not its title", () => {
    const dashboard = build({
      documents: [
        { lastSeenCommitSha: HEAD, path: "docs/auth.md", summary: null },
        { lastSeenCommitSha: HEAD, path: "src/auth.ts", summary: null },
      ],
      findings: [drifted],
      headCommitSha: HEAD,
    });
    const byPath = Object.fromEntries(
      dashboard.documents.entries.map((entry) => [entry.path, entry.freshness]),
    );

    // The document the rule fired on drifts; the file its title names does
    // not — the title is about the reference that went missing.
    expect(byPath["docs/auth.md"]).toBe("drift-suspected");
    expect(byPath["src/auth.ts"]).toBe("current");
  });

  it("does not call a document drifted because a title mentions it", () => {
    const dashboard = build({
      documents: [
        { lastSeenCommitSha: HEAD, path: "docs/auth.md", summary: null },
      ],
      findings: [{ ...drifted, detail: { ...drifted.detail, spans: [] } }],
      headCommitSha: HEAD,
    });

    // Without a span there is no statement about which document drifted, and
    // guessing from a string match is what made this state meaningless.
    expect(dashboard.documents.entries[0]?.freshness).toBe("current");
  });

  it("keeps an untested-code finding instead of dropping it", () => {
    const dashboard = build({
      findings: [
        {
          id: "f-untested",
          kind: "untested-code",
          severity: "medium",
          status: "open",
          title: "recordAudit has no test",
        },
      ],
    });

    expect(dashboard.findings.entries.map(({ id }) => id)).toEqual([
      "f-untested",
    ]);
  });

  it("reports an absent risk map as insufficient evidence, not as safety", () => {
    const dashboard = build({});

    expect(dashboard.risk).toMatchObject({
      entries: [],
      state: "insufficient-evidence",
      unmeasured: [],
    });
  });

  it("carries the risk map the caller built, riskiest first", () => {
    const dashboard = build({
      riskMap: {
        entries: [
          {
            factors: [
              {
                detail: "2 open findings anchored here",
                kind: "open-finding",
                weight: 2,
              },
            ],
            grade: "inferred",
            level: "moderate",
            nodeId: "node:src/a.ts",
            path: "src/a.ts",
            score: 2,
          },
        ],
        unmeasured: [
          { reason: "no coverage report has been read", signal: "coverage" },
        ],
      },
    });

    expect(dashboard.risk.state).toBe("ok");
    expect(dashboard.risk.entries[0]?.path).toBe("src/a.ts");
    expect(dashboard.risk.unmeasured[0]?.signal).toBe("coverage");
    // The source label names the signals, so a reader can tell what the
    // ranking is made of without opening the builder.
    expect(dashboard.risk.sourceLabel).toMatch(/fan-in/);
  });
});
