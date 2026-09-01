/**
 * Copy shared by every app area (Phase 2A todo 3).
 * Tone: 제품 카피는 간결한 평서형, 버튼은 명사형.
 */

export const BRAND = {
  name: "Alrescha",
  tagline: "Evidence, connected.",
  homeLabel: "Alrescha 홈",
} as const;

export const NAV = {
  ariaPrimary: "주요 내비게이션",
  ariaRepository: "레포 내비게이션",
  /** 사이드바 그룹 — Phase 2D의 4그룹에 design roadmap step 2가 설정을 더한 5그룹. */
  groups: {
    glance: "한눈에",
    analysis: "분석",
    brain: "Data Brain",
    records: "기록·자산",
    settings: "설정",
  },
  ariaSurfaces: "보증 화면",
  toggle: "내비게이션 열기",
  overview: "한눈에 보기",
  brainExplore: "노드 탐색",
  graph: "Graph",
  findings: "Findings",
  lint: "AI 지시문 검사",
  progress: "진행",
  commits: "commit 분석",
  inspection: "프로젝트 점검",
  team: "팀",
  receipts: "Receipts",
  harness: "에이전트 지시문",
  library: "저장된 증거",
  connectRepo: "레포 연결",
  stats: "통계",
  settingsMcp: "MCP 접근",
  settingsAi: "AI 사용량",
  settingsPrivacy: "프라이버시",
  settingsIndex: "설정",
  account: "계정 설정",
  openApp: "앱 열기",
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
  body: "이 경로는 Alrescha 워크스페이스 밖에 있습니다.",
  cta: "앱으로 돌아가기",
} as const;
