import { createSign } from "node:crypto";

import {
  GITHUB_API_VERSION,
  type GitHubPermissionLevel,
  type GitHubRepositoryChoice,
  type VerifiedGitHubInstallation,
} from "@arr/core";

function encoded(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function createGitHubAppJwt(
  appId: string,
  privateKey: string,
  now = Date.now(),
): string {
  const issuedAt = Math.floor(now / 1000) - 60;
  const unsigned = `${encoded({ alg: "RS256", typ: "JWT" })}.${encoded({
    exp: issuedAt + 10 * 60,
    iat: issuedAt,
    iss: appId,
  })}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${signer.sign(privateKey).toString("base64url")}`;
}

async function githubJson(url: string, token: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": GITHUB_API_VERSION,
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub API request failed: ${response.status}`);
  }
  return response.json() as Promise<unknown>;
}

export async function exchangeGitHubAppUserCode(input: {
  clientId: string;
  clientSecret: string;
  code: string;
}): Promise<string> {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    body: JSON.stringify({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      code: input.code,
    }),
    headers: { accept: "application/json", "content-type": "application/json" },
    method: "POST",
  });
  const body: unknown = await response.json();
  if (
    !response.ok ||
    typeof body !== "object" ||
    body === null ||
    !("access_token" in body) ||
    typeof body.access_token !== "string"
  ) {
    throw new Error("GitHub App user authorization failed.");
  }
  return body.access_token;
}

function repositoryChoice(value: unknown): GitHubRepositoryChoice {
  if (typeof value !== "object" || value === null) {
    throw new Error("GitHub repository response is malformed.");
  }
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.id !== "number" ||
    typeof candidate.full_name !== "string" ||
    typeof candidate.default_branch !== "string"
  ) {
    throw new Error("GitHub repository response is malformed.");
  }
  return {
    defaultBranch: candidate.default_branch,
    fullName: candidate.full_name,
    githubRepositoryId: candidate.id,
  };
}

export async function getVerifiedUserInstallation(input: {
  appJwt: string;
  installationId: number;
  userAccessToken: string;
}): Promise<VerifiedGitHubInstallation> {
  const [installationBody, repositoriesBody] = await Promise.all([
    githubJson(
      `https://api.github.com/app/installations/${input.installationId}`,
      input.appJwt,
    ),
    githubJson(
      `https://api.github.com/user/installations/${input.installationId}/repositories?per_page=100`,
      input.userAccessToken,
    ),
  ]);

  if (
    typeof installationBody !== "object" ||
    installationBody === null ||
    typeof repositoriesBody !== "object" ||
    repositoriesBody === null
  ) {
    throw new Error("GitHub installation response is malformed.");
  }
  const installation = installationBody as Record<string, unknown>;
  const repositoryResponse = repositoriesBody as Record<string, unknown>;
  const account = installation.account as Record<string, unknown> | undefined;
  const permissionValues = installation.permissions as
    Record<string, unknown> | undefined;
  if (
    installation.id !== input.installationId ||
    !account ||
    typeof account.id !== "number" ||
    typeof account.login !== "string" ||
    !permissionValues ||
    !Array.isArray(repositoryResponse.repositories)
  ) {
    throw new Error("GitHub installation response is malformed.");
  }

  const permissions: Record<string, GitHubPermissionLevel> = {};
  for (const [name, level] of Object.entries(permissionValues)) {
    if (level !== "read" && level !== "write") {
      throw new Error("GitHub installation permission response is malformed.");
    }
    permissions[name] = level;
  }

  return {
    accountId: account.id,
    accountLogin: account.login,
    githubInstallationId: input.installationId,
    permissions,
    repositories: repositoryResponse.repositories.map(repositoryChoice),
  };
}

/**
 * Unauthenticated public-repository lookup for the URL onboarding path.
 * Returns the numeric repository id used to pre-select the repository on
 * GitHub's install screen, or null when GitHub answers 404 — which covers
 * both private and nonexistent repositories (GitHub does not distinguish
 * them for anonymous callers).
 */
export async function lookupPublicGitHubRepository(
  fullName: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<{ githubRepositoryId: number } | null> {
  const response = await fetchImplementation(
    `https://api.github.com/repos/${fullName}`,
    { headers: { Accept: "application/vnd.github+json" } },
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      `GitHub repository lookup failed with status ${response.status}.`,
    );
  }
  const body = (await response.json()) as { id?: unknown };
  if (
    typeof body.id !== "number" ||
    !Number.isSafeInteger(body.id) ||
    body.id <= 0
  ) {
    throw new Error("GitHub repository lookup response is malformed.");
  }
  return { githubRepositoryId: body.id };
}
