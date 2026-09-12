import type { SupabaseClient } from "@supabase/supabase-js";

import {
  REPOSITORY_SELECTION_COLUMNS,
  currentRepository,
} from "../shell/current-repository";

/**
 * `/app` workspace home (Phase 3 Wave E todo 13).
 *
 * The home is the onboarding spine as one thread: 레포 연결 → 지식그래프
 * 생성 → 첫 그래프 뷰 + MCP 토큰 발급. The builder is a pure function over
 * counted rows so the step logic is unit-testable offline; the loader is the
 * thin RLS wrapper, the same split as the map and commits loaders.
 *
 * Phase 4 Wave C todo 16 adds the first run's progress to the graph step:
 * the two stages a connect queues (structure, then analysis), read from the
 * queue and the repository row rather than guessed from a spinner. The two
 * are independent states on purpose (보완 R-02): the structure being ready
 * is what opens the map, whether or not the analysis has caught up.
 */

export type JourneyStepState = "done" | "active" | "pending";

/**
 * One stage of the first run, as the queue and the repository row report it.
 * `local` is the analysis of a locally pushed repository, which the hosted
 * worker never runs (todo 17): it happens on the machine that has the files.
 */
export type ScanStageState =
  "idle" | "queued" | "running" | "ready" | "failed" | "local";

/**
 * Whether the "다시 스캔" button has anything to do right now. `retry` is
 * the first scan that failed for good and never landed: the same button,
 * worded as what it is, queues the backfill again at the head the connect
 * read (PR #9 follow-up).
 */
export type RescanAvailability =
  "available" | "busy" | "local" | "never-scanned" | "none" | "retry";

export interface WorkspaceJourneyJobRow {
  readonly created_at: string;
  readonly kind: string;
  readonly last_error: string | null;
  readonly payload: { commitSha?: string } | null;
  readonly status: string;
}

export interface WorkspaceJourneyRepositoryRow {
  readonly created_at?: string | null;
  readonly full_name: string;
  readonly id: string;
  /** Null for a locally pushed repository (ADR-015). */
  readonly installation_id: string | null;
  readonly last_analyzed_commit_sha: string | null;
  readonly last_scanned_commit_sha: string | null;
  /** When the user last chose it in the connect picker; null for a local push. */
  readonly selected_at?: string | null;
}

export interface WorkspaceJourneyRows {
  /** Newest-first installation revocation markers (empty when none). */
  readonly installations: readonly { revoked_at: string | null }[];
  /** Connected repositories; `currentRepository` picks the one the home is about. */
  readonly repositories: readonly WorkspaceJourneyRepositoryRow[];
  /** The current repository's jobs, newest first. */
  readonly jobs: readonly WorkspaceJourneyJobRow[];
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly agentAssertionCount: number;
  /** All tokens ever issued; active = not revoked. */
  readonly tokens: readonly { revoked_at: string | null }[];
}

export interface ScanProgressModel {
  readonly analysis: ScanStageState;
  /** The queue's own words for the newest failed analysis, verbatim. */
  readonly analysisError: string | null;
  /** The commit the newest scan is about, else the last one scanned. */
  readonly commitSha: string | null;
  readonly repositoryId: string | null;
  readonly rescan: RescanAvailability;
  readonly structure: ScanStageState;
  /** The queue's own words for the newest failed scan, verbatim. */
  readonly structureError: string | null;
}

export interface WorkspaceJourneyModel {
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly repoFullName: string | null;
  /** True when the newest installation was revoked (re-connect nudge). */
  readonly installationRevoked: boolean;
  readonly lastScannedCommitSha: string | null;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly agentAssertionCount: number;
  readonly activeTokenCount: number;
  /** Every connected repository; the home is about one of them. */
  readonly repositoryCount: number;
  /**
   * Where another connected repository is chosen: the picker for the
   * current repository's installation, which re-selects (and retries a
   * failed first scan) through the existing connect path. Null with one
   * repository or none, or for a locally pushed one.
   */
  readonly repositorySwitchHref: string | null;
  readonly scan: ScanProgressModel;
  readonly steps: {
    readonly connect: JourneyStepState;
    readonly graph: JourneyStepState;
    readonly agent: JourneyStepState;
  };
}

/**
 * The newest job of a kind decides the stage while it is in flight or has
 * failed; once it is out of the way the repository row says whether the
 * stage's output exists. A job that never existed (a repository connected
 * before backfills, a local push) falls through to the row as well.
 */
function stageOf(
  job: WorkspaceJourneyJobRow | undefined,
  outputExists: boolean,
): ScanStageState {
  switch (job?.status) {
    case "queued":
      return "queued";
    case "running":
      return "running";
    case "failed":
      return "failed";
    default:
      return outputExists ? "ready" : "idle";
  }
}

