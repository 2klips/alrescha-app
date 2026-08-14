import { GITHUB_READ_ONLY_PERMISSIONS, type GitHubPermissions, assertMinimalGitHubPermissions } from "./app-permissions";

export const GITHUB_API_VERSION = "2026-03-10";

export interface InstallationTokenRequest {
  readonly appJwt: string;
  readonly fetchImplementation?: typeof fetch;
  readonly installationId: number;
  readonly permissions?: GitHubPermissions;
  readonly repositoryIds: readonly number[];
}

export interface InstallationToken {
  readonly expiresAt: string;
  readonly token: string;
}

export async function requestInstallationToken({
  appJwt,
  fetchImplementation = fetch,
  installationId,
  permissions = GITHUB_READ_ONLY_PERMISSIONS,
  repositoryIds,
}: InstallationTokenRequest): Promise<InstallationToken> {
  assertMinimalGitHubPermissions(permissions, permissions.pull_requests === "write");

  if (!Number.isSafeInteger(installationId) || installationId <= 0) {
    throw new Error("GitHub installation id must be a positive safe integer.");
  }
  if (repositoryIds.length === 0 || repositoryIds.length > 500) {
    throw new Error("Installation tokens must be scoped to 1–500 repositories.");
  }

  const response = await fetchImplementation(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      body: JSON.stringify({ permissions, repository_ids: repositoryIds }),
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${appJwt}`,
        "content-type": "application/json",
        "x-github-api-version": GITHUB_API_VERSION,
      },
      method: "POST",
    },
  );

  if (!response.ok) {
    throw new Error(`GitHub installation token request failed: ${response.status}`);
  }

  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null || !("token" in body) || !("expires_at" in body)) {
    throw new Error("GitHub installation token response is malformed.");
  }

  const token = body.token;
  const expiresAt = body.expires_at;
  if (typeof token !== "string" || token.length === 0 || typeof expiresAt !== "string") {
    throw new Error("GitHub installation token response is malformed.");
  }

  return { expiresAt, token };
}
