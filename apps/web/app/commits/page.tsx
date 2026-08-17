import {
  Activity,
  Braces,
  FileWarning,
  GitBranch,
  GitCommitHorizontal,
  LayoutDashboard,
  Network,
  ReceiptText,
} from "lucide-react";
import Link from "next/link";

import {
  buildDemoCommitCards,
  type DemoCommitState,
} from "../../lib/commits/fixtures";
import { BRAND, COMMITS, NAV } from "../../lib/strings";
import { ThemeToggle } from "../ui/theme-toggle";
import { CommitAnalysisBoard } from "./commit-cards";

function parseState(value: string | string[] | undefined): DemoCommitState {
  return value === "empty" ? value : "busy";
}

function parseRun(value: string | string[] | undefined): string | null {
  return typeof value === "string" && value ? value : null;
}

export default async function CommitsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const state = parseState(params.state);
  const requestedRun = parseRun(params.run);
  const cards = buildDemoCommitCards(state);
  const selectedRunId =
    cards.find((card) => card.runId === requestedRun)?.runId ??
    cards[0]?.runId ??
    null;
  return (
    <div className="app-surface">
      <header className="app-header">
        <Link className="app-identity" href="/">
          <span className="repo-mark">
            <Network size={18} />
          </span>
          <span>
            <strong>{BRAND.name}</strong>
            <small>{COMMITS.header.repoLine}</small>
          </span>
        </Link>
        <nav aria-label={NAV.ariaSurfaces}>
          <Link href="/">
            <LayoutDashboard size={15} />
            {NAV.graph}
          </Link>
          <Link href="/findings">
            <FileWarning size={15} />
            {NAV.findings}
          </Link>
          <Link href="/lint">
            <Braces size={15} />
            {NAV.lint}
          </Link>
          <Link href="/progress">
            <Activity size={15} />
            {NAV.progress}
          </Link>
          <Link aria-current="page" href="/commits">
            <GitCommitHorizontal size={15} />
            {NAV.commits}
          </Link>
          <Link href="/receipts">
            <ReceiptText size={15} />
            {NAV.receipts}
          </Link>
        </nav>
        <span className="header-actions">
          <span className="commit-chip">
            <GitBranch size={13} />
            {COMMITS.header.commitChip}
          </span>
          <ThemeToggle />
        </span>
      </header>
      <nav
        className="progress-state-switcher"
        aria-label={COMMITS.ariaStateSwitcher}
      >
        {(["busy", "empty"] as const).map((option) => (
          <Link
            aria-current={state === option ? "page" : undefined}
            href={option === "busy" ? "/commits" : `/commits?state=${option}`}
            key={option}
          >
            {option}
          </Link>
        ))}
      </nav>
      <CommitAnalysisBoard
        cards={cards}
        selectedRunId={selectedRunId}
        stateQuery={state === "empty" ? "empty" : null}
      />
    </div>
  );
}
