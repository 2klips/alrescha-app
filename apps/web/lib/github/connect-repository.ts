import {
  GITHUB_PR_PROPOSAL_PERMISSION,
  GITHUB_READ_ONLY_PERMISSIONS,
  requestInstallationToken,
  selectGitHubRepository,
} from "@arr/core";

import { createGitHubAppJwt } from "./api";
import { githubAppEnvironment } from "./env";
import { saveSelectedRepository } from "./onboarding-store";
import { createAdminClient } from "../supabase/admin";

export type ConnectSelectedRepositoryResult =
  | { ok: true; repositoryId: string }
  | { ok: false; error: "forbidden" | "github_installation_revoked" };

/**
 * Verifies live access with a repository-scoped installation token and
 * persists the selection. Shared by the picker form route and the URL
 * onboarding route so both paths enforce identical checks.
 */
export async function connectSelectedRepository(input: {
  actorUserId: string;
  githubRepositoryId: number;
  installationId: string;
  workspaceId: string;
}): Promise<ConnectSelectedRepositoryResult> {
  const admin = createAdminClient();
  const [installation, repository] = await Promise.all([
    admin
      .from("github_installations")
      .select("github_installation_id, permission_mode, revoked_at")
      .eq("id", input.installationId)
      .eq("workspace_id", input.workspaceId)
      .maybeSingle(),
    admin
      .from("github_available_repositories")
      .select("default_branch, full_name, github_repository_id")
      .eq("installation_id", input.installationId)
      .eq("workspace_id", input.workspaceId)
      .eq("github_repository_id", input.githubRepositoryId)
      .maybeSingle(),
  ]);
  if (installation.error || repository.error || !installation.data || !repository.data) {
    return { error: "forbidden", ok: false };
  }
  const installationData = installation.data;
  if (installationData.revoked_at) {
    return { error: "github_installation_revoked", ok: false };
  }

  const environment = githubAppEnvironment();
  const permissions =
    installationData.permission_mode === "read_with_pr_proposals"
      ? { ...GITHUB_READ_ONLY_PERMISSIONS, ...GITHUB_PR_PROPOSAL_PERMISSION }
      : GITHUB_READ_ONLY_PERMISSIONS;
  const selection = await selectGitHubRepository({
    installationId: input.installationId,
    repository: {
      defaultBranch: repository.data.default_branch,
      fullName: repository.data.full_name,
      githubRepositoryId: repository.data.github_repository_id,
    },
    saveSelection: (candidate) =>
      saveSelectedRepository({ ...candidate, actorUserId: input.actorUserId }),
    verifyCurrentAccess: async (repositoryId) => {
      await requestInstallationToken({
        appJwt: createGitHubAppJwt(environment.appId, environment.privateKey),
        installationId: installationData.github_installation_id,
        permissions,
        repositoryIds: [repositoryId],
      });
    },
    workspaceId: input.workspaceId,
  });

  return { ok: true, repositoryId: selection.repositoryId };
}
