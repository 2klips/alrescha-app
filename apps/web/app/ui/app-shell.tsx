import type { ReactNode } from "react";

import type { ShellContext } from "../../lib/shell/context";
import { ContextStrip } from "./context-strip";
import { SideNav } from "./side-nav";
import type { ShellTree } from "./shell-nav-data";

/**
 * The shared screen frame (design roadmap step 2): sidebar column + content
 * column with the ContextStrip on top. Mounted once per tree by the `(shell)`
 * route-group layouts — screens stop assembling their own chrome.
 *
 * Screens keep owning their `<main>` landmark; this component deliberately
 * renders none.
 */
export function AppShell({
  children,
  context,
  tree,
}: {
  readonly children: ReactNode;
  readonly context: ShellContext | null;
  readonly tree: ShellTree;
}) {
  return (
    <div className="app-shell">
      <SideNav tree={tree} />
      <div className="app-shell-content">
        <ContextStrip context={context} tree={tree} />
        {children}
      </div>
    </div>
  );
}
