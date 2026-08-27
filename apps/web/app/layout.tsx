import type { Metadata } from "next";
import type { ReactNode } from "react";

// Ink & Seal typography (ADR-009-3): Pretendard Variable for body/headings,
// IBM Plex Mono for numbers, code, SHAs, logs and token counts. Both are
// self-hosted from node_modules — no CDN, and no other families.
// Pretendard ships a Korean dynamic subset (92 unicode-range slices) so a
// Korean-first page downloads only the slices it actually renders (OQ-002).
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-600.css";
import "./globals.css";

import { SIDEBAR_INIT_SCRIPT } from "../lib/shell/sidebar-preference";
import { THEME_INIT_SCRIPT } from "../lib/theme/theme-preference";

// Korean-first shell (Phase 3 Wave E todo 13) — the intent of the rescued
// specproof patch (planning/rescued-from-specproof/korean-homepage-uncommitted
// .patch) applied to the current tree: lang=ko + Korean title/description.
export const metadata: Metadata = {
  description:
    "레포를 연결하면 살아있는 지식그래프 — 당신의 에이전트가 읽고 기록하는 세컨드 브레인.",
  title: "Arr · 살아있는 지식그래프",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* Stamps data-theme before the first paint — without this the dark
            default would flash on a light-theme reload (Phase 2A todo 2). */}
        <script
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
          id="arr-theme-init"
        />
        {/* Same pre-paint mechanism for the sidebar collapse state — keeps the
            demo tree static where a cookie read in the layout would not. */}
        <script
          dangerouslySetInnerHTML={{ __html: SIDEBAR_INIT_SCRIPT }}
          id="arr-sidebar-init"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
