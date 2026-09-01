"use client";

// Split out of onboarding-flow.tsx (QW-13, first-load JS): this module — and
// therefore the DashboardScreen + buildDashboardViewModel/graph-model import
// chain it pulls in — is only fetched once an onboarding visitor actually
// reaches the final step, via next/dynamic in onboarding-flow.tsx. Every
// earlier /onboarding step renders without downloading it.

import { buildDashboardViewModel } from "../../lib/dashboard/graph-model";
import { DashboardScreen } from "./dashboard-screen";

interface OnboardingDashboardStepProps {
  seededDemo: boolean;
}

export function OnboardingDashboardStep({
  seededDemo,
}: OnboardingDashboardStepProps) {
  return (
    <DashboardScreen
      model={buildDashboardViewModel(
        "scanned",
        seededDemo ? "alrescha/drifted-demo" : "2klips/arr-app",
      )}
    />
  );
}
