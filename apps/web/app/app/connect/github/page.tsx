import { githubInstallationUrl } from "@arr/core";
import { redirect } from "next/navigation";

import { getCurrentUserId } from "../../../../lib/auth/current-user";
import { githubAppEnvironment } from "../../../../lib/github/env";
import { createGitHubInstallState } from "../../../../lib/github/state";
import { SETTINGS } from "../../../../lib/strings";
import { createClient } from "../../../../lib/supabase/server";

function urlStatusMessage(input: {
  repository: string | undefined;
  urlStatus: string | undefined;
}): string | null {
  const statuses = SETTINGS.connect.github.urlConnect.statuses;
  const repository = input.repository ?? "";
  switch (input.urlStatus) {
    case "invalid_url":
      return statuses.invalidUrl;
    case "already_connected":
      return statuses.alreadyConnected(repository);
    case "no_access":
      return statuses.noAccess(repository);
    case "private_or_missing":
      return statuses.privateOrMissing(repository);
    case "install":
      return statuses.install(repository);
    default:
      return null;
  }
}

export default async function ConnectGitHubPage({
  searchParams,
}: {
  searchParams: Promise<{
    repository?: string;
    repository_id?: string;
    url_status?: string;
  }>;
}) {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/auth/login");
  }
  const {
    repository,
    repository_id: repositoryIdHint,
    url_status: urlStatus,
  } = await searchParams;

  const supabase = await createClient();
  const workspaceResult = await supabase
    .from("workspaces")
    .select("id")
    .limit(1)
    .single();
  if (workspaceResult.error || !workspaceResult.data) {
    throw new Error(SETTINGS.errors.workspaceUnavailable);
  }

  const environment = githubAppEnvironment();
  const state = createGitHubInstallState(environment.installStateSecret, {
    ...(repository ? { repositoryFullName: repository } : {}),
    userId,
    workspaceId: workspaceResult.data.id,
  });
  const suggestedRepositoryId = Number(repositoryIdHint);
  const installationUrl = githubInstallationUrl(environment.appSlug, state, {
    repositoryIds:
      Number.isSafeInteger(suggestedRepositoryId) && suggestedRepositoryId > 0
        ? [suggestedRepositoryId]
        : [],
  });
  const statusMessage = urlStatusMessage({ repository, urlStatus });

  return (
    <main>
      <section className="shell" aria-labelledby="connect-title">
        <div className="eyebrow">{SETTINGS.connect.github.eyebrow}</div>
        <h1 id="connect-title">{SETTINGS.connect.github.title}</h1>
        <p>{SETTINGS.connect.github.intro}</p>
        <ul>
          <li>
            <code>
              {SETTINGS.connect.github.permissions.contentsRead.scope}
            </code>
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
            <code>
              {SETTINGS.connect.github.permissions.metadataRead.scope}
            </code>
            {" — "}
            {SETTINGS.connect.github.permissions.metadataRead.description}
          </li>
        </ul>
        <p>{SETTINGS.connect.github.storageNote}</p>
        <fieldset>
          <legend>{SETTINGS.connect.github.urlConnect.legend}</legend>
          <p>{SETTINGS.connect.github.urlConnect.description}</p>
          {statusMessage ? <p role="status">{statusMessage}</p> : null}
          <form action="/api/github/repositories/url" method="post">
            <label>
              {SETTINGS.connect.github.urlConnect.label}
              <input
                defaultValue={repository ?? ""}
                name="repositoryUrl"
                placeholder={SETTINGS.connect.github.urlConnect.placeholder}
                type="text"
              />
            </label>
            <button className="button" type="submit">
              {SETTINGS.connect.github.urlConnect.submit}
            </button>
          </form>
          {urlStatus === "install" || urlStatus === "private_or_missing" ? (
            <a className="button" href={installationUrl}>
              {SETTINGS.connect.github.urlConnect.installCta}
            </a>
          ) : null}
        </fieldset>
        <a className="button" href={installationUrl}>
          {SETTINGS.connect.github.install}
        </a>
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
