import { redirect } from "next/navigation";

import { getCurrentUserId } from "../../../../lib/auth/current-user";
import { SETTINGS } from "../../../../lib/strings";
import { PrivacyBoundary } from "./privacy-boundary";

export default async function PrivacySettingsPage() {
  if (!(await getCurrentUserId())) redirect("/auth/login");

  return (
    <main className="mcp-settings-shell">
      <header>
        <div className="eyebrow">{SETTINGS.privacy.eyebrow}</div>
        <h1>{SETTINGS.privacy.title}</h1>
        <p>{SETTINGS.privacy.intro}</p>
      </header>
      <PrivacyBoundary />
    </main>
  );
}
