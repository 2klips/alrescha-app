import {
  assertMinimalGitHubPermissions,
  type GitHubPermissions,
} from "./app-permissions";

export interface GitHubRepositoryChoice {
  readonly defaultBranch: string;
  readonly fullName: string;
  readonly githubRepositoryId: number;
}

export interface VerifiedGitHubInstallation {
  readonly accountId: number;
  readonly accountLogin: string;
  readonly githubInstallationId: number;
  readonly permissions: GitHubPermissions;
  readonly repositories: readonly GitHubRepositoryChoice[];
}

export interface GitHubOnboardingStore {
  savePendingInstallation(input: {
    installation: VerifiedGitHubInstallation;
    permissionMode: "read_only" | "read_with_pr_proposals";
    workspaceId: string;
  }): Promise<{ installationId: string }>;
}

export async function prepareGitHubOnboarding(input: {
  readonly getVerifiedInstallation: () => Promise<VerifiedGitHubInstallation>;
  readonly store: GitHubOnboardingStore;
  readonly workspaceId: string;
}): Promise<{ installationId: string; repositoryCount: number }> {
  const installation = await input.getVerifiedInstallation();
  const allowsPrProposals = installation.permissions.pull_requests === "write";
  assertMinimalGitHubPermissions(installation.permissions, allowsPrProposals);

  if (installation.repositories.length === 0) {
    throw new Error("GitHub installation exposes no repositories.");
  }

  const saved = await input.store.savePendingInstallation({
    installation,
    permissionMode: allowsPrProposals ? "read_with_pr_proposals" : "read_only",
    workspaceId: input.workspaceId,
  });

  return {
    installationId: saved.installationId,
    repositoryCount: installation.repositories.length,
  };
}

export async function selectGitHubRepository(input: {
  readonly installationId: string;
  readonly repository: GitHubRepositoryChoice;
  readonly saveSelection: (selection: {
    installationId: string;
    repository: GitHubRepositoryChoice;
    workspaceId: string;
  }) => Promise<{ repositoryId: string }>;
  readonly verifyCurrentAccess: (githubRepositoryId: number) => Promise<void>;
  readonly workspaceId: string;
}): Promise<{ repositoryId: string; status: "pending_first_scan" }> {
  await input.verifyCurrentAccess(input.repository.githubRepositoryId);
  const selected = await input.saveSelection({
    installationId: input.installationId,
    repository: input.repository,
    workspaceId: input.workspaceId,
  });

  return { repositoryId: selected.repositoryId, status: "pending_first_scan" };
}
