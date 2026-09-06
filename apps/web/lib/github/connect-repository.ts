import {
  GITHUB_PR_PROPOSAL_PERMISSION,
  GITHUB_READ_ONLY_PERMISSIONS,
  requestInstallationToken,
  selectGitHubRepository,
} from "@alrescha/core";

import { createGitHubAppJwt } from "./api";
import { githubAppEnvironment } from "./env";
import { saveSelectedRepository } from "./onboarding-store";
import { createAdminClient } from "../supabase/admin";
import { scheduleBackfillScan, type BackfillScanResult } from "./backfill-scan";

export type ConnectSelectedRepositoryResult =
  | {
      /**
       * Whether the first scan was queued (Phase 4 Wave C todo 16). A
       * connect succeeds either way: a repository that is connected but not
       * yet scanned is a state the product already reports
       * (`structure: building`), while failing the connect after the row was
       * written would leave a half-finished setup with no way to retry.
       */
      backfill: BackfillScanResult;
      ok: true;
      repositoryId: string;
    }
  | { ok: false; error: "forbidden" | "github_installation_revoked" };

/**
 * Verifies live access with a repository-scoped installation token and
 * persists the selection. Shared by the picker form route and the URL
 * onboarding route so both paths enforce identical checks.
 */
export async function connectSelectedRepository(input: {
  actorUserId: string;
  githubRepositoryId: number;
  /**
   * The default branch's head, when the caller knows it. Injected rather
   * than fetched here so the connect path stays one GitHub round trip and
   * the scheduling decision is testable without a live installation.
   */
  headCommitSha?: string | null;
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
  if (
    installation.error ||
    repository.error ||
    !installation.data ||
    !repository.data
  ) {
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

  const backfill = await scheduleBackfillScan({
    client: admin,
    headCommitSha: input.headCommitSha ?? null,
    repositoryId: selection.repositoryId,
    workspaceId: input.workspaceId,
  });

  return { backfill, ok: true, repositoryId: selection.repositoryId };
}
