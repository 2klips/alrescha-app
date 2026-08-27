import type { ReactNode } from "react";

import { getWorkspaceShellContext } from "../../../lib/shell/context";
import { AppShell } from "../../ui/app-shell";

/**
 * Workspace-tree shell. Live repo/branch/SHA via `getWorkspaceShellContext`
 * (React cache() — pages needing the same lookup share the query). Every
 * `/app/*` page is already force-dynamic, so the request-time lookup here
 * costs no extra rendering mode.
 */
export default async function WorkspaceShellLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const context = await getWorkspaceShellContext();
  return (
    <AppShell context={context} tree="workspace">
      {children}
    </AppShell>
  );
}
