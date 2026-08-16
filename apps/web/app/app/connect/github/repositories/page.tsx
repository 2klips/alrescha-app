import { redirect } from "next/navigation";

import { getCurrentUserId } from "../../../../../lib/auth/current-user";
import { SETTINGS } from "../../../../../lib/strings";
import { createClient } from "../../../../../lib/supabase/server";

export default async function SelectRepositoryPage({
  searchParams,
}: {
  searchParams: Promise<{ installation?: string }>;
}) {
  if (!(await getCurrentUserId())) {
    redirect("/auth/login");
  }
  const { installation } = await searchParams;
  if (!installation) {
    redirect("/app/connect/github");
  }

  const supabase = await createClient();
  const result = await supabase
    .from("github_available_repositories")
    .select("default_branch, full_name, github_repository_id, installation_id")
    .eq("installation_id", installation)
    .order("full_name");

  return (
    <main>
      <section className="shell" aria-labelledby="repository-title">
        <div className="eyebrow">{SETTINGS.connect.repositories.eyebrow}</div>
        <h1 id="repository-title">{SETTINGS.connect.repositories.title}</h1>
        <p>{SETTINGS.connect.repositories.intro}</p>
        {result.data?.map((repository) => (
          <form action="/api/github/repositories" method="post" key={repository.github_repository_id}>
            <input name="installationId" type="hidden" value={repository.installation_id} />
            <input name="githubRepositoryId" type="hidden" value={repository.github_repository_id} />
            <button className="button" type="submit">{repository.full_name}</button>
          </form>
        ))}
        {!result.data?.length ? (
          <p role="status">{SETTINGS.connect.repositories.empty}</p>
        ) : null}
      </section>
    </main>
  );
}
