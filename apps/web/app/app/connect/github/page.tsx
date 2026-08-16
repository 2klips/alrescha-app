import { githubInstallationUrl } from "@specproof/core";
import { redirect } from "next/navigation";

import { getCurrentUserId } from "../../../../lib/auth/current-user";
import { githubAppEnvironment } from "../../../../lib/github/env";
import { createGitHubInstallState } from "../../../../lib/github/state";
import { SETTINGS } from "../../../../lib/strings";
import { createClient } from "../../../../lib/supabase/server";

export default async function ConnectGitHubPage() {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/auth/login");
  }

  const supabase = await createClient();
  const workspaceResult = await supabase.from("workspaces").select("id").limit(1).single();
  if (workspaceResult.error || !workspaceResult.data) {
    throw new Error(SETTINGS.errors.workspaceUnavailable);
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
        <div className="eyebrow">{SETTINGS.connect.github.eyebrow}</div>
        <h1 id="connect-title">{SETTINGS.connect.github.title}</h1>
        <p>{SETTINGS.connect.github.intro}</p>
        <ul>
          <li>
            <code>{SETTINGS.connect.github.permissions.contentsRead.scope}</code>
            {" — "}
            {SETTINGS.connect.github.permissions.contentsRead.description}
          </li>
          <li>
            <code>{SETTINGS.connect.github.permissions.checksRead.scope}</code>
            {" — "}
            {SETTINGS.connect.github.permissions.checksRead.description}
          </li>
          <li>
            <code>{SETTINGS.connect.github.permissions.actionsRead.scope}</code>
            {" — "}
            {SETTINGS.connect.github.permissions.actionsRead.description}
          </li>
          <li>
            <code>{SETTINGS.connect.github.permissions.metadataRead.scope}</code>
            {" — "}
            {SETTINGS.connect.github.permissions.metadataRead.description}
          </li>
        </ul>
        <p>{SETTINGS.connect.github.storageNote}</p>
        <a className="button" href={installationUrl}>{SETTINGS.connect.github.install}</a>
        <p>
          {SETTINGS.connect.github.prNotePrefix}
          <code>{SETTINGS.connect.github.prWritePermission}</code>
          {SETTINGS.connect.github.prNoteMid}
          <a href="/app/settings/privacy">{SETTINGS.privacy.linkLabel}</a>
          {SETTINGS.connect.github.prNoteSuffix}
        </p>
      </section>
    </main>
  );
}
