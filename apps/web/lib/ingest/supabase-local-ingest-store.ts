import type {
  LocalIngestPayload,
  LocalIngestPreviousState,
  LocalIngestPrincipal,
  LocalIngestStore,
} from "@arr/core";
import type { SupabaseClient } from "@supabase/supabase-js";

import { SupabaseMcpStore } from "../mcp/supabase-store";

interface PreviousArtifactRow {
  readonly classification: string;
  readonly digest: string;
  readonly exported_symbols: unknown;
  readonly kind: string;
  readonly last_seen_commit_sha: string | null;
  readonly path: string;
  readonly size_bytes: number;
  readonly source_blob_sha: string;
  readonly source_commit_sha: string;
}

/**
 * Local ingest persistence on the service-role client. Tokens are the existing
 * workspace MCP tokens; the scan plan is applied through the same
 * `apply_repository_scan` SQL function the worker uses (ADR-013 equivalence).
 */
export class SupabaseLocalIngestStore implements LocalIngestStore {
  private readonly mcpStore: SupabaseMcpStore;

  constructor(private readonly client: SupabaseClient) {
    this.mcpStore = new SupabaseMcpStore(client);
  }

  async authenticateToken(
    secret: string,
  ): Promise<LocalIngestPrincipal | null> {
    const principal = await this.mcpStore.authenticateAccessToken(secret);
    return principal
      ? { scopes: principal.scopes, workspaceId: principal.workspaceId }
      : null;
  }

  async findRepository(
    workspaceId: string,
    fullName: string,
  ): Promise<string | null> {
    const result = await this.client
      .from("repositories")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("full_name", fullName)
      .maybeSingle();
    if (result.error) {
      throw new Error(result.error.message);
    }
    return result.data ? String(result.data.id) : null;
  }

  async ensureRepository(
    workspaceId: string,
    fullName: string,
  ): Promise<string> {
    const result = await this.client.rpc("ensure_local_repository", {
      target_full_name: fullName,
      target_workspace_id: workspaceId,
    });
    if (result.error || typeof result.data !== "string") {
      throw new Error(result.error?.message ?? "repository upsert failed");
    }
    return result.data;
  }

  async loadPreviousScan(
    workspaceId: string,
    repositoryId: string,
  ): Promise<LocalIngestPreviousState> {
    const [repository, artifacts] = await Promise.all([
      this.client
        .from("repositories")
        .select("last_scanned_commit_sha")
        .eq("workspace_id", workspaceId)
        .eq("id", repositoryId)
        .maybeSingle(),
      this.client
        .from("artifacts")
        .select(
          "path,classification,kind,digest,source_blob_sha,source_commit_sha,last_seen_commit_sha,size_bytes,exported_symbols",
        )
        .eq("workspace_id", workspaceId)
        .eq("repository_id", repositoryId),
    ]);
    if (repository.error) {
      throw new Error(repository.error.message);
    }
    if (artifacts.error) {
      throw new Error(artifacts.error.message);
    }
    const rows = (artifacts.data ?? []) as readonly PreviousArtifactRow[];
    return {
      artifacts: rows.map((row) => ({
        classification: row.classification,
        digest: row.digest,
        exportedSymbols: row.exported_symbols ?? [],
        kind: row.kind,
        path: row.path,
        sizeBytes: row.size_bytes,
        sourceBlobSha: row.source_blob_sha,
        sourceCommitSha: row.last_seen_commit_sha || row.source_commit_sha,
      })),
      commitSha:
        (repository.data?.last_scanned_commit_sha as string | null) ?? null,
    };
  }

  async recordIngestRun(input: {
    commitSha: string;
    repositoryId: string;
    startedAt: string;
    workspaceId: string;
  }): Promise<string> {
    const result = await this.client.rpc("record_local_ingest_run", {
      target_commit_sha: input.commitSha,
      target_repository_id: input.repositoryId,
      target_started_at: input.startedAt,
      target_workspace_id: input.workspaceId,
    });
    if (result.error || typeof result.data !== "string") {
      throw new Error(result.error?.message ?? "ingest run record failed");
    }
    return result.data;
  }

  async applyScanPlan(
    workspaceId: string,
    repositoryId: string,
    plan: LocalIngestPayload["plan"],
  ): Promise<number> {
    const result = await this.client.rpc("apply_repository_scan", {
      plan,
      target_repository_id: repositoryId,
      target_workspace_id: workspaceId,
    });
    if (result.error || typeof result.data !== "number") {
      throw new Error(result.error?.message ?? "scan apply failed");
    }
    return result.data;
  }
}
