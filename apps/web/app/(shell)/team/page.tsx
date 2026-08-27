import Link from "next/link";

import { buildDemoTeam, type DemoTeamState } from "../../../lib/team/fixtures";
import { TEAM } from "../../../lib/strings";
import { TeamView } from "../../ui/team-view";

function parseState(value: string | string[] | undefined): DemoTeamState {
  return value === "solo" ? value : "team";
}

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const state = parseState((await searchParams).state);
  return (
    <>
      <nav
        className="progress-state-switcher"
        aria-label={TEAM.ariaStateSwitcher}
      >
        {(["team", "solo"] as const).map((option) => (
          <Link
            aria-current={state === option ? "page" : undefined}
            href={option === "team" ? "/team" : `/team?state=${option}`}
            key={option}
          >
            {option}
          </Link>
        ))}
      </nav>
      <TeamView team={buildDemoTeam(state)} />
    </>
  );
}
