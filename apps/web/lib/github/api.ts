import { createSign } from "node:crypto";

import {
  GITHUB_API_VERSION,
  type GitHubPermissionLevel,
  type GitHubRepositoryChoice,
  type VerifiedGitHubInstallation,
} from "@alrescha/core";

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

/** What the default branch points at, or why that could not be read. */
export type DefaultBranchHead = { sha: string } | { error: string };

/**
 * The head commit of a branch, read with the installation token the connect
 * flow already mints (Phase 4 Wave C todo 16).
 *
 * This is the one GitHub call that turns "connected" into "scanning": the
 * backfill is keyed by the head sha, and until something read it every
 * connect answered `scheduled: false` with "the repository's head commit is
 * unknown". It returns rather than throws — a connect must not fail over a
 * scan that can be requested again from the home screen.
 */
export async function fetchDefaultBranchHead(
  input: { branch: string; fullName: string; token: string },
  fetchImplementation: typeof fetch = fetch,
): Promise<DefaultBranchHead> {
  const url = `https://api.github.com/repos/${input.fullName}/branches/${encodeURIComponent(input.branch)}`;
  let response: Response;
  try {
    response = await fetchImplementation(url, {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${input.token}`,
        "x-github-api-version": GITHUB_API_VERSION,
      },
    });
  } catch (error) {
    return {
      error: `GitHub branch request failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
  if (!response.ok) {
    // 404 is what an empty repository answers for its default branch — a
    // repository with no commit has no head, and nothing to scan at.
    return { error: `GitHub branch request failed: ${response.status}` };
  }
  const body = (await response.json()) as { commit?: { sha?: unknown } };
  const sha = body.commit?.sha;
  if (typeof sha !== "string" || !/^[0-9a-f]{40}$/.test(sha)) {
    return { error: "GitHub branch response is malformed." };
  }
  return { sha };
}

/**
 * GitHub's current record of a repository, read by its stable id, or why it
 * could not be read.
 */
export type RepositoryRecord =
  { repository: GitHubRepositoryChoice } | { error: string };

/**
 * The repository as GitHub names it *now*, read by the numeric id the
 * installation token was just scoped to (PR #10 follow-up).
 *
 * The picker lists `github_available_repositories`, an inventory written
 * once when the App was installed and never refreshed — so a repository
 * renamed on GitHub kept its old label there, and selecting it copied that
 * label into `repositories.full_name` over the canonical one. The id is the
 * identity (a rename keeps it; GitHub's own redirect for a renamed
 * repository lands on `/repositories/{id}`), so the read goes by id and the
 * answer is refused unless it names that same id. Returns rather than
 * throws: a connect must not fail over a name it can still keep, and the
 * caller says which of the two it stored.
 */
export async function fetchRepositoryById(
  input: { githubRepositoryId: number; token: string },
  fetchImplementation: typeof fetch = fetch,
): Promise<RepositoryRecord> {
  let response: Response;
  try {
    response = await fetchImplementation(
      `https://api.github.com/repositories/${input.githubRepositoryId}`,
      {
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${input.token}`,
          "x-github-api-version": GITHUB_API_VERSION,
        },
      },
    );
  } catch (error) {
    return {
      error: `GitHub repository request failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
  if (!response.ok) {
    return { error: `GitHub repository request failed: ${response.status}` };
  }
  let repository: GitHubRepositoryChoice;
  try {
    repository = repositoryChoice(await response.json());
  } catch {
    return { error: "GitHub repository response is malformed." };
  }
  if (repository.githubRepositoryId !== input.githubRepositoryId) {
    return { error: "GitHub repository response names another repository." };
  }
  return { repository };
}

/**
 * Finds an installation already allowed to read a repository. A 404 means
 * this GitHub App is not installed for the repository.
 */
export async function lookupGitHubRepositoryInstallation(
  fullName: string,
  appJwt: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<{ githubInstallationId: number } | null> {
  const response = await fetchImplementation(
    `https://api.github.com/repos/${fullName}/installation`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${appJwt}`,
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
      },
    },
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      `GitHub repository installation lookup failed with status ${response.status}.`,
    );
  }
  const body = (await response.json()) as { id?: unknown };
  if (
    typeof body.id !== "number" ||
    !Number.isSafeInteger(body.id) ||
    body.id <= 0
  ) {
    throw new Error("GitHub repository installation response is malformed.");
  }
  return { githubInstallationId: body.id };
}
