/**
 * Copy for the progress ledger (WORK_SPEC §5.2-⑧, ADR-006).
 * Every number on this screen comes from a stored source — the copy says so.
 * Phase 2A todo 3.
 */

export const PROGRESS = {
  header: {
    repoLine: "2klips/alrescha-app · 진행 원장",
    commitChip: "main · 출처 있는 상태",
  },
  kicker: "레포 진행 원장",
  sourceContract: "출처가 있는 항목만",
  ariaMetrics: "커버리지 지표",
  ariaStateSwitcher: "데모 진행 데이터 상태",

  metrics: {
    requirements: "요구사항 커버리지",
    todos: "todo 완료율",
    notMeasured: "측정 안 됨",
    /** 요구사항은 있는데 `implements` 엣지가 하나도 없을 때 — 0%가 아니다. */
    noLinks: "미측정 — 구현 링크 없음",
    /** `<done> / <total> 완료` */
    completed: (done: number, total: number) => `${done} / ${total} 완료`,
  },

  states: {
    empty: {
      label: "기록된 진행 없음",
      description:
        "TODO·진행 문서를 스캔하거나 log_progress 이벤트를 한 번 보내세요.",
    },
    partial: {
      label: "부분 증거",
      description:
        "완료가 open 또는 blocked 상태입니다. 아래 수치는 저장된 출처에서만 옵니다.",
    },
    full: {
      label: "전부 추적됨",
      description:
        "기록된 요구사항과 todo 모두 출처 있는 완료 증거를 가집니다.",
    },
  },

  todoBoard: {
    kicker: "현재 상태",
    title: "Todo 보드",
    empty: "출처 있는 항목 없음",
    /** `<n>건 출처 확인` — 보드 헤더의 합계 접미사 */
    itemsSuffix: "건 출처 확인",
    statuses: {
      open: "open",
      "in-progress": "진행 중",
      done: "완료",
      blocked: "blocked",
    },
  },

  timeline: {
    kicker: "최신순",
    title: "최근 작업",
    /** `이벤트 <n>건` */
    eventCount: (count: number) => `이벤트 ${count}건`,
    empty: "진행 이벤트·commit·해소된 Findings가 없습니다.",
    /**
     * `요구사항 <r> · 구현 체크됨 <i> · 테스트 매핑 <t>` — receipt statement의
     * 결정론 coverage 그대로. `implVerified`는 체크박스·심볼 존재 기준이므로
     * "verified"라고 부르지 않는다 (WORK_SPEC §3-1, OQ-036).
     */
    receiptCoverage: (requirements: number, impl: number, test: number) =>
      `요구사항 ${requirements} · 구현 체크됨 ${impl} · 테스트 매핑 ${test}`,
    /** `<sha7> receipt · statement 없음` — coverage를 읽을 수 없는 행. */
    receiptWithoutStatement: (sha7: string) =>
      `${sha7} receipt · statement 없음`,
  },
} as const;
