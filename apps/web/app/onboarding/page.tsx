import { OnboardingFlow } from "../ui/onboarding-flow";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ permission?: string }>;
}) {
  const { permission } = await searchParams;
  return <OnboardingFlow initialPermissionError={permission === "error"} />;
}
