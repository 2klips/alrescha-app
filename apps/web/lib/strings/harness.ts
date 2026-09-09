/**
 * Copy for the harness surfaces (Phase 2A todo 8 — Korean-first sweep).
 * Tone: 제품 카피는 간결한 평서형, 버튼은 명사형.
 */

export const HARNESS = {
  ariaAssets: "에이전트 지시문",
  title: "이미 작동하는 것을 저장합니다.",

  demo: {
    kicker: "표류 데모 · 레포지토리 하네스",
    lead: "이 픽스처는 정확한 SKILL.md 소스 commit으로 인증된 저장 흐름을 그대로 재현합니다.",
    /**
     * 데모 화면의 숫자는 픽스처에서 나온다 (todo 24). 라벨 없이 두면 실제
     * 레포 측정값과 구분되지 않으므로, 표 위에 항상 붙는다.
     */
    badge: "데모 데이터",
    costNote:
      "아래 표의 수치는 표류 데모 픽스처에서 나온 값이며 실제 레포 측정값이 아닙니다.",
  },

  /**
   * 상시 로드 비용 표 (WORK_SPEC §5.2-③ 표1, Phase 4 Wave E todo 24).
   * 헤더에 토크나이저 가정을 명시하는 것이 스펙 요구사항이다.
   */
  cost: {
    aria: "상시 로드 지시문 비용",
    title: "상시 로드 비용",
    /** `<n>자/토큰 가정 · 파일 크기(바이트) 기준 — 측정이 아니라 추정입니다.` */
    assumption: (charsPerToken: number) =>
      `${charsPerToken}자/토큰 가정 · 파일 크기(바이트) 기준 — 측정이 아니라 추정입니다. 한글은 UTF-8에서 한 자가 3바이트라 이 방식은 과대 추정합니다.`,

    columns: {
      file: "파일",
      loader: "로드 주체",
      mode: "로드 시점",
      bytes: "바이트",
      tokens: "추정 토큰",
    },

    loaders: {
      claude_code: "Claude Code",
      codex: "Codex",
      cursor: "Cursor",
    },

    modes: {
      always: "항상",
      conditional: "해당 디렉터리에서만",
      on_demand: "요청 시",
      unknown: "확인 불가",
    },

    totals: {
      always: "상시 로드 합계",
      /** `파일 <n>개` */
      alwaysFiles: (count: number) => `파일 ${count}개`,
      excluded: "합계에서 제외",
      /** `조건부 <n> · 요청 시 <n> · 확인 불가 <n> 토큰` */
      excludedDetail: (
        conditional: number,
        onDemand: number,
        unknown: number,
      ) =>
        `조건부 ${conditional.toLocaleString("en-US")} · 요청 시 ${onDemand.toLocaleString("en-US")} · 확인 불가 ${unknown.toLocaleString("en-US")} 토큰 — 상시 로드가 아니므로 더하지 않습니다.`,
    },

    /** `<주체>: 상시 <n> 토큰(파일 <n>/<n>개) · 미확정 <n>개` */
    perLoader: (
      loader: string,
      tokens: number,
      alwaysFiles: number,
      unresolved: number,
      files: number,
    ) =>
      `${loader}: 상시 ${tokens.toLocaleString("en-US")} 토큰(파일 ${alwaysFiles}/${files}개) · 미확정 ${unresolved}개`,
  },

  live: {
    kicker: "레포지토리 하네스 · 소스 기반 자산",
    lead: "재사용을 위해 정확한 지시문 스냅샷을 캡처합니다. 소스 레포지토리는 그대로 유지됩니다.",
  },

  empty: {
    title: "색인된 지시문 자산이 없습니다",
    body: "레포지토리 스캔을 실행한 뒤 하네스로 돌아오세요.",
  },

  card: {
    tagsLabel: "태그",
    tagsPlaceholder: "인증, 리뷰",
    save: "라이브러리에 저장",
    saving: "저장 중…",
    browseLibrary: "라이브러리 보기",
  },

  /** `saveHarnessAsset` / demo save action 공용 알림 문구 (harness-asset-card.tsx와 공유) */
  notices: {
    saved: "불변 스냅샷을 저장했습니다.",
    duplicate: "이미 저장됨 — 기존 digest를 재사용합니다.",
  },
} as const;
