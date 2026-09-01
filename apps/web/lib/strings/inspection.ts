/**
 * Copy for the project inspection dashboard (Phase 2B todo 8, ADR-009 ⑥).
 * Every widget names its source; missing data reads as "증거 부족", and AI
 * summaries always carry the inferred label.
 */

export const INSPECTION = {
  header: {
    repoLine: "2klips/arr-app · 프로젝트 점검",
    commitChip: "main · 출처 있는 점검",
  },
  kicker: "프로젝트 점검",
  title: "통합 점검 대시보드",
  lead: "진척·발견 문제·문서 상태·의존성 감사·배제 이력을 한 화면에서 — 전부 저장된 출처에서만 옵니다.",
  ariaMain: "프로젝트 점검 위젯",
  ariaStateSwitcher: "데모 점검 데이터 상태",
  insufficient: "증거 부족 — 저장된 데이터가 없습니다.",
  /** `출처: <label>` */
  sourcePrefix: "출처: ",

  progress: {
    title: "진척",
    /** `<done> / <total> 완료` */
    completed: (done: number, total: number) => `${done} / ${total} 완료`,
    notMeasured: "측정 안 됨",
  },

  findings: {
    title: "열린 문제",
    /** `<n>건` */
    count: (count: number) => `${count}건`,
  },

  documents: {
    title: "문서 점검",
    freshness: {
      current: "현행",
      outdated: "이전 commit 기준",
      "drift-suspected": "드리프트 의심",
    },
    summaryMissing: "요약 없음 — 판단 실행 전",
  },

  driftRisks: {
    title: "문서·드리프트 위험",
    note: "결정론 룰이 낸 발견 중 문서 위험군만 모았습니다.",
  },

  dependencyAudit: {
    title: "의존성 감사",
    note: "Arr는 코드를 스캔하지 않습니다 — npm audit 결과를 수집해 보여줄 뿐입니다.",
    /** `취약점 <n>건` */
    total: (count: number) => `취약점 ${count}건`,
    none: "보고된 취약점 없음",
    severities: {
      critical: "critical",
      high: "high",
      moderate: "moderate",
      low: "low",
      info: "info",
    },
    fix: {
      major: "수정 있음 (major)",
      none: "수정 없음",
      patch: "수정 있음",
    },
  },

  ruledOut: {
    title: "시도·배제 이력",
    note: "이미 시도해 배제된 가설 — 같은 막다른 길을 반복하지 않기 위한 append-only 기록.",
    /** `<n>건` */
    count: (count: number) => `${count}건`,
    outcomeLabel: "배제 사유",
  },

  judgment: {
    title: "AI 판정 요청",
    note: "애매한 발견을 판단 잡으로 확정합니다 — 결과는 항상 inferred이고, 성공한 판정만 과금됩니다(BYOK는 크레딧 0).",
    action: "AI 확정",
    queued: "판단 잡이 큐에 들어갔습니다 — 워커가 처리하면 요약에 반영됩니다.",
    empty: "열린 발견이 없습니다 — 판정할 대상이 없습니다.",
    source: "Findings 테이블의 열린 발견",
  },
} as const;
