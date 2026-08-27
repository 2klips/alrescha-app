import type { ReactNode } from "react";

import { DEMO_SHELL_CONTEXT } from "../../lib/shell/demo-context";
import { AppShell } from "../ui/app-shell";

/** Demo-tree shell: same AppShell as `/app/*`, fixture context plugged in. */
export default function DemoShellLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <AppShell context={DEMO_SHELL_CONTEXT} tree="demo">
      {children}
    </AppShell>
  );
}
