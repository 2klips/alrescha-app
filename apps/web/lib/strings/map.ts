/**
 * Copy for the authenticated workspace graph (`/app/map`, Phase 3 Wave A).
 *
 * `/map` stays the demo dashboard and keeps `DASHBOARD`; this module owns the
 * real-data surface: the stored-graph header, honest counts, the empty state
 * that routes to GitHub connect, and the live agent-activity feed.
 */

export const WORKSPACE_MAP = {
  ariaMain: "내 워크스페이스 지식 Graph",
  title: "지식 Graph",
  backToWorkspace: "워크스페이스로",

  repoKicker: "연결된 레포",
  noRepo: "연결된 레포 없음",
  commitKicker: "마지막 스캔 commit",
  noScanYet: "스캔 전",

  counts: {
    aria: "저장된 Graph 요약",
    artifacts: "아티팩트",
    rationales: "근거 노트",
    requirements: "요구사항",
    edges: "엣지",
    openFindings: "미해소 Findings",
  },

  empty: {
    title: "이 워크스페이스에는 아직 Graph가 없습니다",
    body: "GitHub 레포를 연결하면 commit마다 스캔이 문서·심볼·근거 노트를 이 화면에 그립니다. 원본 코드는 저장되지 않습니다 — Graph는 메타데이터만 담습니다.",
    connect: "GitHub 레포 연결",
  },

  inspector: {
    kicker: "선택한 노드",
    aria: "선택한 노드 상세",
    empty: "노드를 선택하면 연결과 출처를 볼 수 있습니다.",
    neighborsTitle: "연결된 노드",
    neighborsEmpty: "연결된 노드가 없습니다.",
    /** `미해소 Findings <n>건` */
    findingCount: (count: number) => `미해소 Findings ${count}건`,
  },

  activity: {
    title: "에이전트 활동",
    live: "Live",
    aria: "MCP 접근 기록",
    empty:
      "아직 기록된 MCP 접근이 없습니다. 토큰을 발급하면 에이전트의 조회가 여기에 나타나고, 조회된 노드가 Graph에서 빛납니다.",
    manageTokens: "MCP 토큰 관리",
  },
} as const;
