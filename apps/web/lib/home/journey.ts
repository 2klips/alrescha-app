import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * `/app` workspace home (Phase 3 Wave E todo 13).
 *
 * The home is the onboarding spine as one thread: 레포 연결 → 지식그래프
 * 생성 → 첫 그래프 뷰 + MCP 토큰 발급. The builder is a pure function over
 * counted rows so the step logic is unit-testable offline; the loader is the
 * thin RLS wrapper, the same split as the map and commits loaders.
 */

export type JourneyStepState = "done" | "active" | "pending";

export interface WorkspaceJourneyRows {
  /** Newest-first installation revocation markers (empty when none). */
  readonly installations: readonly { revoked_at: string | null }[];
  /** Connected repositories, newest first. */
  readonly repositories: readonly {
    full_name: string;
    last_scanned_commit_sha: string | null;
  }[];
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly agentAssertionCount: number;
  /** All tokens ever issued; active = not revoked. */
  readonly tokens: readonly { revoked_at: string | null }[];
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
  readonly steps: {
    readonly connect: JourneyStepState;
    readonly graph: JourneyStepState;
    readonly agent: JourneyStepState;
  };
}

export function buildWorkspaceJourney(
  workspaceId: string,
  workspaceName: string,
  rows: WorkspaceJourneyRows,
): WorkspaceJourneyModel {
  const repository = rows.repositories[0] ?? null;
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
        .select("full_name,last_scanned_commit_sha")
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

  return buildWorkspaceJourney(
    workspaceId,
    String(workspaceResult.data.name ?? ""),
    {
      agentAssertionCount: assertions.count ?? 0,
      edgeCount: edges.count ?? 0,
      installations: (installations.data ?? []) as {
        revoked_at: string | null;
      }[],
      nodeCount: nodes.count ?? 0,
      repositories: (repositories.data ?? []) as {
        full_name: string;
        last_scanned_commit_sha: string | null;
      }[],
      tokens: (tokens.data ?? []) as { revoked_at: string | null }[],
    },
  );
}
