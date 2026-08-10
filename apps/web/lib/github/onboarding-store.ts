import type {
  GitHubOnboardingStore,
  GitHubRepositoryChoice,
} from "@specproof/core";

import { createAdminClient } from "../supabase/admin";

export function createGitHubOnboardingStore(): GitHubOnboardingStore {
  const admin = createAdminClient();

  return {
    async savePendingInstallation({ installation, permissionMode, workspaceId }) {
      const existing = await admin
        .from("github_installations")
        .select("id, workspace_id")
        .eq("github_installation_id", installation.githubInstallationId)
        .maybeSingle();
      if (existing.error) {
        throw new Error(`Failed to inspect GitHub installation: ${existing.error.code}`);
      }
      if (existing.data && existing.data.workspace_id !== workspaceId) {
        throw new Error("GitHub installation is already linked to another workspace.");
      }

      const saved = existing.data
        ? await admin
            .from("github_installations")
            .update({
              account_id: installation.accountId,
              account_login: installation.accountLogin,
              permission_mode: permissionMode,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.data.id)
            .select("id")
            .single()
        : await admin
            .from("github_installations")
            .insert({
              account_id: installation.accountId,
              account_login: installation.accountLogin,
              github_installation_id: installation.githubInstallationId,
              permission_mode: permissionMode,
              workspace_id: workspaceId,
            })
            .select("id")
            .single();
      if (saved.error || !saved.data) {
        throw new Error(`Failed to save GitHub installation: ${saved.error?.code ?? "unknown"}`);
      }

      const rows = installation.repositories.map((repository) => ({
        default_branch: repository.defaultBranch,
        full_name: repository.fullName,
        github_repository_id: repository.githubRepositoryId,
        installation_id: saved.data.id,
        observed_at: new Date().toISOString(),
        workspace_id: workspaceId,
      }));
      const repositories = await admin.from("github_available_repositories").upsert(rows, {
        onConflict: "workspace_id,installation_id,github_repository_id",
      });
      if (repositories.error) {
        throw new Error(`Failed to save available repositories: ${repositories.error.code}`);
      }

      return { installationId: saved.data.id };
    },
  };
}

export async function saveSelectedRepository(input: {
  installationId: string;
  repository: GitHubRepositoryChoice;
  workspaceId: string;
}): Promise<{ repositoryId: string }> {
  const admin = createAdminClient();
  const saved = await admin
    .from("repositories")
    .upsert(
      {
        default_branch: input.repository.defaultBranch,
        full_name: input.repository.fullName,
        github_repository_id: input.repository.githubRepositoryId,
        installation_id: input.installationId,
        selected_at: new Date().toISOString(),
        workspace_id: input.workspaceId,
      },
      { onConflict: "workspace_id,github_repository_id" },
    )
    .select("id")
    .single();
  if (saved.error || !saved.data) {
    throw new Error(`Failed to select GitHub repository: ${saved.error?.code ?? "unknown"}`);
  }
  return { repositoryId: saved.data.id };
}
