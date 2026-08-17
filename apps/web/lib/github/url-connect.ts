import { parseGitHubRepositoryUrl, type GitHubRepositoryUrlFailure } from "@arr/core";

/**
 * Decides what happens when a user pastes a repository URL during
 * onboarding (BUILD_PLAN_PHASE2B todo 1). Pure decision logic with
 * injected lookups so route tests cover every failure state without
 * touching GitHub or the database.
 */

export interface UrlConnectDependencies {
  /** Connects an installed repository right away; returns its id. */
  connectRepository: (input: {
    githubRepositoryId: number;
    installationId: string;
  }) => Promise<string>;
  /** Available (installed, not necessarily selected) repo in this workspace. */
  findAvailableRepository: (
    workspaceId: string,
    fullName: string,
  ) => Promise<{ githubRepositoryId: number; installationId: string } | null>;
  /** Already-selected repository in this workspace. */
  findConnectedRepository: (workspaceId: string, fullName: string) => Promise<boolean>;
  /** Whether the workspace has any GitHub App installation. */
  hasInstallation: (workspaceId: string) => Promise<boolean>;
  /**
   * Unauthenticated public-repository lookup. Returns the numeric GitHub id
   * for the install-screen pre-selection hint, or null when the repository
   * is private or does not exist (GitHub does not distinguish the two).
   */
  lookupPublicRepository: (fullName: string) => Promise<{ githubRepositoryId: number } | null>;
}

export type UrlConnectOutcome =
  | { kind: "invalid_url"; reason: GitHubRepositoryUrlFailure }
  | { kind: "already_connected"; fullName: string }
  | { kind: "connected"; fullName: string; repositoryId: string }
  /** Installation exists but the App was not granted this repository. */
  | { kind: "no_access"; fullName: string }
  /** No installation; public repo id resolved for pre-selection. */
  | { kind: "install"; fullName: string; githubRepositoryId: number | null }
  /** No installation and GitHub returned 404 — private or nonexistent. */
  | { kind: "private_or_missing"; fullName: string };

export async function decideUrlConnect(
  input: { repositoryUrl: string; workspaceId: string },
  dependencies: UrlConnectDependencies,
): Promise<UrlConnectOutcome> {
  const parsed = parseGitHubRepositoryUrl(input.repositoryUrl);
  if (!parsed.ok) {
    return { kind: "invalid_url", reason: parsed.reason };
  }

  if (await dependencies.findConnectedRepository(input.workspaceId, parsed.fullName)) {
    return { fullName: parsed.fullName, kind: "already_connected" };
  }

  const available = await dependencies.findAvailableRepository(input.workspaceId, parsed.fullName);
  if (available) {
    const repositoryId = await dependencies.connectRepository(available);
    return { fullName: parsed.fullName, kind: "connected", repositoryId };
  }

  if (await dependencies.hasInstallation(input.workspaceId)) {
    // The App is installed but this repository was not granted to it.
    return { fullName: parsed.fullName, kind: "no_access" };
  }

  const publicRepository = await dependencies.lookupPublicRepository(parsed.fullName);
  if (!publicRepository) {
    return { fullName: parsed.fullName, kind: "private_or_missing" };
  }
  return {
    fullName: parsed.fullName,
    githubRepositoryId: publicRepository.githubRepositoryId,
    kind: "install",
  };
}
