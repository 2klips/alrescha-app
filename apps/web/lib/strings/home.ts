/**
 * Copy for the authenticated workspace home `/app` (Phase 3 Wave E todo 13).
 * The screen is the onboarding spine: 레포 연결 → 그래프 생성 → 첫 그래프 뷰
 * + MCP 토큰 발급 — one thread, graph-centric.
 * Tone: 제품 카피는 간결한 평서형, 버튼은 명사형.
 */

export const HOME = {
  ariaMain: "워크스페이스 홈",
  kicker: "내 워크스페이스",
  title: "레포를 연결하면, 살아있는 지식그래프.",
  lead: "코드 구조·문서·요구사항이 하나의 그래프로 연결되고, 에이전트가 MCP로 읽고 기록합니다.",

  journey: {
    aria: "온보딩 여정",
    stepStates: {
      done: "완료",
      active: "다음 할 일",
      pending: "대기",
    },
    connect: {
      title: "레포 연결",
      done: (repo: string) => `${repo} 연결됨`,
      revoked: "GitHub 연결이 끊겼습니다 — 다시 연결하세요.",
      body: "GitHub App을 읽기 전용으로 설치합니다. 코드 원본은 저장하지 않습니다.",
      cta: "GitHub 레포 연결",
    },
    graph: {
      title: "지식그래프 생성",
      body: "푸시마다 구조 엣지(import·호출·공변경)가 자동으로 쌓입니다.",
      scanning: "첫 스캔을 기다리는 중 — 레포에 푸시하면 그래프가 생성됩니다.",
      scanningHint: "진행 상황은 commit 분석에서 확인할 수 있습니다.",
      /** `노드 <n>개 · 연결 <m>개` */
      done: (nodes: number, edges: number) =>
        `노드 ${nodes}개 · 연결 ${edges}개`,
      cta: "그래프 열기",
      progressCta: "commit 분석 보기",
    },
    agent: {
      title: "에이전트 연결",
      body: "MCP 토큰을 발급하면 에이전트가 그래프를 읽고, 알게 된 것을 기록합니다.",
      /** `활성 토큰 <n>개` */
      done: (tokens: number) => `활성 토큰 ${tokens}개`,
      cta: "MCP 토큰 발급",
      manageCta: "토큰 관리",
    },
  },

  graphCard: {
    aria: "지식그래프 요약",
    openMap: "지식그래프 열기",
    lastScan: "마지막 스캔",
    noScan: "아직 스캔 없음",
    counts: {
      nodes: "노드",
      edges: "연결",
      agentNotes: "에이전트 기록",
    },
  },
} as const;
