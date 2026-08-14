import {
  GITHUB_API_VERSION,
  type RepositorySource,
  type RepositoryTree,
  type RepositoryTreeEntry,
} from "@specproof/core";

type JsonRecord = Record<string, unknown>;

function record(value: unknown, label: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as JsonRecord;
}

function treeResponse(value: unknown): RepositoryTree {
  const response = record(value, "GitHub tree response");
  if (typeof response.sha !== "string" || typeof response.truncated !== "boolean" || !Array.isArray(response.tree)) {
    throw new Error("GitHub tree response is malformed.");
  }

  const entries = response.tree.map((value, index): RepositoryTreeEntry => {
    const entry = record(value, `GitHub tree entry ${index}`);
    if (
      typeof entry.path !== "string" ||
      typeof entry.mode !== "string" ||
      typeof entry.sha !== "string" ||
      (entry.type !== "blob" && entry.type !== "tree" && entry.type !== "commit") ||
      (entry.size !== undefined && typeof entry.size !== "number")
    ) {
      throw new Error(`GitHub tree entry ${index} is malformed.`);
    }
    return {
      mode: entry.mode,
      path: entry.path,
      sha: entry.sha,
      ...(typeof entry.size === "number" ? { size: entry.size } : {}),
      type: entry.type,
    };
  });

  return { entries, treeSha: response.sha, truncated: response.truncated };
}

export class GitHubRepositorySource implements RepositorySource {
  constructor(
    private readonly owner: string,
    private readonly repository: string,
    private readonly installationToken: string,
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {}

  private async request(path: string, accept = "application/vnd.github+json"): Promise<Response> {
    const response = await this.fetchImplementation(`https://api.github.com${path}`, {
      headers: {
        accept,
        authorization: `Bearer ${this.installationToken}`,
        "x-github-api-version": GITHUB_API_VERSION,
      },
    });
    if (!response.ok) {
      throw new Error(`GitHub repository request failed: ${response.status}`);
    }
    return response;
  }

  private treePath(sha: string, recursive: boolean): string {
    const owner = encodeURIComponent(this.owner);
    const repository = encodeURIComponent(this.repository);
    const suffix = recursive ? "?recursive=1" : "";
    return `/repos/${owner}/${repository}/git/trees/${encodeURIComponent(sha)}${suffix}`;
  }

  async listTree(commitSha: string): Promise<RepositoryTree> {
    const recursive = treeResponse(await (await this.request(this.treePath(commitSha, true))).json());
    if (!recursive.truncated) {
      return recursive;
    }

    const entries: RepositoryTreeEntry[] = [];
    const queue: Array<{ prefix: string; sha: string }> = [{ prefix: "", sha: commitSha }];
    let rootTreeSha = recursive.treeSha;

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;
      const subtree = treeResponse(await (await this.request(this.treePath(current.sha, false))).json());
      if (current.prefix === "") {
        rootTreeSha = subtree.treeSha;
      }
      for (const entry of subtree.entries) {
        const path = current.prefix ? `${current.prefix}/${entry.path}` : entry.path;
        if (entry.type === "tree") {
          queue.push({ prefix: path, sha: entry.sha });
        } else {
          entries.push({ ...entry, path });
        }
      }
      if (entries.length + queue.length > 100_000) {
        throw new Error("Repository tree exceeds the 100,000-entry scan safety limit.");
      }
    }

    return { entries, treeSha: rootTreeSha, truncated: false };
  }

  async fetchContent(path: string, commitSha: string): Promise<Uint8Array> {
    const owner = encodeURIComponent(this.owner);
    const repository = encodeURIComponent(this.repository);
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    const response = await this.request(
      `/repos/${owner}/${repository}/contents/${encodedPath}?ref=${encodeURIComponent(commitSha)}`,
      "application/vnd.github.raw+json",
    );
    return new Uint8Array(await response.arrayBuffer());
  }
}
