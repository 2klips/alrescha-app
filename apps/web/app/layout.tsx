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

export const metadata: Metadata = {
  description: "Trace every software claim to implementation and verified test evidence.",
  title: "Arr · Proof, before merge",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
