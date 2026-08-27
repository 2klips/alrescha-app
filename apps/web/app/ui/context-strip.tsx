import { GitBranch, GitCommitHorizontal, ReceiptText } from "lucide-react";
import Link from "next/link";

import type { ShellContext } from "../../lib/shell/context";
import { NAV } from "../../lib/strings/common";
import { SHELL } from "../../lib/strings/shell";
import type { ShellTree } from "./shell-nav-data";

/**
 * The 40px context bar every shell screen shares (WORK_SPEC §5: 현재 레포 ·
 * 브랜치 · 마지막 분석 커밋 SHA(7) · 영수증 링크). Absorbs the repo/commit
 * chips the retired per-screen headers each carried. `context` is null only
 * on the workspace tree before a repo is connected — the strip then keeps its
 * height and offers the 레포 연결 CTA instead of vanishing.
 */
export function ContextStrip({
  context,
  tree,
}: {
  readonly context: ShellContext | null;
  readonly tree: ShellTree;
}) {
  return (
    <header aria-label={SHELL.context.aria} className="context-strip">
      {context?.repoName ? (
        <span className="context-strip-repo">{context.repoName}</span>
      ) : (
        <span className="context-strip-repo context-strip-empty">
          {SHELL.context.noRepo}
        </span>
      )}
      {context?.branch ? (
        <span className="context-strip-chip">
          <GitBranch aria-hidden size={13} />
          {context.branch}
        </span>
      ) : null}
      {context ? (
        <span className="context-strip-chip context-strip-sha">
          <GitCommitHorizontal aria-hidden size={13} />
          {context.sha7 ?? SHELL.context.notScanned}
        </span>
      ) : null}
      <span aria-hidden className="context-strip-spacer" />
      {context ? (
        <Link className="context-strip-link" href={context.receiptsHref}>
          <ReceiptText aria-hidden size={13} />
          {SHELL.context.receipts}
        </Link>
      ) : tree === "workspace" ? (
        <Link className="context-strip-link" href="/app/connect/github">
          {NAV.connectRepo}
        </Link>
      ) : null}
    </header>
  );
}
