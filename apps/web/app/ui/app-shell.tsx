import type { ReactNode } from "react";

import type { ShellContext } from "../../lib/shell/context";
import { SHELL } from "../../lib/strings/shell";
import { RepositoryHeader } from "./context-strip";
import { RepositoryTabs, ShellHeader } from "./shell-header";
import type { ShellTree } from "./shell-nav-data";

/**
 * Shared GitHub-style repository frame: global header, repository identity,
 * horizontal route tabs, then the route-owned screen.
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
    <>
      <a className="skip-link" href="#main-content">
        {SHELL.global.skip}
      </a>
      <div className="app-shell" data-tree={tree}>
        <div className="shell-chrome">
          <ShellHeader tree={tree} />
          <RepositoryHeader context={context} tree={tree} />
          <RepositoryTabs tree={tree} />
        </div>
        <div className="app-shell-body" id="main-content" tabIndex={-1}>
          {children}
        </div>
      </div>
    </>
  );
}
