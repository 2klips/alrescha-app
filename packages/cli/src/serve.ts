/**
 * `alrescha serve --local` — a local repository's graph over stdio MCP
 * (Phase 4 Wave C todo 17, OQ-030 ⑴).
 *
 * `alrescha push` gives a local repository a graph on the server and nothing
 * else: the worker's source factory needs a GitHub installation, so analyze
 * and enrich never run for it. Fixing that server-side would mean uploading
 * bodies, which hard rule ③ forbids outright — so the reading moves to the
 * machine that already has them, and nothing leaves it at all. There is no
 * server, no token and no network in this path.
 *
 * The scan is always full. Nothing is stored between runs, so there is no
 * previous state for an incremental pass to speak against.
 *
 * **stdout is the wire.** Every human-facing line goes to stderr; a client
 * that spawned this process is reading stdout as JSON-RPC, and one stray
 * `console.log` would corrupt the first message.
 */

import { scanRepository, type RepositoryScanPlan } from "@alrescha/core";
import {
  buildLocalWorkspace,
  serveLocalWorkspace,
  type LocalServeHandle,
} from "@alrescha/mcp";

import { createLocalRepositorySource } from "./local-source";

export interface ServeOptions {
  readonly repositoryFullName: string;
  readonly rootDir: string;
  /** Injected by tests; the process's own stdio otherwise. */
  readonly transport?: Parameters<typeof serveLocalWorkspace>[0]["transport"];
}

export interface ServeOutcome {
  readonly artifactCount: number;
  readonly commitSha: string;
  readonly edgeCount: number;
  readonly handle: LocalServeHandle;
  readonly plan: RepositoryScanPlan;
  readonly skippedCount: number;
}

export async function serveLocalProject(
  options: ServeOptions,
): Promise<ServeOutcome> {
  const snapshot = await createLocalRepositorySource(options.rootDir);
  const plan = await scanRepository({
    commitSha: snapshot.commitSha,
    mode: "full",
    source: snapshot.source,
  });
  const workspace = buildLocalWorkspace({
    plan,
    repositoryFullName: options.repositoryFullName,
  });
  const handle = serveLocalWorkspace({
    workspace,
    ...(options.transport === undefined
      ? {}
      : { transport: options.transport }),
  });
  return {
    artifactCount: plan.artifacts.length,
    commitSha: plan.commitSha,
    edgeCount: workspace.repositories[0]?.edges.length ?? 0,
    handle,
    plan,
    skippedCount: plan.skipped.length,
  };
}
