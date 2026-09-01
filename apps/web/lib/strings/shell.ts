/**
 * AppShell copy (design roadmap step 2) — global header, repository header,
 * horizontal tabs, local settings navigation, and command palette. Every
 * screen shares the global chrome, so the per-screen
 * `*.header` repo/commit strings retire in its favor.
 */

export const SHELL = {
  global: {
    aria: "전역 헤더",
    skip: "본문으로 건너뛰기",
    search: "검색 또는 화면 이동",
    searchHint: "⌘K",
  },
  context: {
    aria: "현재 레포",
    branch: "브랜치",
    commit: "마지막 분석 commit",
    /** Shown in the SHA slot before the first scan finishes. */
    notScanned: "분석 전",
    receipts: "영수증",
    noRepo: "연결된 레포 없음",
  },
  settingsNav: {
    aria: "설정 내비게이션",
  },
  palette: {
    aria: "화면 이동",
    placeholder: "이동할 화면 검색",
    empty: "결과 없음",
    themeAction: "테마 전환",
  },
} as const;
