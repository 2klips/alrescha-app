import {
  deriveModuleClusters,
  moduleClusterOf,
  moduleMemberDigest,
  type ModuleCluster,
} from "@arr/core";

import type {
  McpModuleSummaryData,
  McpRepositoryData,
  McpWorkspaceData,
} from "./store";

/**
 * Lazy module explanations (Phase 3 Wave C todo 8).
 *
 * Cluster membership is derived deterministically from the stored structure
 * edges on every call — always fresh, always free. Prose is the only thing
 * that costs anything, and it is cached by member digest: `explainModule`
 * reports one of three states — `ready` (digest matches), `stale` (cached
 * prose from an older member set, refresh enqueued by the caller) or
 * `pending` (nothing cached yet).
 */

const STRUCTURE_RELATIONS = new Set(["imports", "calls"]);

export interface RepositoryModules {
  readonly clusters: readonly ModuleCluster[];
  readonly repository: McpRepositoryData;
}

export function repositoryModules(
  repository: McpRepositoryData,
): readonly ModuleCluster[] {
  const pathById = new Map(
    repository.artifacts.map((artifact) => [artifact.id, artifact.path]),
  );
  const edges = repository.edges
    .filter((edge) => STRUCTURE_RELATIONS.has(edge.relation))
    .flatMap((edge) => {
      const source = pathById.get(edge.sourceNodeId);
      const target = pathById.get(edge.targetNodeId);
      return source && target ? [{ source, target }] : [];
    });
  return deriveModuleClusters({
    edges,
    paths: repository.artifacts.map(({ path }) => path),
  });
}

export type ModuleSummaryState = "pending" | "ready" | "stale";

export interface ModuleExplanation {
  readonly cluster: ModuleCluster;
  readonly memberDigest: string;
  readonly repositoryId: string;
  readonly state: ModuleSummaryState;
  /** Cached prose — present for ready and stale, absent for pending. */
  readonly summary: McpModuleSummaryData | null;
}

export function findModuleForNode(
  workspace: McpWorkspaceData,
  nodeId: string,
): ModuleExplanation | null {
  for (const repository of workspace.repositories) {
    const artifact = repository.artifacts.find(({ id }) => id === nodeId);
    if (!artifact) continue;
    const clusters = repositoryModules(repository);
    const cluster = moduleClusterOf(clusters, artifact.path);
    if (!cluster) return null;

    const digest = moduleMemberDigest(
      repository.artifacts
        .filter(({ path }) => cluster.members.includes(path))
        .map(({ blobSha, path }) => ({ blobSha: blobSha ?? "", path })),
    );
    const cached =
      (repository.moduleSummaries ?? []).find(
        (summary) => summary.moduleKey === cluster.key,
      ) ?? null;
    const state: ModuleSummaryState = cached
      ? cached.memberDigest === digest
        ? "ready"
        : "stale"
      : "pending";
    return {
      cluster,
      memberDigest: digest,
      repositoryId: repository.id,
      state,
      summary: cached,
    };
  }
  return null;
}

export interface RepoOverviewModule {
  readonly key: string;
  readonly memberCount: number;
  readonly name: string;
  readonly summary: string | null;
}

/**
 * Deterministic repository overview — zero model calls. Cached module prose
 * is included where fresh; everything else is structure and counts.
 */
export function buildRepoOverview(workspace: McpWorkspaceData): {
  readonly repositories: {
    readonly artifactCount: number;
    readonly fullName: string;
    readonly modules: readonly RepoOverviewModule[];
    readonly repositoryId: string;
  }[];
  readonly text: string;
} {
  const repositories = workspace.repositories.map((repository) => {
    const clusters = repositoryModules(repository);
    const summariesByKey = new Map(
      (repository.moduleSummaries ?? []).map((summary) => [
        summary.moduleKey,
        summary,
      ]),
    );
    const modules = clusters.map((cluster) => {
      const digest = moduleMemberDigest(
        repository.artifacts
          .filter(({ path }) => cluster.members.includes(path))
          .map(({ blobSha, path }) => ({ blobSha: blobSha ?? "", path })),
      );
      const cached = summariesByKey.get(cluster.key);
      return {
        key: cluster.key,
        memberCount: cluster.members.length,
        name: cluster.name,
        // Stale prose is not served as current — an honest null instead.
        summary:
          cached && cached.memberDigest === digest ? cached.summary : null,
      };
    });
    return {
      artifactCount: repository.artifacts.length,
      fullName: repository.fullName,
      modules,
      repositoryId: repository.id,
    };
  });

  const lines: string[] = [];
  for (const repository of repositories) {
    lines.push(`${repository.fullName} — ${repository.artifactCount} files`);
    for (const module of repository.modules) {
      lines.push(
        `  ${module.name} (${module.memberCount} files)` +
          (module.summary ? `: ${module.summary}` : ""),
      );
    }
  }
  return { repositories, text: lines.join("\n") };
}
