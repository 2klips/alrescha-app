/**
 * Copy shared by every app area (Phase 2A todo 3).
 * Tone: 제품 카피는 간결한 평서형, 버튼은 명사형.
 */

export const BRAND = {
  name: "Arr",
  /** Brand asset — deliberately not translated (ADR-008). */
  tagline: "Proof, before merge.",
  homeLabel: "Arr 홈",
} as const;

export const NAV = {
  ariaPrimary: "주요 내비게이션",
  ariaSurfaces: "보증 화면",
  toggle: "내비게이션 열기",
  graph: "Graph",
  findings: "Findings",
  lint: "지시문 린트",
  progress: "진행",
  commits: "commit 분석",
  receipts: "Receipts",
  harness: "하네스 자산",
  library: "증거 라이브러리",
  connectRepo: "레포 연결",
} as const;

export const THEME = {
  dark: "Dark",
  light: "Light",
  /** `${label} 테마로 전환` */
  switchSuffix: " 테마로 전환",
} as const;

/** Evidence grades stay English — the verified/inferred split is identity. */
export const GRADE = {
  verified: "verified",
  inferred: "inferred",
  broken: "broken",
  waiting: "대기",
} as const;

export const ACTION = {
  retry: "다시 시도",
  close: "닫기",
  search: "검색",
} as const;

export const NOT_FOUND = {
  eyebrow: "404 · 알 수 없는 경로",
  title: "여기엔 아무것도 없습니다.",
  body: "이 경로는 Arr 워크스페이스 밖에 있습니다.",
  cta: "앱으로 돌아가기",
} as const;
