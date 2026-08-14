import { GITHUB_API_VERSION } from "@specproof/core";

export interface MinimalIndexSource {
  readonly agentsContent: string | null;
  readonly baseSha: string;
  readonly claudeContent: string | null;
}

function repositoryApiPath(fullName: string): string {
  const parts = fullName.split("/");

  if (parts.length !== 2 || parts.some((part) => !part)) {
    throw new TypeError(
      "GitHub repository full name must be owner/repository.",
    );
  }

  return parts.map(encodeURIComponent).join("/");
}

async function githubRequest(
  url: string,
  token: string,
  fetchImplementation: typeof fetch,
) {
  return fetchImplementation(url, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": GITHUB_API_VERSION,
    },
  });
}

async function readTextFile(input: {
  branch: string;
  fetchImplementation: typeof fetch;
  path: "AGENTS.md" | "CLAUDE.md";
  repository: string;
  token: string;
}): Promise<string | null> {
  const url = new URL(
    `https://api.github.com/repos/${repositoryApiPath(input.repository)}/contents/${input.path}`,
  );
  url.searchParams.set("ref", input.branch);
  const response = await githubRequest(
    url.toString(),
    input.token,
    input.fetchImplementation,
  );

  if (response.status === 404) return null;
  if (!response.ok)
    throw new Error(`GitHub contents read failed: ${response.status}`);

  const body: unknown = await response.json();
  if (
    typeof body !== "object" ||
    body === null ||
    !("encoding" in body) ||
    body.encoding !== "base64" ||
    !("content" in body) ||
    typeof body.content !== "string"
  ) {
    throw new Error("GitHub contents response is malformed.");
  }

  return Buffer.from(body.content.replaceAll(/\s/g, ""), "base64").toString(
    "utf8",
  );
}

export async function readMinimalIndexSource(input: {
  readonly branch: string;
  readonly fetchImplementation?: typeof fetch;
  readonly repository: string;
  readonly token: string;
}): Promise<MinimalIndexSource> {
  const fetchImplementation = input.fetchImplementation ?? fetch;
  const refUrl = `https://api.github.com/repos/${repositoryApiPath(input.repository)}/git/ref/heads/${encodeURIComponent(input.branch)}`;
  const [refResponse, agentsContent, claudeContent] = await Promise.all([
    githubRequest(refUrl, input.token, fetchImplementation),
    readTextFile({ ...input, fetchImplementation, path: "AGENTS.md" }),
    readTextFile({ ...input, fetchImplementation, path: "CLAUDE.md" }),
  ]);

  if (!refResponse.ok)
    throw new Error(`GitHub branch read failed: ${refResponse.status}`);
  const refBody: unknown = await refResponse.json();
  if (
    typeof refBody !== "object" ||
    refBody === null ||
    !("object" in refBody) ||
    typeof refBody.object !== "object" ||
    refBody.object === null ||
    !("sha" in refBody.object) ||
    typeof refBody.object.sha !== "string" ||
    !/^[0-9a-f]{40}$/.test(refBody.object.sha)
  ) {
    throw new Error("GitHub branch response is malformed.");
  }

  return { agentsContent, baseSha: refBody.object.sha, claudeContent };
}
