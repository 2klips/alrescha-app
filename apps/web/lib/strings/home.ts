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
      /**
       * The home, the header and the map are about one repository: the one
       * last selected in the connect picker (OQ-042 interim rule). With
       * several connected, say so and point at where another is chosen.
       */
      others: (count: number) =>
        `연결된 레포 ${count}개 — 홈과 헤더는 마지막으로 선택한 레포를 보여줍니다.`,
      switchCta: "다른 레포 선택",
    },
    graph: {
      title: "지식그래프 생성",
      body: "푸시마다 구조 엣지(import·호출·공변경)가 자동으로 쌓입니다.",
      scanning:
        "첫 스캔이 예약되었습니다 — 구조가 준비되면 그래프가 열리고, 분석은 그 뒤를 따릅니다.",
      scanningHint:
        "아래 단계가 진행 상황입니다. commit 분석에서도 볼 수 있습니다.",
      /**
       * The connect stored the repository but could not read its default
       * branch, so nothing was queued (Phase 4 Wave C todo 16). A push
       * starts the scan; so does the button once a scan has landed.
       */
      notScheduled:
        "첫 스캔을 예약하지 못했습니다 — 기본 브랜치의 최신 commit을 읽지 못했습니다. 레포에 push하면 스캔이 시작됩니다.",
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

  /**
   * The first run's two stages (Phase 4 Wave C todo 16, 보완 R-02). Structure
   * and analysis are separate states: the map opens on the first, the
   * Findings follow with the second.
   */
  scan: {
    aria: "첫 스캔 진행",
    stages: {
      structure: "구조 스캔",
      analysis: "분석",
    },
    stageHints: {
      structure: "파일·심볼·링크를 읽어 Graph를 만듭니다.",
      analysis: "요구사항·Findings·CI 증거를 판정합니다.",
    },
    states: {
      idle: "대기",
      queued: "대기열",
      running: "진행 중",
      ready: "완료",
      failed: "실패",
      local: "이 머신에서 실행",
    },
    localHint:
      "로컬로 push한 레포의 분석은 alrescha serve --local 로 이 머신에서 엽니다. 서버는 파일을 읽을 수 없습니다.",
    failedPrefix: "실패 사유",
    commit: "commit",
    rescan: {
      cta: "다시 스캔",
      /** The first scan failed for good and never landed: try it again. */
      retryCta: "첫 스캔 다시 시도",
      busy: "스캔 진행 중",
      neverScanned: "첫 스캔이 끝나면 다시 스캔할 수 있습니다.",
      local: "로컬 레포는 alrescha push 로 다시 스캔합니다.",
      outcomes: {
        scheduled:
          "다시 스캔을 예약했습니다 — 구조가 갱신되면 분석이 이어집니다.",
        scheduledFull:
          "전체 다시 링크를 예약했습니다 — 저장된 링크가 이전 세대라 모든 파일을 다시 읽습니다.",
        firstScan:
          "첫 스캔을 다시 예약했습니다 — 실패한 이전 시도는 기록에 남고, 새 시도가 이어집니다.",
        neverScanned:
          "아직 첫 스캔이 없어 다시 스캔할 기준이 없습니다. 레포에 push하면 시작됩니다.",
        local:
          "이 레포는 로컬에서 push되어 서버가 파일을 읽을 수 없습니다. alrescha push 로 다시 스캔하세요.",
        rateLimited: "요청이 너무 잦습니다. 잠시 후 다시 시도하세요.",
        error: "다시 스캔을 예약하지 못했습니다. 잠시 후 다시 시도하세요.",
      },
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
