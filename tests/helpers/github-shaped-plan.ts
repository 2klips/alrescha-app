import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  scanRepository,
  type RepositoryScanPlan,
} from "../../packages/core/src/index";
import { createLocalRepositorySource } from "../../packages/cli/src/local-source";
import { GitHubRepositorySource } from "../../apps/worker/src/github-repository-source";

/**
 * The GitHub transport, served from the same local files: the REAL
 * `GitHubRepositorySource` with a stubbed fetch that answers the tree and raw
 * content endpoints from disk. Everything after the transport — scanner,
 * apply — is shared code, so this is the honest two-path comparison (ADR-013).
 *
 * Shared rather than copied: two implementations of "the GitHub path" would
 * drift, and a drifted comparison proves nothing.
 */
export async function githubShapedPlan(
  rootDir: string,
  commitSha: string,
): Promise<RepositoryScanPlan> {
  const { source: localSource } = await createLocalRepositorySource(rootDir);
  const tree = await localSource.listTree(commitSha);
  const fetchImplementation = (async (input: unknown) => {
    const url = String(input);
    if (url.includes("/git/trees/")) {
      return Response.json({
        sha: tree.treeSha,
        tree: tree.entries.map((entry) => ({ ...entry })),
        truncated: false,
      });
    }
    const match = /\/contents\/([^?]+)\?/.exec(url);
    if (!match?.[1]) {
      return new Response("not found", { status: 404 });
    }
    const path = decodeURIComponent(match[1]);
    const bytes = await readFile(join(rootDir, ...path.split("/")));
    return new Response(new Uint8Array(bytes));
  }) as typeof fetch;
  const source = new GitHubRepositorySource(
    "2klips",
    "arr-app",
    "installation-token",
    fetchImplementation,
  );
  return scanRepository({ commitSha, source });
}
