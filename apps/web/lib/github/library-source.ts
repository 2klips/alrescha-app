import { GITHUB_API_VERSION } from "@alrescha/core";

function repositoryApiPath(fullName: string): string {
  const parts = fullName.split("/");
  if (parts.length !== 2 || parts.some((part) => !part)) {
    throw new TypeError(
      "GitHub repository full name must be owner/repository.",
    );
  }
  return parts.map(encodeURIComponent).join("/");
}

function contentApiPath(inputPath: string): string {
  const path = inputPath.trim().replaceAll("\\", "/");
  if (!path || path.startsWith("/") || path.split("/").includes("..")) {
    throw new TypeError("GitHub source path must be repository-relative.");
  }
  return path.split("/").map(encodeURIComponent).join("/");
}

export async function readHarnessAssetSource(input: {
  readonly commitSha: string;
  readonly fetchImplementation?: typeof fetch;
  readonly path: string;
  readonly repository: string;
  readonly token: string;
}): Promise<string> {
  if (!/^[0-9a-f]{40}$/.test(input.commitSha)) {
    throw new TypeError("GitHub source commit must be a 40-character SHA.");
  }
  if (!input.token)
    throw new TypeError("GitHub installation token is required.");

  const url = new URL(
    `https://api.github.com/repos/${repositoryApiPath(input.repository)}/contents/${contentApiPath(input.path)}`,
  );
  url.searchParams.set("ref", input.commitSha);
  const response = await (input.fetchImplementation ?? fetch)(url, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${input.token}`,
      "x-github-api-version": GITHUB_API_VERSION,
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub library source read failed: ${response.status}`);
  }

  const body: unknown = await response.json();
  if (
    typeof body !== "object" ||
    body === null ||
    !("encoding" in body) ||
    body.encoding !== "base64" ||
    !("content" in body) ||
    typeof body.content !== "string"
  ) {
    throw new Error("GitHub library source response is malformed.");
  }
  return Buffer.from(body.content.replaceAll(/\s/g, ""), "base64").toString(
    "utf8",
  );
}
