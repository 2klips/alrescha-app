import Link from "next/link";

import {
  buildDemoProgressReport,
  type DemoProgressState,
} from "../../../lib/progress/fixtures";
import { PROGRESS } from "../../../lib/strings";
import { ProgressDashboardView } from "../../ui/progress-dashboard";

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
    <>
      <nav
        className="progress-state-switcher"
        aria-label={PROGRESS.ariaStateSwitcher}
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
    </>
  );
}
