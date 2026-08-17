import {
  Activity,
  Braces,
  FileWarning,
  GitBranch,
  LayoutDashboard,
  Network,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";

import {
  buildDemoInspectionDashboard,
  type DemoInspectionState,
} from "../../lib/inspection/fixtures";
import { BRAND, INSPECTION, NAV } from "../../lib/strings";
import { ThemeToggle } from "../ui/theme-toggle";
import { InspectionView } from "./inspection-view";

function parseState(value: string | string[] | undefined): DemoInspectionState {
  return value === "empty" ? value : "busy";
}

export default async function InspectionPage({
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
            <small>{INSPECTION.header.repoLine}</small>
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
          <Link aria-current="page" href="/inspection">
            <ShieldCheck size={15} />
            {NAV.inspection}
          </Link>
          <Link href="/receipts">
            <ReceiptText size={15} />
            {NAV.receipts}
          </Link>
        </nav>
        <span className="header-actions">
          <span className="commit-chip">
            <GitBranch size={13} />
            {INSPECTION.header.commitChip}
          </span>
          <ThemeToggle />
        </span>
      </header>
      <nav
        className="progress-state-switcher"
        aria-label={INSPECTION.ariaStateSwitcher}
      >
        {(["busy", "empty"] as const).map((option) => (
          <Link
            aria-current={state === option ? "page" : undefined}
            href={
              option === "busy" ? "/inspection" : `/inspection?state=${option}`
            }
            key={option}
          >
            {option}
          </Link>
        ))}
      </nav>
      <InspectionView dashboard={buildDemoInspectionDashboard(state)} />
    </div>
  );
}
