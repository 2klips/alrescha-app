import {
  Activity,
  Braces,
  FileWarning,
  GitBranch,
  LayoutDashboard,
  Network,
  ReceiptText,
} from "lucide-react";
import Link from "next/link";

import {
  buildDemoProgressReport,
  type DemoProgressState,
} from "../../lib/progress/fixtures";
import { ProgressDashboardView } from "./progress-dashboard";

function parseState(value: string | string[] | undefined): DemoProgressState {
  return value === "empty" || value === "full" ? value : "partial";
}

export default async function ProgressPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const state = parseState((await searchParams).state);
  return (
    <div className="app-surface">
      <header className="app-header">
        <Link className="app-identity" href="/">
          <span className="repo-mark">
            <Network size={18} />
          </span>
          <span>
            <strong>Arr</strong>
            <small>2klips/specproof-app · progress ledger</small>
          </span>
        </Link>
        <nav aria-label="Assurance surfaces">
          <Link href="/">
            <LayoutDashboard size={15} />
            Graph
          </Link>
          <Link href="/findings">
            <FileWarning size={15} />
            Findings
          </Link>
          <Link href="/lint">
            <Braces size={15} />
            Instruction lint
          </Link>
          <Link aria-current="page" href="/progress">
            <Activity size={15} />
            Progress
          </Link>
          <Link href="/receipts">
            <ReceiptText size={15} />
            Receipts
          </Link>
        </nav>
        <span className="commit-chip">
          <GitBranch size={13} />
          main · sourced state
        </span>
      </header>
      <nav
        className="progress-state-switcher"
        aria-label="Demo progress data state"
      >
        {(["empty", "partial", "full"] as const).map((option) => (
          <Link
            aria-current={state === option ? "page" : undefined}
            href={
              option === "partial" ? "/progress" : `/progress?state=${option}`
            }
            key={option}
          >
            {option}
          </Link>
        ))}
      </nav>
      <ProgressDashboardView report={buildDemoProgressReport(state)} />
    </div>
  );
}
