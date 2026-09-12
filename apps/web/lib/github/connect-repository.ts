import {
  GITHUB_PR_PROPOSAL_PERMISSION,
  GITHUB_READ_ONLY_PERMISSIONS,
  requestInstallationToken,
  selectGitHubRepository,
} from "@alrescha/core";

import {
  createGitHubAppJwt,
  fetchDefaultBranchHead,
  type DefaultBranchHead,
} from "./api";
import { githubAppEnvironment } from "./env";
import { saveSelectedRepository } from "./onboarding-store";
import { createAdminClient } from "../supabase/admin";
import {
  resolveConnectHead,
  scheduleBackfillAtHead,
  type BackfillScanResult,
} from "./backfill-scan";

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
 *
 * The same token then reads the default branch's head, which is what the
 * backfill is keyed by: connect is two GitHub round trips (mint, read head)
 * and the scan is queued before the response leaves.
 */
export async function connectSelectedRepository(input: {
  actorUserId: string;
  githubRepositoryId: number;
  /**
   * The default branch's head, when the caller already knows it. Injected so
   * a replay or a test can skip the GitHub read; the routes leave it unset.
   */
  headCommitSha?: string | null;
  installationId: string;
  /** Test seam for the branch read; production uses the GitHub API. */
  readDefaultBranchHead?: (input: {
    branch: string;
    fullName: string;
    token: string;
  }) => Promise<DefaultBranchHead>;
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
  // Kept for the head read below and dropped with this call; it is never
  // stored (the connect screen's promise).
  let installationToken: string | null = null;
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
      const token = await requestInstallationToken({
        appJwt: createGitHubAppJwt(environment.appId, environment.privateKey),
        installationId: installationData.github_installation_id,
        permissions,
        repositoryIds: [repositoryId],
      });
      installationToken = token.token;
    },
    workspaceId: input.workspaceId,
  });

  const head = await resolveConnectHead({
    defaultBranch: repository.data.default_branch,
    fullName: repository.data.full_name,
    providedHead: input.headCommitSha,
    readHead:
      input.readDefaultBranchHead ??
      ((request) => fetchDefaultBranchHead(request)),
    token: installationToken,
  });
  const backfill = await scheduleBackfillAtHead({
    client: admin,
    head,
    repositoryId: selection.repositoryId,
    workspaceId: input.workspaceId,
  });

  return { backfill, ok: true, repositoryId: selection.repositoryId };
}
