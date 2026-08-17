import {
  Activity,
  Braces,
  FileWarning,
  GitBranch,
  LayoutDashboard,
  Network,
  ReceiptText,
  Users,
} from "lucide-react";
import Link from "next/link";

import { buildDemoTeam, type DemoTeamState } from "../../lib/team/fixtures";
import { BRAND, NAV, TEAM } from "../../lib/strings";
import { ThemeToggle } from "../ui/theme-toggle";
import { TeamView } from "./team-view";

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
    <div className="app-surface">
      <header className="app-header">
        <Link className="app-identity" href="/">
          <span className="repo-mark">
            <Network size={18} />
          </span>
          <span>
            <strong>{BRAND.name}</strong>
            <small>{TEAM.header.repoLine}</small>
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
          <Link aria-current="page" href="/team">
            <Users size={15} />
            {NAV.team}
          </Link>
          <Link href="/receipts">
            <ReceiptText size={15} />
            {NAV.receipts}
          </Link>
        </nav>
        <span className="header-actions">
          <span className="commit-chip">
            <GitBranch size={13} />
            {TEAM.header.commitChip}
          </span>
          <ThemeToggle />
        </span>
      </header>
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
    </div>
  );
}
