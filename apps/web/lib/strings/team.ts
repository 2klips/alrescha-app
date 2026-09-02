/**
 * Copy for the team surface (Phase 2B todo 9–13 follow-up wiring, ADR-011).
 * Every panel states its privacy boundary in the copy itself — the screen is
 * where the model becomes legible to the people it protects.
 */

export const TEAM = {
  header: {
    repoLine: "2klips/alrescha-app · 팀",
    commitChip: "main · 공유 그래프",
  },
  kicker: "팀 워크스페이스",
  title: "팀 · 코칭 · 기여도",
  lead: "역할과 초대, 프롬프트 코칭, 증거 기반 기여도를 한 화면에서 — 프라이버시 경계는 카피가 아니라 데이터베이스가 강제합니다.",
  ariaMain: "팀 워크스페이스 화면",
  ariaStateSwitcher: "데모 팀 데이터 상태",

  roster: {
    title: "구성원",
    /** `<n>명` */
    count: (count: number) => `${count}명`,
    roles: {
      owner: "owner",
      admin: "admin",
      member: "member",
      viewer: "viewer",
    },
    statuses: {
      invited: "초대됨",
      active: "활성",
      revoked: "해지됨",
    },
    note: "활성 구성원만 공유 그래프를 봅니다. 초대 상태는 아무 권한도 주지 않습니다.",
    empty: "구성원이 없습니다.",
  },

  capture: {
    title: "프롬프트 기록",
    workspaceOn: "워크스페이스 스위치: 켜짐",
    workspaceOff: "워크스페이스 스위치: 꺼짐",
    consentOn: "내 동의: 켜짐",
    consentOff: "내 동의: 꺼짐",
    rawOn: "원문 동기화: 켜짐",
    rawOff: "원문 동기화: 꺼짐 (메타데이터만 전송)",
    privacyNote:
      "동의 여부는 나만 볼 수 있습니다. 관리자도 다른 사람의 동의 상태를 조회할 수 없습니다.",
    localNote: "기본 저장 위치는 내 레포의 로컬 파일입니다.",
  },

  coaching: {
    title: "프롬프트 코칭",
    note: "채점은 판단 결과이므로 항상 inferred입니다. 관측되지 않는 축은 높은 점수를 받을 수 없습니다.",
    axes: {
      contextGrounding: "컨텍스트 근거",
      specificity: "구체성",
      verifiability: "검증 가능성",
      batchSize: "배치 크기",
      stopCondition: "정지 조건",
      noOverInstruction: "과잉 지시 없음",
    },
    /** `<score> / 2` */
    axisScore: (score: number) => `${score} / 2`,
    suggestionsTitle: "개선 제안",
    samplePromptTitle: "채점한 프롬프트",
    insufficient: "증거 부족 — 이 워크스페이스에는 채점된 프롬프트가 없습니다.",
  },

  coachingRequest: {
    title: "내 프롬프트 코칭 요청",
    note: "내가 기록한 프롬프트만 요청할 수 있고, 원문 동기화에 동의한 기록만 채점됩니다. 성공 시 1크레딧(BYOK 0).",
    action: "코칭 요청",
    retry: "이전 시도 실패 — 다시 요청",
    pending: "처리 중",
    queued: "코칭 잡이 큐에 들어갔습니다 — 채점되면 루브릭이 채워집니다.",
    needsRaw: "원문 미동기화 — 코칭 불가",
    graded: "채점 완료",
    empty: "기록된 내 프롬프트가 없습니다.",
    /** `<n> tokens` */
    tokens: (count: number) => `${count} tokens`,
  },

  contribution: {
    title: "증거 기반 기여도",
    note: "자가보고 입력은 스키마 단계에서 거부됩니다 — 전부 commit·receipt·발견에서 계산합니다.",
    columns: {
      member: "구성원",
      commits: "commit",
      verified: "verified 증거",
      resolved: "해소한 발견",
      proven: "증명한 요구사항",
    },
    none: "없음",
  },

  vibe: {
    title: "VIBE Index",
    note: "지표는 하네스 주입 A/B에서 지표 상승과 정확도 상승을 동시에 통과해야만 노출됩니다 (ADR-011-7).",
    gatePending:
      "전 지표가 게이트 대기 상태입니다 — 실모델 실행 전이라 어떤 점수도 표시하지 않습니다.",
    /** `채택 <adopted> / 후보 <total>` */
    gateSummary: (adopted: number, total: number) =>
      `채택 ${adopted} / 후보 ${total}`,
    comparisonLocked:
      "구성원 간 비교 표는 워크스페이스 정책이 명시로 켜야 열립니다. 현재는 잠겨 있습니다.",
    statuses: {
      adopted: "채택",
      pending: "대기",
      rejected: "폐기",
    },
  },
} as const;
