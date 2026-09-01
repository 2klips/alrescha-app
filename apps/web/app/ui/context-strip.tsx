import {
  BookOpen,
  GitBranch,
  GitCommitHorizontal,
  ReceiptText,
} from "lucide-react";
import Link from "next/link";

import type { ShellContext } from "../../lib/shell/context";
import { NAV } from "../../lib/strings/common";
import { SHELL } from "../../lib/strings/shell";
import { shellHome, type ShellTree } from "./shell-nav-data";

/**
 * The 48px repository header every shell screen shares (WORK_SPEC §5: 현재 레포 ·
 * 브랜치 · 마지막 분석 커밋 SHA(7) · 영수증 링크). Absorbs the repo/commit
 * chips the retired per-screen headers each carried. `context` is null only
 * on the workspace tree before a repo is connected — the header keeps its
 * height and offers the 레포 연결 CTA instead of vanishing.
 */
export function RepositoryHeader({
  context,
  tree,
}: {
  readonly context: ShellContext | null;
  readonly tree: ShellTree;
}) {
  return (
    <section aria-label={SHELL.context.aria} className="repository-header">
      {context?.repoName ? (
        <Link className="repository-identity" href={shellHome(tree)}>
          <BookOpen aria-hidden size={16} strokeWidth={1.8} />
          <strong>{context.repoName}</strong>
        </Link>
      ) : (
        <span className="repository-identity repository-identity-empty">
          <BookOpen aria-hidden size={16} strokeWidth={1.8} />
          {SHELL.context.noRepo}
        </span>
      )}
      {context?.branch ? (
        <span className="repository-meta" title={SHELL.context.branch}>
          <GitBranch aria-hidden size={13} />
          {context.branch}
        </span>
      ) : null}
      {context ? (
        <span
          className="repository-meta repository-sha"
          title={SHELL.context.commit}
        >
          <GitCommitHorizontal aria-hidden size={13} />
          {context.sha7 ?? SHELL.context.notScanned}
        </span>
      ) : null}
      <span aria-hidden className="repository-header-spacer" />
      {context ? (
        <Link className="repository-action" href={context.receiptsHref}>
          <ReceiptText aria-hidden size={13} />
          {SHELL.context.receipts}
        </Link>
      ) : tree === "workspace" ? (
        <Link className="repository-action" href="/app/connect/github">
          {NAV.connectRepo}
        </Link>
      ) : null}
    </section>
  );
}
