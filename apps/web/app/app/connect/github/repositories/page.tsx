import { redirect } from "next/navigation";

import { getCurrentUserId } from "../../../../../lib/auth/current-user";
import { SETTINGS } from "../../../../../lib/strings";
import { createClient } from "../../../../../lib/supabase/server";

export default async function SelectRepositoryPage({
  searchParams,
}: {
  searchParams: Promise<{ installation?: string; repository?: string }>;
}) {
  if (!(await getCurrentUserId())) {
    redirect("/auth/login");
  }
  const { installation, repository: suggestedFullName } = await searchParams;
  if (!installation) {
    redirect("/app/connect/github");
  }

  const supabase = await createClient();
  const result = await supabase
    .from("github_available_repositories")
    .select("default_branch, full_name, github_repository_id, installation_id")
    .eq("installation_id", installation)
    .order("full_name");
  // The repository pasted during URL onboarding is listed first.
  const repositories = [...(result.data ?? [])].sort((left, right) =>
    left.full_name === suggestedFullName ? -1 : right.full_name === suggestedFullName ? 1 : 0,
  );

  return (
    <main>
      <section className="shell" aria-labelledby="repository-title">
        <div className="eyebrow">{SETTINGS.connect.repositories.eyebrow}</div>
        <h1 id="repository-title">{SETTINGS.connect.repositories.title}</h1>
        <p>{SETTINGS.connect.repositories.intro}</p>
        {repositories.map((repository) => (
          <form action="/api/github/repositories" method="post" key={repository.github_repository_id}>
            <input name="installationId" type="hidden" value={repository.installation_id} />
            <input name="githubRepositoryId" type="hidden" value={repository.github_repository_id} />
            <button className="button" type="submit">{repository.full_name}</button>
            {repository.full_name === suggestedFullName ? (
              <p role="note">{SETTINGS.connect.repositories.suggested}</p>
            ) : null}
          </form>
        ))}
        {!repositories.length ? (
          <p role="status">{SETTINGS.connect.repositories.empty}</p>
        ) : null}
      </section>
    </main>
  );
}
