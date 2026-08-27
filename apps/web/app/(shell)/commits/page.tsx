import Link from "next/link";

import {
  buildDemoCommitCards,
  type DemoCommitState,
} from "../../../lib/commits/fixtures";
import { COMMITS } from "../../../lib/strings";
import { CommitAnalysisBoard } from "../../ui/commit-cards";

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
    <>
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
        basePath="/commits"
        cards={cards}
        selectedRunId={selectedRunId}
        stateQuery={state === "empty" ? "empty" : null}
      />
    </>
  );
}
