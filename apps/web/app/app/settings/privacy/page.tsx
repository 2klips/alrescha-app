import { redirect } from "next/navigation";

import { getCurrentUserId } from "../../../../lib/auth/current-user";
import { PrivacyBoundary } from "./privacy-boundary";

export default async function PrivacySettingsPage() {
  if (!(await getCurrentUserId())) redirect("/auth/login");

  return (
    <main className="mcp-settings-shell">
      <header>
        <div className="eyebrow">Security · privacy · retention</div>
        <h1>Privacy &amp; data boundary</h1>
        <p>
          Exact permissions, persistence, secret handling, retention, and
          credit behavior for a pilot workspace.
        </p>
      </header>
      <PrivacyBoundary />
    </main>
  );
}
