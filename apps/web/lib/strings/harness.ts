/**
 * Copy for the harness surfaces (Phase 2A todo 8 — Korean-first sweep).
 * Tone: 제품 카피는 간결한 평서형, 버튼은 명사형.
 */

export const HARNESS = {
  ariaAssets: "하네스 자산",
  title: "이미 작동하는 것을 저장합니다.",

  demo: {
    kicker: "표류 데모 · 레포지토리 하네스",
    lead: "이 픽스처는 정확한 SKILL.md 소스 commit으로 인증된 저장 흐름을 그대로 재현합니다.",
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
