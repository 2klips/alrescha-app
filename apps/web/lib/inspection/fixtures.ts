import {
  buildInspectionDashboard,
  buildRiskMap,
  parseNpmAuditReport,
  type InspectionDashboard,
  type RiskMap,
} from "@alrescha/core";

export type DemoInspectionState = "busy" | "empty";

const HEAD = "bad0551f2c9e04a7d1b3a6c8e5f90214d7a8b3c1";
const OLD = "e9101b5a7d3f28c4b6e0912f5a8c7d3e1b4f6a20";

/**
 * The demo's clock. Co-change decays by age, so a demo that read the wall
 * clock would rank its own files differently every week — and the screenshot
 * this route exists to produce would stop matching itself.
 */
const NOW = "2026-08-20T00:00:00.000Z";

/**
 * The audit report the demo shows, shared by two widgets. Passing the same
 * object to both is the point: the risk map claiming a manifest is risky
 * while the audit widget beside it reported nothing would be a screen
 * contradicting itself.
 */
const AUDIT = {
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
          source: 1096820,
          title: "Command Injection in lodash",
          url: "https://github.com/advisories/GHSA-35jh-r3h4-6jhm",
        },
      ],
    },
    minimist: {
      fixAvailable: { isSemVerMajor: true, name: "mkdirp", version: "3.0.0" },
      isDirect: false,
      name: "minimist",
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
  },
};

/**
 * The demo risk map, built by the real builder rather than written out
 * (todo 21). Hand-written entries would be a picture of a screen; these are
 * what `buildRiskMap` actually produces, so a change to the weighting shows
 * up here the same day it ships.
 *
 * The inputs are chosen so every factor appears once: a file two findings
 * anchor on, an untested module, a hub four files import, a co-changing
 * pair, and the manifest the advisories land on. `coverage` stays null —
 * nobody ran one — which is what puts the grey line under the list.
 */
function demoRiskMap(audit: unknown): RiskMap {
  const code = (path: string) => ({
    classification: "code_metadata",
    nodeId: `node-${path}`,
    path,
  });
  return buildRiskMap({
    artifacts: [
      code("apps/web/lib/auth/session.ts"),
      code("apps/web/lib/auth/tokens.ts"),
      code("apps/web/app/api/login/route.ts"),
      code("apps/web/lib/db/client.ts"),
      code("apps/worker/src/queue.ts"),
      code("apps/web/lib/auth/session.test.ts"),
      {
        classification: "config",
        nodeId: "node-package",
        path: "package.json",
      },
      { classification: "doc", nodeId: "node-auth-doc", path: "docs/auth.md" },
    ],
    coChanges: [
      {
        changeCount: 9,
        observedAt: "2026-08-14T00:00:00.000Z",
        pathA: "apps/web/lib/auth/session.ts",
        pathB: "apps/web/app/api/login/route.ts",
      },
      {
        changeCount: 4,
        observedAt: "2026-08-02T00:00:00.000Z",
        pathA: "apps/web/lib/db/client.ts",
        pathB: "apps/worker/src/queue.ts",
      },
    ],
    // Null, not empty: no coverage report has been read for this workspace.
    coverage: null,
    dependencyAudit: parseNpmAuditReport(audit),
    edges: [
      ...["tokens", "db/client"].map((module) => ({
        relation: "imports",
        sourcePath: "apps/web/lib/auth/session.ts",
        targetPath: `apps/web/lib/${module}.ts`,
      })),
      ...[
        "apps/web/app/api/login/route.ts",
        "apps/worker/src/queue.ts",
        "apps/web/lib/auth/session.test.ts",
      ].map((sourcePath) => ({
        relation: "imports",
        sourcePath,
        targetPath: "apps/web/lib/auth/session.ts",
      })),
      {
        relation: "calls",
        sourcePath: "apps/web/app/api/login/route.ts",
        targetPath: "apps/web/lib/auth/tokens.ts",
      },
      // The one file with a test edge, so "테스트 없음" means something.
      {
        relation: "tests",
        sourcePath: "apps/web/lib/auth/session.test.ts",
        targetPath: "apps/web/lib/auth/session.ts",
      },
    ],
    findings: [
      {
        kind: "stale-doc",
        sourcePath: "docs/auth.md",
        status: "open",
        targetPath: "apps/web/lib/auth/tokens.ts",
      },
      {
        kind: "missing-test",
        sourcePath: null,
        status: "open",
        targetPath: "apps/web/lib/auth/tokens.ts",
      },
      // Resolved findings do not rank anything: the map counts what is open.
      {
        kind: "orphan-doc",
        sourcePath: "apps/web/lib/db/client.ts",
        status: "resolved",
        targetPath: null,
      },
    ],
    now: NOW,
  });
}

