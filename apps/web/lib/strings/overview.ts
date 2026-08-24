/**
 * Copy for the four-zone overview dashboard (Phase 2D Wave 1).
 * The screen's job is orientation: each zone says what it is in one plain
 * sentence and links to the full screen that owns the data.
 */

export const OVERVIEW = {
  kicker: "한눈에 보기",
  title: "프로젝트 대시보드",
  lead: "레포의 지식그래프를 중심으로 할 일·에이전트 기록·Data Brain을 한 화면에서 봅니다.",

  kpi: {
    ariaLabel: "핵심 지표",
    unresolved: "미해소 문제",
    implementation: "구현 커버리지",
    tests: "테스트 커버리지",
    lastAnalysis: "마지막 분석",
    lastAnalysisNone: "기록 없음",
  },

  graph: {
    title: "지식그래프",
    lead: "문서·요구사항·코드·테스트가 하나의 살아있는 그래프로 연결됩니다.",
    open: "전체 그래프 열기",
    /** `노드 <n>개 · 연결 <m>개` */
    summary: (nodes: number, edges: number) =>
      `노드 ${nodes}개 · 연결 ${edges}개`,
    legend: {
      requirement: "요구사항",
      document: "문서",
      code: "코드",
      test: "테스트",
      concept: "개념",
    },
  },

  todos: {
    title: "할 일 목록",
    lead: "TODO·계획 문서에서 읽어온 작업 상태입니다.",
    open: "진행 보드 열기",
    empty: "읽어온 할 일이 없습니다.",
    statuses: {
      open: "대기",
      "in-progress": "진행 중",
      done: "완료",
      blocked: "차단됨",
    },
  },

  agent: {
    title: "에이전트 기록",
    lead: "에이전트가 Data Brain을 조회한 최근 기록입니다.",
    open: "전체 기록 보기",
    empty: "아직 기록이 없습니다.",
  },

  brain: {
    title: "Data Brain",
    lead: "저장된 지식을 영역별로 나눠 보여줍니다.",
    open: "노드 탐색 열기",
    areas: {
      frontend: "프론트엔드",
      backend: "백엔드",
      docs: "문서",
      tests: "테스트",
    },
    /** `<n>개 노드` */
    count: (count: number) => `${count}개 노드`,
    gradeTitle: "증거 등급 분포",
  },
} as const;
