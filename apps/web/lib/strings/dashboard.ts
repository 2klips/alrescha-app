/**
 * Copy for the second-brain graph dashboard (WORK_SPEC §5.2-①).
 * Phase 2A todo 3 — Korean-first, conventional English terms kept.
 */

export const DASHBOARD = {
  ariaMain: "Arr 프로젝트 보증 Dashboard",
  ariaRepoRail: "레포 요약",
  ariaMetrics: "보증 지표",
  ariaMetricsMobile: "모바일 보증 지표",
  ariaLegend: "Graph 범례",
  ariaControls: "Graph 제어",
  ariaInspector: "선택한 노드",

  repoKicker: "레포",
  /** 헤더 레포 칩의 브랜치·commit 줄 */
  repoBranchLine: "main · bad0551",
  metricEvidenceKicker: "지표 근거",
  metricEvidenceClose: "근거 닫기",
  title: "프로젝트 증명 맵",
  /** `현재 commit · <sha>` */
  commitKicker: "현재 commit",

  metrics: {
    unresolved: "미해소 Findings",
    implementation: "구현 커버리지",
    tests: "테스트 커버리지",
    tokens: "상시 로드",
  },

  legend: {
    requirement: "요구사항",
    code: "코드",
    test: "verified 테스트",
  },

  search: {
    label: "Graph 검색",
    placeholder: "증명 맵 검색",
  },

  filters: {
    typeLabel: "노드 유형",
    gradeLabel: "증거 등급",
    localFocus: "로컬 포커스",
    types: {
      all: "전체 노드",
      requirement: "요구사항",
      document: "문서",
      code: "코드",
      test: "테스트",
    },
    grades: {
      all: "전체 증거",
      verified: "verified",
      inferred: "inferred",
      broken: "broken",
    },
  },

  /** Obsidian식 힘 파라미터 HUD 카드 (Phase 2A todo 5) */
  forcePanel: {
    title: "Graph 힘",
    aria: "Graph 힘 파라미터",
    expand: "힘 패널 펼치기",
    collapse: "힘 패널 접기",
    reset: "기본값 복원",
    centerStrength: "중앙 인력",
    repelStrength: "반발력",
    linkStrength: "링크 인력",
    linkDistance: "링크 거리",
    textFadeThreshold: "라벨 페이드",
    lodLevels: { far: "원경", mid: "중경", near: "근경" },
    /** `줌 단계 <원경|중경|근경> · 라벨 <n>개` */
    lodStatus: (level: string, labels: number) =>
      `줌 단계 ${level} · 라벨 ${labels}개`,
  },

  ci: {
    present: "CI 증거 · bad0551에서 테스트 78건 verified",
    missing: "이 commit에는 CI 리포트가 없습니다 — 테스트 링크는 inferred로 남습니다.",
  },

  canvasTitle: "요구사항·문서·코드·verified 테스트를 잇는 증거 Graph",

  /** `증거 Graph · 노드 <n>개 표시` */
  canvasLabel: (count: number) => `증거 Graph · 노드 ${count}개 표시`,

  /**
   * Accessible name of one node hit target on the canvas —
   * `<라벨> · <유형> · <등급>`. Type and grade are product vocabulary and stay
   * verbatim so the verified/inferred split reads the same everywhere.
   */
  nodeSummary: (label: string, type: string, grade: string) =>
    `${label} · ${type} · ${grade}`,

  /** 가장 많이 연결된 노드 칩 (Phase 2A todo 7, REVIEW G2) */
  hubs: {
    kicker: "허브 노드",
    aria: "가장 많이 연결된 노드",
    /** `연결 <n>개` */
    degree: (count: number) => `연결 ${count}개`,
    empty: "연결된 노드가 아직 없습니다.",
  },

  /** `노드 <n>개를 유형·등급으로 묶었습니다` */
  clusterNote: (count: number) => `노드 ${count}개를 유형·등급으로 묶었습니다`,

  states: {
    loading: {
      title: "증거 색인 불러오는 중",
      body: "Graph의 스팬과 등급을 해석하고 있습니다.",
    },
    empty: {
      title: "Graph 캔버스 준비됨",
      body: "첫 스캔이 문서 → 요구사항 → 코드 → 테스트를 여기에 이어 그립니다.",
    },
    scanning: {
      title: "증명 축 구성 중 · 62%",
      body: "아티팩트 15개 색인 완료 · 요구사항 추출 중",
    },
    revoked: {
      title: "GitHub App 연결 끊김",
      body: "자동 스캔이 멈췄습니다. 저장된 증거는 읽기 전용으로 남고, 연결이 끊긴 동안 크레딧은 쓰이지 않습니다.",
      reconnect: "GitHub App 재연결",
      viewStored: "저장된 증거 보기",
    },
    permissionError: {
      title: "GitHub 권한 변경됨",
      body: "contents:read 권한이 필요합니다. 레포 데이터는 저장되지 않았습니다.",
      action: "권한 확인",
    },
    failed: {
      title: "분석 전에 스캔이 멈췄습니다",
      body: "녹화된 GitHub 응답이 시간 초과됐습니다. 기존 증거는 그대로 볼 수 있습니다.",
      action: "스캔 재시도",
    },
  },

  /**
   * Metric drill-downs. Every line names its source — a number that cannot be
   * traced to evidence must not be shown at all (WORK_SPEC §5.2-①).
   */
  metricEvidence: {
    unresolved: [
      "미해소 Findings 4건",
      "missing-test 2 · stale-doc 1 · unproven-claim 1",
      "출처: 최신 결정론 분석",
    ],
    implementation: [
      "구현 커버리지 84%",
      "활성 요구사항 13개 중 11개에 구현 증거가 있습니다",
      "출처: 요구사항 → 코드 엣지",
    ],
    tests: [
      "테스트 커버리지 71%",
      "파싱된 CI 리포트에서 verified 링크 10개",
      "출처: bad0551 GitHub Actions 리포트",
    ],
    tokens: [
      "턴당 1,840 tokens",
      "AGENTS.md와 하위 지시문이 항상 로드됩니다",
      "가정: cl100k_base 호환 추정치",
    ],
  },

  inspector: {
    kicker: "Inspector",
    lead: "이 주장을 요구사항에서 구현·테스트 증거까지 따라갑니다.",
    chainTitle: "증거 체인",
    /** `미해소 Findings <n>건` */
    findingCount: (count: number) => `미해소 Findings ${count}건`,
    empty: "노드를 선택하면 증명 체인을 볼 수 있습니다.",
  },

  activity: {
    live: "Live",
    title: "에이전트 활동",
    replay: "MCP 세션 재생",
    trace: "실시간 추적",
    samples: [
      { detail: "파일 42개 색인", meta: "git: bad0551", time: "10:24:31", tool: "search_index" },
      { detail: "테스트 결과 조회 (#8721)", meta: "cache: hit", time: "10:24:28", tool: "get_artifact" },
      {
        detail: "제한된 컨텍스트 팩 구성",
        meta: "worker: 3",
        time: "10:24:27",
        tool: "request_context_pack",
      },
    ],
  },
} as const;
