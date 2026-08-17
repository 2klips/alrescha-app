/**
 * Copy for the per-commit analysis cards (Phase 2B todo 2, ADR-003).
 * Card values come from stored job/receipt rows; a missing measurement renders
 * as its absence, never as a fabricated number.
 */

export const COMMITS = {
  header: {
    repoLine: "2klips/arr-app · commit 분석",
    commitChip: "main · push 자동 분석",
  },
  kicker: "push 자동 분석",
  title: "commit 분석 카드",
  lead: "push마다 스캔과 드리프트 분석이 실행되고, commit별 결과가 카드로 남습니다.",
  ariaList: "commit 분석 목록",
  ariaDetail: "선택한 commit 상세",
  ariaStateSwitcher: "데모 분석 데이터 상태",

  statuses: {
    pending: "대기",
    analyzing: "분석 중",
    completed: "완료",
    failed: "실패",
  },

  list: {
    /** `분석 <n>건` */
    countSuffix: (count: number) => `분석 ${count}건`,
    empty: {
      title: "분석된 commit 없음",
      body: "레포를 연결하고 push하면 첫 카드가 생깁니다.",
    },
  },

  card: {
    /** `소요 <seconds>초` — 잡 claim부터 완료까지의 실측 벽시계 */
    duration: (seconds: number) => `소요 ${seconds}초`,
    durationNotMeasured: "소요 시간 없음",
    /** `+<opened> / -<resolved>` — receipt에 기록된 발견 델타 */
    delta: (opened: number, resolved: number) => `+${opened} / -${resolved}`,
    deltaPending: "델타 없음",
    /** `열린 Findings <n>건` */
    openTotal: (total: number) => `열린 Findings ${total}건`,
  },

  detail: {
    kicker: "분석 상세",
    placeholder: "왼쪽 목록에서 commit을 선택하세요.",
    jobsTitle: "실행 단계",
    jobKinds: {
      scan: "스캔",
      analyze: "드리프트 분석",
      judge: "판단 실행",
      pack: "컨텍스트 팩",
    },
    triggerKinds: {
      manual: "수동 실행",
      push: "push",
      check_run: "CI 체크",
      workflow_run: "CI 워크플로",
    },
    startedAtLabel: "접수 시각",
    durationLabel: "소요 시간",
    deltaLabel: "발견 델타",
    receiptLabel: "Receipt",
    failureLabel: "실패 사유",
    failureNotRecorded: "사유가 기록되지 않았습니다.",
    receiptAction: "Receipt 보기",
    receiptMissing: "Receipt 없음",
  },
} as const;
