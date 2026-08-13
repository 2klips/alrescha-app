export const GITHUB_READ_ONLY_PERMISSIONS = {
  actions: "read",
  checks: "read",
  contents: "read",
  metadata: "read",
} as const;

export const GITHUB_PR_PROPOSAL_PERMISSION = {
  pull_requests: "write",
} as const;

export const GITHUB_WEBHOOK_EVENTS = [
  "push",
  "check_run",
  "workflow_run",
  "installation",
] as const;

export type GitHubPermissionLevel = "read" | "write";
export type GitHubPermissions = Readonly<Record<string, GitHubPermissionLevel>>;

export function assertMinimalGitHubPermissions(
  permissions: GitHubPermissions,
  allowPullRequestProposals = false,
): void {
  const expected: GitHubPermissions = allowPullRequestProposals
    ? { ...GITHUB_READ_ONLY_PERMISSIONS, ...GITHUB_PR_PROPOSAL_PERMISSION }
    : GITHUB_READ_ONLY_PERMISSIONS;
  const actualEntries = Object.entries(permissions).sort(([left], [right]) => left.localeCompare(right));
  const expectedEntries = Object.entries(expected).sort(([left], [right]) => left.localeCompare(right));

  if (JSON.stringify(actualEntries) !== JSON.stringify(expectedEntries)) {
    throw new Error(
      `GitHub App permissions exceed the ${allowPullRequestProposals ? "PR-proposal" : "read-only"} profile.`,
    );
  }
}

export function githubInstallationUrl(appSlug: string, state: string): string {
  if (!/^[a-z0-9-]+$/.test(appSlug)) {
    throw new Error("GitHub App slug is invalid.");
  }

  const url = new URL(`https://github.com/apps/${appSlug}/installations/new`);
  url.searchParams.set("state", state);
  return url.toString();
}
