/**
 * AppShell copy (design roadmap step 2) — ContextStrip, sidebar chrome and
 * the command palette. Every screen shares this chrome, so the per-screen
 * `*.header` repo/commit strings retire in its favor.
 */

export const SHELL = {
  context: {
    aria: "현재 컨텍스트",
    /** Shown in the SHA slot before the first scan finishes. */
    notScanned: "분석 전",
    receipts: "영수증",
    noRepo: "연결된 레포 없음",
  },
  sidebar: {
    /** Single label — `aria-pressed` carries the state. */
    collapseToggle: "사이드바 접기/펼치기",
    searchHint: "⌘K",
  },
  palette: {
    aria: "화면 이동",
    placeholder: "이동할 화면 검색",
    empty: "결과 없음",
    themeAction: "테마 전환",
  },
} as const;