/**
 * Demo data for the public inspection route. The busy state exercises every
 * widget: measured progress, open findings across severities, all three
 * document freshness labels, an inferred summary, a parsed npm audit report,
 * and a ruled-out history with a deliberately repeated hypothesis.
 */
export function buildDemoInspectionDashboard(
  state: DemoInspectionState,
): InspectionDashboard {
  if (state === "empty") {
    return buildInspectionDashboard({
      dependencyAuditJson: null,
      documents: [],
      findings: [],
      headCommitSha: null,
      // No map at all, not an empty one: nothing has been scanned.
      riskMap: null,
      ruledOutAttempts: [],
      todos: null,
    });
  }

  return buildInspectionDashboard({
    dependencyAuditJson: AUDIT,
    documents: [
      {
        lastSeenCommitSha: HEAD,
        path: "AGENTS.md",
        summary: "에이전트 작업 규칙과 하네스 진입점을 정의합니다.",
      },
      {
        lastSeenCommitSha: HEAD,
        path: "docs/auth.md",
        summary: null,
      },
      {
        lastSeenCommitSha: OLD,
        path: "docs/deploy.md",
        summary: "배포 절차 문서 — 마지막 스캔이 이전 commit입니다.",
      },
    ],
    findings: [
      {
        id: "finding-claim",
        kind: "unproven-claim",
        severity: "high",
        status: "open",
        title: "README의 성능 주장에 실행 증거가 없습니다",
      },
      {
        // The span is what names the drifted document (todo 21). The demo
        // used to lean on the title containing the path, which is how the
        // freshness rule worked and why it never fired on real data — a
        // stale-doc title names the *referenced* file, not the document.
        detail: {
          confidence: 0.98,
          evidenceGrade: "inferred",
          evidenceLinks: [],
          reason: "deterministic stale-doc rule",
          spans: [{ endLine: 12, path: "docs/auth.md", startLine: 12 }],
          suggestedAction: "문서의 경로·심볼 참조를 갱신하거나 지우세요.",
        },
        id: "finding-stale",
        kind: "stale-doc",
        severity: "medium",
        status: "open",
        title: "docs/auth.md가 현재 인증 구현과 어긋납니다",
      },
      {
        id: "finding-test",
        kind: "missing-test",
        severity: "critical",
        status: "open",
        title: "R-07 비밀번호 재설정에 테스트가 없습니다",
      },
      {
        id: "finding-resolved",
        kind: "orphan-doc",
        severity: "low",
        status: "resolved",
        title: "연결이 끊겼던 설계 메모 — 해소됨",
      },
    ],
    headCommitSha: HEAD,
    riskMap: demoRiskMap(AUDIT),
    ruledOutAttempts: [
      {
        hypothesis: "워커 재시도 횟수를 올리면 스캔 실패가 사라진다",
        id: "ruled-1",
        outcome: "배제 — 원인은 lease 만료였고 재시도는 증상만 늦춘다",
        recordedAt: "2026-08-15T09:30:00.000Z",
        refs: ["apps/worker/src/queue.ts"],
      },
      {
        hypothesis: "폰트를 next/font/local로 옮기면 전송량이 준다",
        id: "ruled-2",
        outcome: "배제 — 단일 파일 2.0MB가 강제되어 오히려 7배 커진다 (OQ-002)",
        recordedAt: "2026-08-16T14:00:00.000Z",
        refs: ["spec/OPEN_QUESTIONS.md"],
      },
      {
        hypothesis: "워커 재시도 횟수를 올리면 스캔 실패가 사라진다",
        id: "ruled-3",
        outcome: "재차 배제 — append-only 기록이 반복 시도를 잡아낸 사례",
        recordedAt: "2026-08-17T08:00:00.000Z",
        refs: [],
      },
    ],
    todos: { done: 9, total: 12 },
  });
}
