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
    concepts: "개념",
    openFindings: "미해소 Findings",
  },

  empty: {
    title: "이 워크스페이스에는 아직 Graph가 없습니다",
    body: "GitHub 레포를 연결하면 commit마다 스캔이 문서·심볼·근거 노트를 이 화면에 그립니다. 원본 코드는 저장되지 않습니다 — Graph는 메타데이터만 담습니다.",
    connect: "GitHub 레포 연결",
    /**
     * A repository is connected and its first scan has not landed yet
     * (Phase 4 Wave C todo 16): the screen opens the moment the structure
     * is ready, so the honest state here is "coming", not "connect".
     */
    scanningTitle: (repo: string) => `${repo}의 첫 스캔이 진행 중입니다`,
    scanningBody:
      "구조가 준비되면 이 화면이 Graph를 그립니다. 분석은 그 뒤를 따르며, 진행 상황은 워크스페이스 홈에서 볼 수 있습니다.",
    progress: "진행 상황 보기",
  },

  /** 방향 포커스 범례 — 선택한 노드 기준 엣지 색의 의미. */
  focus: {
    aria: "방향 포커스 범례",
    out: "의존한다",
    in: "의존받는다",
  },

  /** 공변경 엣지 토글 — 같은 commit에서 자주 함께 바뀐 파일 쌍. */
  coChange: {
    toggle: "공변경 엣지",
    toggleAria: "같은 commit에서 함께 바뀐 파일 연결 표시",
  },

  /** 개념 레이어 토글 (Wave C todo 7) — AI가 합성한 inferred 개념 노드. */
  conceptLayer: {
    toggle: "개념 레이어",
    toggleAria: "AI가 합성한 개념 노드와 연결 표시",
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
    /**
     * The state of the workspace channel behind "Live" (Wave B todo 15).
     * Shown as a word rather than a colour: a badge that says "Live" while
     * the channel is still joining is a claim the page cannot yet back.
     */
    channel: {
      aria: "실시간 채널 상태",
      connecting: "채널 연결 중",
      live: "실시간 수신 중",
      retrying: "재연결 중",
      closed: "연결 종료",
    },
  },

  /**
   * Real-data HUD (Wave B todo 15). Every chip names its source line, the
   * same rule the demo dashboard's metric evidence follows (WORK_SPEC
   * §5.2-①): a number that cannot say where it came from is not shown.
   */
  hud: {
    aria: "워크스페이스 상태 칩",
    findings: {
      detail: "open 상태만 셉니다",
      source: "출처: 저장된 Findings 행",
    },
    coverage: {
      label: "구현 커버리지",
      /** `<covered> / <total> 요구사항` */
      measured: (covered: number, total: number) =>
        `${covered} / ${total} 요구사항`,
      /** 요구사항이 아직 없다 — 0%가 아니다. */
      noData: "측정 안 됨",
      /** 요구사항은 있는데 `implements` 엣지가 하나도 없다 — 0%가 아니다. */
      noLinks: "미측정 — 구현 링크 없음",
      source: "출처: 요구사항 → 코드 implements 엣지",
    },
    risk: {
      kicker: "위험 상위",
      aria: "위험 상위 파일",
      empty: "위험 요인이 있는 코드가 없습니다",
      /** `<n>개 파일` — files with at least one factor. */
      count: (files: number) => `${files}개 파일`,
      /** The risk map's bands; `low` has factors but draws no ring. */
      levels: {
        high: "높음",
        elevated: "주의",
        moderate: "보통",
        low: "낮음",
      },
      unmeasuredCoverage: "커버리지 미측정",
      source: "출처: 위험 지도 — 저장된 엣지·Findings·공변경",
    },
    lastScan: {
      label: "마지막 스캔",
      never: "스캔 전",
      /** Freshness at page load, in the coarsest honest unit. */
      age: (minutes: number) => {
        if (minutes < 1) return "방금";
        if (minutes < 60) return `${minutes}분 전`;
        if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}시간 전`;
        return `${Math.floor(minutes / (60 * 24))}일 전`;
      },
      unknownAge: "완료 시각 없음",
      source: "출처: 성공한 스캔 잡 · 로컬 push 실행",
    },
  },
} as const;
