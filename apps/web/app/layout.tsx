import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

import { THEME_INIT_SCRIPT } from "../lib/theme/theme-preference";

// Korean-first shell (Phase 3 Wave E todo 13) — the intent of the rescued
// specproof patch (planning/rescued-from-specproof/korean-homepage-uncommitted
// .patch) applied to the current tree: lang=ko + Korean title/description.
export const metadata: Metadata = {
  description:
    "레포를 연결하면 살아있는 지식그래프 — 당신의 에이전트가 읽고 기록하는 세컨드 브레인.",
  title: "Alrescha · 살아있는 증거 그래프",
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
          id="alrescha-theme-init"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
