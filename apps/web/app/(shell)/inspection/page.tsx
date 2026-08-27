import Link from "next/link";

import {
  buildDemoInspectionDashboard,
  type DemoInspectionState,
} from "../../../lib/inspection/fixtures";
import { INSPECTION } from "../../../lib/strings";
import { InspectionView } from "../../ui/inspection-view";

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
    <>
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
    </>
  );
}
