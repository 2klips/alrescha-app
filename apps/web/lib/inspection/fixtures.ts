import {
  buildInspectionDashboard,
  type InspectionDashboard,
} from "@alrescha/core";

export type DemoInspectionState = "busy" | "empty";

const HEAD = "bad0551f2c9e04a7d1b3a6c8e5f90214d7a8b3c1";
const OLD = "e9101b5a7d3f28c4b6e0912f5a8c7d3e1b4f6a20";

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
      ruledOutAttempts: [],
      todos: null,
    });
  }

  return buildInspectionDashboard({
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
              source: 1096820,
              title: "Command Injection in lodash",
              url: "https://github.com/advisories/GHSA-35jh-r3h4-6jhm",
            },
          ],
        },
        minimist: {
          fixAvailable: {
            isSemVerMajor: true,
            name: "mkdirp",
            version: "3.0.0",
          },
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
    },
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
