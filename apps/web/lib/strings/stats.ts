/**
 * Copy for the pilot stats surfaces (Phase 2A todo 8 — Korean-first sweep).
 * WORK_SPEC pilot-stats guarantee: every number here traces to stored
 * evidence — copy must never imply a value that was not measured, and the
 * "measured, never invented" / "no third-party data" guarantees must survive
 * translation intact.
 */

export const STATS = {
  page: {
    eyebrow: "동의 기반 측정 · 관측값만 표시",
    title: "파일럿 통계",
    body: "Receipt 체인 변화, 결정론적 컨텍스트 토큰 추정치, 스캔 소요 시간, MCP 컨텍스트 팩 요청 수를 보여줍니다. 모든 변화량은 충분한 관찰 증거가 있어야 표시됩니다.",
  },

  consent: {
    eyebrow: "측정 꺼짐",
    title: "파일럿 측정이 꺼져 있습니다",
    scope:
      "자체 workspace 데이터만 사용합니다: Receipt 요약, 결정론적 토큰 추정치, 실행 시각, MCP 컨텍스트 팩 횟수.",
    noThirdParty: "제3자에게 전송되는 데이터는 없습니다.",
    enable: "파일럿 측정 켜기",
  },

  insufficient: {
    eyebrow: "측정 켜짐",
    title: "증거가 아직 부족합니다",
    /** `Receipt <n>건 기록됨` */
    receiptsRecorded: (count: number) => `Receipt ${count}건 기록됨`,
    requirement:
      "Findings나 소요 시간 변화를 표시하려면 Receipt 2건 이상이 필요합니다. 결정론적 분석을 계속 실행하세요.",
    exportAvailable: "확보된 증거 내보내기",
  },

  toolbar: {
    /** `Receipt <n>건` */
    receiptCount: (count: number) => `Receipt ${count}건`,
    export: "JSON 내보내기",
    stop: "측정 중단",
  },

  grid: { aria: "측정된 파일럿 통계" },

  /**
   * 레포 필터 (Phase 4 Wave E todo 24). 필터는 브라우저가 아니라 질의에서
   * 걸린다 — 화면에서만 좁힌 합계는 여전히 전체를 더한 합계다.
   */
  filter: {
    label: "레포지토리",
    all: "워크스페이스 전체",
    aria: "레포지토리별 통계 필터",
    apply: "적용",
  },

  /**
   * 카드 3종은 서로 다른 종류의 숫자다 (todo 24). 실측 / 자가보고 / 추정을
   * 한 그리드에 섞어 놓고 라벨을 빼면 셋 다 실측처럼 읽힌다.
   */
  cards: {
    /** `증거 부족 — <n>/<임계>` */
    insufficient: (count: number, threshold: number) =>
      `증거 부족 — ${count}/${threshold}`,
    assumptionLabel: "가정",
  },

  served: {
    label: "서빙 토큰 (실측)",
    /** `<n> 토큰` */
    tokens: (tokens: string) => `${tokens} 토큰`,
    /** `<n>자 · 호출 <n>회` */
    charsCalls: (chars: string, calls: number) =>
      `${chars}자 · 호출 ${calls}회`,
    /** null 아님: 측정 안 된 호출은 0자가 아니라 "안 잼"이다 */
    unmeasured: (count: number) =>
      count === 0 ? "전 호출 측정됨" : `측정 안 된 호출 ${count}회 제외`,
    assumption: "문자 수는 실측, 4자/토큰 비율은 가정입니다.",
  },

  reported: {
    label: "에이전트 보고 사용량 (자가보고)",
    /** `입력 <n> · 출력 <n>` */
    inputOutput: (input: string, output: string) =>
      `입력 ${input} · 출력 ${output}`,
    /** `캐시 읽기 <n> · 캐시 생성 <n>` */
    cache: (read: string, creation: string) =>
      `캐시 읽기 ${read} · 캐시 생성 ${creation}`,
    /** `보고 <n>건` */
    reports: (count: number) => `보고 ${count}건`,
    assumption: "클라이언트가 옵트인으로 보낸 값이며 검증하지 않습니다.",
  },

  findings: {
    label: "Findings 변화",
    /** `<n>건 open` */
    openTotal: (count: number | null) => `${count ?? "—"}건 open`,
    /** `resolved <n>건 · 신규 <n>건` */
    resolvedOpened: (resolved: number, opened: number) =>
      `resolved ${resolved}건 · 신규 ${opened}건`,
    /** null이면 "아직 추세 없음", 아니면 `Receipt 체인 전체 대비 <+/->n건` */
    trend: (change: number | null) =>
      change === null
        ? "아직 추세 없음"
        : `Receipt 체인 전체 대비 ${change > 0 ? "+" : ""}${change}건`,
  },

  context: {
    label: "팩 예산 (추정)",
    assumption:
      "아무도 실행하지 않은 전체 덤프와의 비교입니다. 측정이 아니라 추정입니다.",
    /** null이면 "비교 데이터 없음", 아니면 `<n>% 감소` */
    reduction: (percent: number | null) =>
      percent === null ? "비교 데이터 없음" : `${percent}% 감소`,
    /** `선택 <n>개 / 전체 덤프 <n>개` */
    tokensCompare: (selected: string, baseline: string) =>
      `선택 ${selected}개 / 전체 덤프 ${baseline}개`,
    /** `MCP 컨텍스트 팩 요청 <n>회` */
    packRequests: (count: number) => `MCP 컨텍스트 팩 요청 ${count}회`,
  },

  scan: {
    label: "스캔 소요 시간",
    /** `<n.n>초 평균` (측정 없으면 `— 평균`) */
    average: (milliseconds: number | null) =>
      `${milliseconds === null ? "—" : `${(milliseconds / 1_000).toFixed(1)}초`} 평균`,
    /** `<n.n>초 최근` (측정 없으면 `— 최근`) */
    latest: (milliseconds: number | null) =>
      `${milliseconds === null ? "—" : `${(milliseconds / 1_000).toFixed(1)}초`} 최근`,
    /** null이면 "아직 소요 시간 추세 없음", 아니면 `최초 대비 최근 <+/->n%` */
    trend: (percent: number | null) =>
      percent === null
        ? "아직 소요 시간 추세 없음"
        : `최초 대비 최근 ${percent > 0 ? "+" : ""}${percent}%`,
  },

  methodology: {
    summary: "이 지표는 이렇게 계산됩니다",
    benchmarkPrefix: "교차 실험군 정확도와 모델 응답 토큰 결과: ",
    benchmarkLink: "Data Brain 효율 벤치마크 전체 보기",
    /** 벤치 수치 ≠ 내 수치 (todo 24) — 링크 옆에 반드시 함께 나온다. */
    benchmarkCaveat:
      "벤치마크 수치는 우리 코퍼스·모델에서 나온 값이며 이 화면의 숫자와 무관합니다.",
  },
} as const;