export function buildScanProgress(
  repository: WorkspaceJourneyRepositoryRow | null,
  jobs: readonly WorkspaceJourneyJobRow[],
): ScanProgressModel {
  if (repository === null) {
    return {
      analysis: "idle",
      analysisError: null,
      commitSha: null,
      repositoryId: null,
      rescan: "none",
      structure: "idle",
      structureError: null,
    };
  }
  const isLocal = repository.installation_id === null;
  const scanJob = jobs.find(({ kind }) => kind === "scan");
  const analyzeJob = jobs.find(({ kind }) => kind === "analyze");

  const structure = stageOf(
    scanJob,
    repository.last_scanned_commit_sha !== null,
  );
  const analysis = isLocal
    ? "local"
    : stageOf(
        analyzeJob,
        repository.last_scanned_commit_sha !== null &&
          repository.last_analyzed_commit_sha ===
            repository.last_scanned_commit_sha,
      );

  // A first scan that failed for good still names the head it tried; the
  // queue can try it again there (`enqueue_repository_rescan`,
  // 202609120004). A connect that queued nothing has no head to offer.
  const firstScanRetryable =
    scanJob?.status === "failed" &&
    typeof scanJob.payload?.commitSha === "string";
  const rescan: RescanAvailability = isLocal
    ? "local"
    : structure === "queued" || structure === "running"
      ? "busy"
      : repository.last_scanned_commit_sha === null
        ? firstScanRetryable
          ? "retry"
          : "never-scanned"
        : "available";

  return {
    analysis,
    analysisError:
      analysis === "failed" ? (analyzeJob?.last_error ?? null) : null,
    commitSha:
      scanJob?.payload?.commitSha ?? repository.last_scanned_commit_sha,
    repositoryId: repository.id,
    rescan,
    structure,
    structureError:
      structure === "failed" ? (scanJob?.last_error ?? null) : null,
  };
}

export function buildWorkspaceJourney(
  workspaceId: string,
  workspaceName: string,
  rows: WorkspaceJourneyRows,
): WorkspaceJourneyModel {
  const repository = currentRepository(rows.repositories);
  const activeTokenCount = rows.tokens.filter(
    (token) => token.revoked_at === null,
  ).length;
  // Local-ingest repositories (ADR-015) have no installation row, so a
  // connected repository alone completes the connect step; a revoked
  // installation only warns, it does not un-connect stored data.
  const connected = repository !== null;
  const graphReady = rows.nodeCount > 0;

  const connect: JourneyStepState = connected ? "done" : "active";
  const graph: JourneyStepState = graphReady
    ? "done"
    : connected
      ? "active"
      : "pending";
  const agent: JourneyStepState =
    activeTokenCount > 0 ? "done" : graphReady ? "active" : "pending";

  return {
    activeTokenCount,
    agentAssertionCount: rows.agentAssertionCount,
    edgeCount: rows.edgeCount,
    installationRevoked:
      connected && (rows.installations[0]?.revoked_at ?? null) !== null,
    lastScannedCommitSha: repository?.last_scanned_commit_sha ?? null,
    nodeCount: rows.nodeCount,
    repoFullName: repository?.full_name ?? null,
    repositoryCount: rows.repositories.length,
    repositorySwitchHref:
      rows.repositories.length > 1 && repository?.installation_id
        ? `/app/connect/github/repositories?installation=${encodeURIComponent(repository.installation_id)}`
        : null,
    scan: buildScanProgress(repository, rows.jobs),
    steps: { agent, connect, graph },
    workspaceId,
    workspaceName,
  };
}

export async function loadWorkspaceJourney(
  client: SupabaseClient,
  userId: string,
): Promise<WorkspaceJourneyModel> {
  const workspaceResult = await client
    .from("workspaces")
    .select("id,name")
    .eq("owner_user_id", userId)
    .limit(1)
    .single();
  if (workspaceResult.error || !workspaceResult.data) {
    throw new Error("Personal workspace is unavailable.");
  }
  const workspaceId = String(workspaceResult.data.id);

  const [installations, repositories, nodes, edges, assertions, tokens] =
    await Promise.all([
      client
        .from("github_installations")
        .select("revoked_at")
        .eq("workspace_id", workspaceId)
        .order("updated_at", { ascending: false })
        .limit(1),
      client
        .from("repositories")
        .select(
          `id,full_name,installation_id,last_scanned_commit_sha,last_analyzed_commit_sha,${REPOSITORY_SELECTION_COLUMNS}`,
        )
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false }),
      client
        .from("graph_nodes")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId),
      client
        .from("edges")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId),
      client
        .from("agent_assertions")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .is("invalidated_at", null),
      client
        .from("mcp_tokens")
        .select("revoked_at")
        .eq("workspace_id", workspaceId),
    ]);

  for (const result of [
    installations,
    repositories,
    nodes,
    edges,
    assertions,
    tokens,
  ]) {
    if (result.error) {
      throw new Error(result.error.message);
    }
  }

  const repositoryRows = (repositories.data ??
    []) as WorkspaceJourneyRepositoryRow[];
  const current = currentRepository(repositoryRows);
  // The first run's jobs, newest first. Twenty covers a backfill, a rescan
  // or two and their analyses; the stage reads only the newest of each kind.
  const jobs = current
    ? await client
        .from("jobs")
        .select("kind,status,last_error,created_at,payload")
        .eq("workspace_id", workspaceId)
        .eq("repository_id", current.id)
        .order("created_at", { ascending: false })
        .limit(20)
    : { data: [], error: null };
  if (jobs.error) {
    throw new Error(jobs.error.message);
  }

  return buildWorkspaceJourney(
    workspaceId,
    String(workspaceResult.data.name ?? ""),
    {
      agentAssertionCount: assertions.count ?? 0,
      edgeCount: edges.count ?? 0,
      installations: (installations.data ?? []) as {
        revoked_at: string | null;
      }[],
      jobs: (jobs.data ?? []) as WorkspaceJourneyJobRow[],
      nodeCount: nodes.count ?? 0,
      repositories: repositoryRows,
      tokens: (tokens.data ?? []) as { revoked_at: string | null }[],
    },
  );
}
