import type { Metadata } from "next";
import type { ReactNode } from "react";

import "@fontsource-variable/archivo";
import "@fontsource-variable/manrope";
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
