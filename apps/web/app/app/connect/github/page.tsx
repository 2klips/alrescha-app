import { githubInstallationUrl } from "@specproof/core";
import { redirect } from "next/navigation";

import { getCurrentUserId } from "../../../../lib/auth/current-user";
import { githubAppEnvironment } from "../../../../lib/github/env";
import { createGitHubInstallState } from "../../../../lib/github/state";
import { createClient } from "../../../../lib/supabase/server";

export default async function ConnectGitHubPage() {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/auth/login");
  }

  const supabase = await createClient();
  const workspaceResult = await supabase.from("workspaces").select("id").limit(1).single();
  if (workspaceResult.error || !workspaceResult.data) {
    throw new Error("Personal workspace is unavailable.");
  }

  const environment = githubAppEnvironment();
  const state = createGitHubInstallState(environment.installStateSecret, {
    userId,
    workspaceId: workspaceResult.data.id,
  });
  const installationUrl = githubInstallationUrl(environment.appSlug, state);

  return (
    <main>
      <section className="shell" aria-labelledby="connect-title">
        <div className="eyebrow">GitHub App connection</div>
        <h1 id="connect-title">Connect a repository.</h1>
        <p>
          The default connection is read-only. You choose exactly which public
          or private repositories the GitHub App may access.
        </p>
        <ul>
          <li>Contents: read — transiently fetch specs, instructions, and code</li>
          <li>Checks: read — collect commit-linked verification results</li>
          <li>Actions: read — fetch selected test-report artifacts</li>
          <li>Metadata: read — identify repository and default branch</li>
        </ul>
        <p>
          Raw source and installation tokens are not stored. Arr stores
          metadata, digests, spans, findings, and receipts. Access events are
          retained for 30 days during the pilot.
        </p>
        <a className="button" href={installationUrl}>Install GitHub App</a>
        <p>
          PR proposals are off by default. Enabling them requests only
          <code> pull_requests:write</code>. Review the full boundary in
          {" "}<a href="/app/settings/privacy">Privacy &amp; data boundary</a>.
        </p>
      </section>
    </main>
  );
}
