import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MCP_ARTIFACT_MATCH_LIMIT,
  MCP_EDGE_FAMILIES,
  MCP_EDGE_MAX_PAGES,
  MCP_EDGE_PAGE_BYTES,
  MCP_EDGE_PAGE_ROWS,
  MCP_EDGE_RELATIONS,
  MCP_EDGE_TIERS,
  MCP_SCOPES,
  MCP_WORKSPACE_READ_LIMIT,
  createAccessTokenSecret,
  createUlid,
  hashAccessToken,
  type AgentAssertionRelation,
  type McpArtifactData,
  type McpArtifactMatch,
  type IssueAccessTokenInput,
  type IssuedAccessToken,
  type McpAccessEvent,
  type McpAssertLinkResult,
  type McpMemoryBlockName,
  type McpWriteMemoryResult,
  type McpDbObjectData,
  type McpEdgeFamily,
  type McpEdgeOmission,
  type McpEdgeProvenance,
  type McpEdgeRelation,
  type McpEdgeTier,
  type McpReadBasis,
  type McpReadTruncation,
  type McpFindingProvenance,
  type McpNodeType,
  type McpSourceSpan,
  type McpNote,
  type McpPackMeasurement,
  type McpPrincipal,
  type McpProgressEvent,
  type McpProgressStatus,
  type McpScope,
  type McpStore,
  type McpWorkspaceData,
  type PublicMcpTokenRecord,
} from "@alrescha/mcp";
import { summaryState } from "@alrescha/core";

type Row = Record<string, unknown>;

/**
 * Minimum gap between `last_used_at` touches on the same token (QW-11). The
 * column is observability only (surfaced in the tokens settings UI), so
 * coalescing writes within this window trades a little display staleness
 * for one fewer write per tool call under repeat use.
 */
const LAST_USED_AT_TOUCH_THROTTLE_MS = 5 * 60_000;

function queryError(label: string, error: { message: string } | null): void {
  if (error) throw new Error(`${label}: ${error.message}`);
}

function rows(data: unknown): Row[] {
  return Array.isArray(data) ? (data as Row[]) : [];
}

function record(value: unknown): Row {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Row)
    : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function requiredString(row: Row, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || !value)
    throw new Error(`Malformed database row: ${key}`);
  return value;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * The column has a CHECK for these three, so a fourth value means the schema
 * moved under us. `table` is the safe read of an unknown object rather than a
 * thrown request — the tool answer is still true about the edges.
 */
function dbObjectKind(value: unknown): McpDbObjectData["kind"] {
  return value === "function" || value === "view" ? value : "table";
}

function isScope(value: string): value is McpScope {
  return MCP_SCOPES.some((scope) => scope === value);
}

function isNodeType(value: unknown): value is McpNodeType {
  return [
    "artifact",
    "requirement",
    "evidence",
    "finding",
    "receipt",
    "context_pack",
  ].includes(String(value));
}

/**
 * The vocabulary, read from the package rather than copied (Codex remedy
 * P0-D). The copy this replaced was ten values behind: `defines`, `modifies`
 * and `queries` reached the database in Wave A′ todo 7 and never reached an
 * agent, because a relation the list did not know was dropped here without a
 * word. `contains` is still excluded — the hierarchy would bury every
 * neighbour answer until todo 22 gives the tools a flag — but exclusion is
 * now reported rather than silent.
 */
function isRelation(value: unknown): value is McpEdgeRelation {
  return (MCP_EDGE_RELATIONS as readonly string[]).includes(String(value));
}

function edgeFamily(value: unknown): McpEdgeFamily | null {
  return (MCP_EDGE_FAMILIES as readonly string[]).includes(String(value))
    ? (value as McpEdgeFamily)
    : null;
}

function edgeTier(value: unknown): McpEdgeTier | null {
  return (MCP_EDGE_TIERS as readonly string[]).includes(String(value))
    ? (value as McpEdgeTier)
    : null;
}

/**
 * The stored `edges.provenance`, decoded without invention. A writer that
 * stated no reason and no span leaves both null; nothing here fills a gap
 * with a plausible default, because a made-up `resolved` is exactly the
 * dressing-up the remedy forbids.
 */
function edgeProvenance(value: unknown): McpEdgeProvenance {
  const stored = record(value);
  return {
    method: typeof stored.method === "string" ? stored.method : null,
    reason: typeof stored.reason === "string" ? stored.reason : null,
    span: sourceSpan(stored.span),
  };
}

/**
 * One artifact row, decoded once for both readers — the workspace load and
 * the targeted lookup. Two decoders would be two freshness rules, and the
 * whole point of S1 was that there is one.
 */
function artifactData(
  row: Row,
  labels: ReadonlyMap<string, string>,
): McpArtifactData {
  const metadata = record(row.metadata);
  const id = requiredString(row, "id");
  const path = requiredString(row, "path");
  // The one freshness rule (Codex remedy P0-A): prose written for an older
  // blob is not served as a description of the file now. `artifacts.metadata`
  // is merged on rescan, so a stale summary survives every scan until enrich
  // replaces it — and until then every excerpt, pack and `get_artifact`
  // answer built from it described a file that had already changed.
  const state = summaryState({
    currentBlobSha: nullableString(row.source_blob_sha),
    summary: typeof metadata.summary === "string" ? metadata.summary : null,
    summaryBlobSha:
      typeof metadata.summaryBlobSha === "string"
        ? metadata.summaryBlobSha
        : null,
  });
  const fresh = state.state === "current" ? state.text : null;
  return {
    blobSha: nullableString(row.source_blob_sha) ?? "",
    content: fresh ?? "",
    headings: strings(metadata.headings),
    id,
    kind: requiredString(row, "kind"),
    path,
    status: typeof metadata.status === "string" ? metadata.status : "active",
    summary: fresh ?? labels.get(id) ?? path,
    summaryState: state,
    symbols: strings(metadata.symbols),
    tags: strings(metadata.tags),
    title:
      typeof metadata.title === "string"
        ? metadata.title
        : (labels.get(id) ?? path),
  };
}

function sourceSpan(value: unknown): McpSourceSpan | null {
  const span = record(value);
  return typeof span.path === "string" &&
    typeof span.startLine === "number" &&
    typeof span.endLine === "number"
    ? { endLine: span.endLine, path: span.path, startLine: span.startLine }
    : null;
}

/**
 * The stored provenance, passed through rather than reduced.
 *
 * The analyze job writes `{reason, spans, suggestedAction, evidenceLinks}`,
 * none of which matched the two shapes this function used to recognise — so
 * every production finding reached an agent as `{reason: "deterministic
 * stale-doc rule"}`, with the path, the line and the recommended action
 * dropped on the floor (R5 §4.3). Excerpts are deliberately not forwarded:
 * an agent asking what is wrong needs the location, and a document excerpt
 * is what `get_artifact` is for.
 */
function findingProvenance(value: unknown): McpFindingProvenance {
  const provenance = record(value);
  const span = sourceSpan(provenance.span);
  const spans = (Array.isArray(provenance.spans) ? provenance.spans : [])
    .map(sourceSpan)
    .filter((entry): entry is McpSourceSpan => entry !== null);
  const reason =
    typeof provenance.reason === "string" && provenance.reason
      ? provenance.reason
      : null;
  return {
    ...(reason || (!span && spans.length === 0)
      ? { reason: reason ?? "Stored finding provenance" }
      : {}),
    ...(typeof provenance.sourceArtifactId === "string"
      ? { sourceArtifactId: provenance.sourceArtifactId }
      : {}),
    ...(span ? { span } : {}),
    ...(spans.length > 0 ? { spans } : {}),
    ...(typeof provenance.suggestedAction === "string" &&
    provenance.suggestedAction
      ? { suggestedAction: provenance.suggestedAction }
      : {}),
  };
}

export class SupabaseMcpStore implements McpStore {
  constructor(private readonly client: SupabaseClient) {}

  /**
   * Verifies actorUserId owns workspaceId. Two call patterns:
   *
   * 1. Entry points that receive a bare actorUserId/workspaceId pair with
   *    no prior check in this request — issueAccessToken, listAccessTokens,
   *    revokeAccessToken, and authenticateAccessToken itself — MUST call
   *    this; it is the only ownership check they get.
   * 2. Methods that instead receive a McpPrincipal (recordPrompt,
   *    recordRuledOut, assertLink, writeMemory, appendNote, appendProgress,
   *    loadWorkspace) must NOT call this. Every principal reaching them has
   *    already had its ownership verified by the time it exists: either
   *    minted by authenticateAccessToken above (which runs this once per
   *    hosted-MCP request), or hand-built by a caller that first resolved
   *    workspaceId from its own ownership-scoped query (e.g. the settings
   *    server actions, which also run the subsequent store queries through
   *    that caller's own RLS-scoped client rather than this class's usual
   *    service-role client). Every query in those methods still scopes by
   *    principal.workspaceId — dropping this call only skips re-proving an
   *    ownership fact the caller already established, which used to cost a
   *    full `workspaces` round trip on every single store call (QW-11).
   */
  private async assertOwner(
    actorUserId: string,
    workspaceId: string,
  ): Promise<void> {
    const result = await this.client
      .from("workspaces")
      .select("id")
      .eq("id", workspaceId)
      .eq("owner_user_id", actorUserId)
      .maybeSingle();
    queryError("Workspace owner check failed", result.error);
    if (!result.data) throw new Error("Workspace access denied");
  }

  async recordPrompt(
    principal: McpPrincipal,
    input: {
      rawText?: string | undefined;
      rubric?: Record<string, number> | undefined;
      targetNodeIds?: string[] | undefined;
      tokenCount: number;
      toolName: string;
    },
  ): Promise<{ id: string }> {
    // The consent gate lives in the database trigger, so this call cannot
    // write around workspace enablement or the member's own consent.
    const result = await this.client.rpc("record_prompt_as", {
      target_node_ids: input.targetNodeIds ?? [],
      target_raw_text: input.rawText ?? null,
      target_rubric: input.rubric ?? {},
      target_shared: false,
      target_token_count: input.tokenCount,
      target_tool_name: input.toolName,
      target_user_id: principal.userId,
      target_workspace_id: principal.workspaceId,
    });
    if (result.error || typeof result.data !== "string") {
      throw new Error(result.error?.message ?? "Prompt record failed");
    }
    return { id: result.data };
  }

  async recordRuledOut(
    principal: McpPrincipal,
    input: {
      hypothesis: string;
      outcome: string;
      refs?: string[] | undefined;
      repositoryId?: string | undefined;
    },
  ): Promise<{ id: string }> {
    // Append-only is a schema property (a BEFORE trigger refuses update and
    // delete), so this writer cannot rewrite what it recorded either.
    const result = await this.client.rpc("record_ruled_out_as", {
      actor_user_id: principal.userId,
      attempt_hypothesis: input.hypothesis,
      attempt_outcome: input.outcome,
      attempt_refs: input.refs ?? [],
      target_repository_id: input.repositoryId ?? null,
      target_workspace_id: principal.workspaceId,
    });
    if (result.error || typeof result.data !== "string") {
      throw new Error(result.error?.message ?? "Ruled-out record failed");
    }
    return { id: result.data };
  }

  async assertLink(
    principal: McpPrincipal,
    input: {
      reason: string;
      relation: AgentAssertionRelation;
      sourceNodeId: string;
      targetNodeId: string;
    },
  ): Promise<McpAssertLinkResult> {
    // Reconciliation (noop / supersede) is one atomic SQL call, and the
    // bi-temporal property is enforced by triggers — no caller can delete.
    const result = await this.client.rpc("record_agent_assertion", {
      target_reason: input.reason,
      target_relation: input.relation,
      target_source_node_id: input.sourceNodeId,
      target_target_node_id: input.targetNodeId,
      target_token_id: principal.tokenId,
      target_user_id: principal.userId,
      target_workspace_id: principal.workspaceId,
    });
    if (result.error) {
      throw new Error(result.error.message);
    }
    const payload = record(result.data);
    return {
      id: nullableString(payload.id),
      invalidatedId: nullableString(payload.invalidated_id),
      outcome: String(payload.outcome) as McpAssertLinkResult["outcome"],
    };
  }

  async writeMemory(
    principal: McpPrincipal,
    input: {
      anchorNodeId?: string | undefined;
      entryKey: string;
      name: McpMemoryBlockName;
      remove?: boolean | undefined;
      text?: string | undefined;
    },
  ): Promise<McpWriteMemoryResult> {
    const result = await this.client.rpc("write_memory_entry", {
      remove_entry: input.remove ?? false,
      target_anchor_node_id: input.anchorNodeId ?? null,
      target_entry_key: input.entryKey,
      target_name: input.name,
      target_text: input.text ?? "",
      target_token_id: principal.tokenId,
      target_user_id: principal.userId,
      target_workspace_id: principal.workspaceId,
    });
    if (result.error) {
      throw new Error(result.error.message);
    }
    const payload = record(result.data);
    return {
      id: nullableString(payload.id),
      invalidatedId: nullableString(payload.invalidated_id),
      outcome: String(payload.outcome) as McpWriteMemoryResult["outcome"],
    };
  }

  async appendNote(
    principal: McpPrincipal,
    input: { target?: string | undefined; text: string },
  ): Promise<McpNote> {
    const occurredAt = new Date();
    const note: McpNote = {
      id: createUlid(occurredAt),
      occurredAt: occurredAt.toISOString(),
      target: input.target ?? null,
      text: input.text,
      tokenId: principal.tokenId,
      userId: principal.userId,
      workspaceId: principal.workspaceId,
    };
    const result = await this.client.from("mcp_notes").insert({
      id: note.id,
      occurred_at: note.occurredAt,
      target: note.target,
      text: note.text,
      token_id: note.tokenId,
      user_id: note.userId,
      workspace_id: note.workspaceId,
    });
    queryError("MCP note write failed", result.error);
    return note;
  }

  async appendProgress(
    principal: McpPrincipal,
    input: {
      refs?: string[] | undefined;
      status: McpProgressStatus;
      summary: string;
      task: string;
    },
  ): Promise<McpProgressEvent> {
    const result = await this.client.rpc("log_progress_atomic", {
      p_refs: input.refs ?? [],
      p_status: input.status,
      p_summary: input.summary,
      p_task: input.task,
      p_token_id: principal.tokenId,
      p_user_id: principal.userId,
      p_workspace_id: principal.workspaceId,
    });
    queryError("MCP progress write failed", result.error);
    const row = rows(result.data)[0];
    if (!row) throw new Error("MCP progress write failed: empty result");
    const event: McpProgressEvent = {
      id: requiredString(row, "event_id"),
      occurredAt: requiredString(row, "event_occurred_at"),
      refs: input.refs ?? [],
      status: input.status,
      summary: input.summary,
      task: input.task,
      todoId: requiredString(row, "todo_id"),
      tokenId: principal.tokenId,
      userId: principal.userId,
      workspaceId: principal.workspaceId,
    };
    return event;
  }

  async authenticateAccessToken(secret: string): Promise<McpPrincipal | null> {
    const result = await this.client
      .from("mcp_tokens")
      .select(
        "id, workspace_id, created_by, scopes, expires_at, revoked_at, last_used_at",
      )
      .eq("token_hash", hashAccessToken(secret))
      .maybeSingle();
    queryError("MCP token lookup failed", result.error);
    const token = result.data as Row | null;
    if (!token || token.revoked_at) return null;
    if (
      typeof token.expires_at === "string" &&
      Date.parse(token.expires_at) <= Date.now()
    )
      return null;

    const workspaceId = requiredString(token, "workspace_id");
    const userId = requiredString(token, "created_by");
    await this.assertOwner(userId, workspaceId);
    const scopes = strings(token.scopes).filter(isScope);
    if (scopes.length === 0) return null;
    const tokenId = requiredString(token, "id");

    const lastUsedAt = nullableString(token.last_used_at);
    const dueForTouch =
      !lastUsedAt ||
      Date.now() - Date.parse(lastUsedAt) >= LAST_USED_AT_TOUCH_THROTTLE_MS;
    if (dueForTouch) {
      // Fire-and-forget and throttled (QW-11): this column is display-only,
      // so it must never add a round trip to every authenticated call, and a
      // slow or failing touch must never fail authentication itself.
      // The query builder is only PromiseLike (no .catch), so both outcomes
      // are handled via the two-callback form of .then().
      void this.client
        .from("mcp_tokens")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", tokenId)
        .eq("workspace_id", workspaceId)
        .then(
          ({ error }) => {
            if (error) console.error("MCP token usage update failed", error);
          },
          (error: unknown) => {
            console.error("MCP token usage update failed", error);
          },
        );
    }
    return { scopes, tokenId, userId, workspaceId };
  }

  async issueAccessToken(
    input: IssueAccessTokenInput,
  ): Promise<IssuedAccessToken> {
    await this.assertOwner(input.actorUserId, input.workspaceId);
    if (!input.name.trim()) throw new Error("MCP token name is required");
    if (
      input.scopes.length === 0 ||
      input.scopes.some((scope) => !MCP_SCOPES.includes(scope))
    ) {
      throw new Error("At least one valid MCP scope is required");
    }
    const secret = createAccessTokenSecret();
    const inserted = await this.client
      .from("mcp_tokens")
      .insert({
        created_by: input.actorUserId,
        expires_at: input.expiresAt ?? null,
        name: input.name.trim(),
        scopes: [...new Set(input.scopes)],
        token_hash: hashAccessToken(secret),
        token_prefix: secret.slice(0, 12),
        workspace_id: input.workspaceId,
      })
      .select(
        "id, workspace_id, created_by, name, token_prefix, scopes, created_at, last_used_at, expires_at, revoked_at",
      )
      .single();
    queryError("MCP token issuance failed", inserted.error);
    const row = inserted.data as Row;
    return {
      record: this.publicToken(row),
      secret,
    };
  }

  async listAccessTokens(input: {
    actorUserId: string;
    workspaceId: string;
  }): Promise<PublicMcpTokenRecord[]> {
    await this.assertOwner(input.actorUserId, input.workspaceId);
    const result = await this.client
      .from("mcp_tokens")
      .select(
        "id, workspace_id, created_by, name, token_prefix, scopes, created_at, last_used_at, expires_at, revoked_at",
      )
      .eq("workspace_id", input.workspaceId)
      .eq("created_by", input.actorUserId)
      .order("created_at", { ascending: false });
    queryError("MCP token list failed", result.error);
    return rows(result.data).map((row) => this.publicToken(row));
  }

  private publicToken(row: Row): PublicMcpTokenRecord {
    return {
      createdAt: requiredString(row, "created_at"),
      expiresAt: nullableString(row.expires_at),
      id: requiredString(row, "id"),
      lastUsedAt: nullableString(row.last_used_at),
      name: requiredString(row, "name"),
      revokedAt: nullableString(row.revoked_at),
      scopes: strings(row.scopes).filter(isScope),
      tokenPrefix: requiredString(row, "token_prefix"),
      userId: requiredString(row, "created_by"),
      workspaceId: requiredString(row, "workspace_id"),
    };
  }

  /**
   * A targeted lookup, not a filtered workspace load (Codex remedy P0-B).
   * `loadWorkspace` carries a row budget; on a repository past it an
   * artifact the user named simply was not in the answer, and nothing said
   * so. This asks the database for that path.
   */
  async findArtifacts(
    principal: McpPrincipal,
    selector: { id?: string | undefined; path?: string | undefined },
  ): Promise<readonly McpArtifactMatch[]> {
    const workspaceId = principal.workspaceId;
    if (!selector.id && !selector.path) return [];
    const query = this.client
      .from("artifacts")
      .select("id, repository_id, kind, path, metadata, source_blob_sha")
      .eq("workspace_id", workspaceId);
    const matches = await (
      selector.id
        ? query.eq("id", selector.id)
        : query.eq("path", selector.path ?? "")
    )
      .order("repository_id", { ascending: true })
      .limit(MCP_ARTIFACT_MATCH_LIMIT);
    queryError("MCP artifact lookup failed", matches.error);

    const matchRows = rows(matches.data);
    if (matchRows.length === 0) return [];

    const repositoryIds = [
      ...new Set(matchRows.map((row) => requiredString(row, "repository_id"))),
    ];
    const repositories = await this.client
      .from("repositories")
      .select("id, full_name")
      .eq("workspace_id", workspaceId)
      .in("id", repositoryIds);
    queryError("MCP artifact repository lookup failed", repositories.error);
    const fullNames = new Map(
      rows(repositories.data).map((row) => [
        requiredString(row, "id"),
        requiredString(row, "full_name"),
      ]),
    );

    const labels = await this.client
      .from("graph_nodes")
      .select("id, label")
      .eq("workspace_id", workspaceId)
      .in(
        "id",
        matchRows.map((row) => requiredString(row, "id")),
      );
    queryError("MCP artifact label lookup failed", labels.error);
    const labelById = new Map(
      rows(labels.data).map((row) => [
        requiredString(row, "id"),
        requiredString(row, "label"),
      ]),
    );

    return matchRows.flatMap((row) => {
      const repositoryId = requiredString(row, "repository_id");
      const fullName = fullNames.get(repositoryId);
      // A repository the principal cannot see returns no name, and an
      // artifact with no visible repository is not this workspace's answer.
      if (!fullName) return [];
      return [
        {
          artifact: artifactData(row, labelById),
          repositoryFullName: fullName,
          repositoryId,
        },
      ];
    });
  }

  /**
   * The edge read, paged through `public.read_edge_page` (step S3).
   *
   * PostgREST could bound the read but not resume it, so a repository past
   * the budget lost every edge after the cut. The function walks a keyset
   * and reports whether more remain, so this stops on a stated budget rather
   * than on an invisible transport cap — and says which, and where it got to.
   */
  /** The fence value for the whole workspace, or null when it is unreadable. */
  async #revisionOf(workspaceId: string): Promise<number | null> {
    const response = await this.client.rpc("revision_of", {
      target_repository_id: null,
      target_workspace_id: workspaceId,
    });
    // A store that cannot read the revision reports an unproven read rather
    // than pretending to a fence it does not have.
    if (response.error) return null;
    const value = Number(response.data);
    return Number.isFinite(value) ? value : null;
  }

  async #readEdgePages(
    workspaceId: string,
    expectedRevision: number | null,
  ): Promise<{ rows: Row[]; truncation: McpReadTruncation | null }> {
    const collected: Row[] = [];
    let cursor: string | null = null;
    for (let request = 0; request < MCP_EDGE_MAX_PAGES; request += 1) {
      const response = await this.client.rpc("read_edge_page", {
        after_edge_id: cursor,
        byte_budget: MCP_EDGE_PAGE_BYTES,
        expected_revision: expectedRevision,
        row_budget: MCP_EDGE_PAGE_ROWS,
        target_repository_id: null,
        target_workspace_id: workspaceId,
      });
      queryError("MCP edge page query failed", response.error);
      const page = record(response.data);
      // The ground moved under a fenced page: stop rather than splice rows
      // from two states together. The caller's coverage says so.
      if (page.revisionChanged === true) {
        return {
          rows: collected,
          truncation: { limit: collected.length, table: "edges" },
        };
      }
      collected.push(...rows(page.edges));
      if (page.hasMore !== true) return { rows: collected, truncation: null };
      cursor = typeof page.nextCursor === "string" ? page.nextCursor : null;
      // A page that claims more but hands back no cursor cannot be resumed;
      // stopping is the only honest move.
      if (cursor === null) break;
    }
    return {
      rows: collected,
      truncation: {
        limit: MCP_EDGE_PAGE_ROWS * MCP_EDGE_MAX_PAGES,
        table: "edges",
      },
    };
  }

  async loadWorkspace(principal: McpPrincipal): Promise<McpWorkspaceData> {
    const workspaceId = principal.workspaceId;
    /**
     * Every read below orders by `id` and asks for one row more than it will
     * use, so "there is more" becomes an observation instead of an
     * assumption (Codex remedy P0-B, REMEDY §5.2). Before this, none of them
     * set a limit or an order at all: PostgREST answered with an arbitrary,
     * unordered `max_rows` and the result was presented as the whole graph.
     * Raising `max_rows` was the rejected alternative — it moves the cliff
     * without telling anyone where it is.
     */
    const truncated: McpReadTruncation[] = [];
    /**
     * The revision fence (Codex remedy §5.3, step S6). A workspace load makes
     * many reads and Read Committed gives each its own snapshot, so the only
     * honest way to claim they belong together is to check that no writer
     * published between the first and the last. Read before, read after, and
     * report which.
     */
    const revisionBefore = await this.#revisionOf(workspaceId);
    const kept = (table: string, data: unknown): Row[] => {
      const all = rows(data);
      if (all.length <= MCP_WORKSPACE_READ_LIMIT) return all;
      truncated.push({ limit: MCP_WORKSPACE_READ_LIMIT, table });
      return all.slice(0, MCP_WORKSPACE_READ_LIMIT);
    };
    const [
      repositories,
      nodes,
      artifacts,
      requirements,
      evidence,
      edgePages,
      findings,
      receipts,
      indexEntries,
      memoryEntries,
      moduleSummaries,
      routes,
      dbObjects,
      sections,
    ] = await Promise.all([
      this.client
        .from("repositories")
        .select("id, full_name, default_branch")
        .eq("workspace_id", workspaceId)
        .order("id", { ascending: true })
        .limit(MCP_WORKSPACE_READ_LIMIT + 1),
      this.client
        .from("graph_nodes")
        .select("id, label")
        .eq("workspace_id", workspaceId)
        .order("id", { ascending: true })
        .limit(MCP_WORKSPACE_READ_LIMIT + 1),
      this.client
        .from("artifacts")
        .select("id, repository_id, kind, path, metadata, source_blob_sha")
        .eq("workspace_id", workspaceId)
        .order("id", { ascending: true })
        .limit(MCP_WORKSPACE_READ_LIMIT + 1),
      this.client
        .from("requirements")
        .select("id, repository_id, source_artifact_id, statement, status")
        .eq("workspace_id", workspaceId)
        .order("id", { ascending: true })
        .limit(MCP_WORKSPACE_READ_LIMIT + 1),
      this.client
        .from("evidence")
        .select(
          "id, repository_id, source_artifact_id, kind, verdict, metadata",
        )
        .eq("workspace_id", workspaceId)
        .order("id", { ascending: true })
        .limit(MCP_WORKSPACE_READ_LIMIT + 1),
      this.#readEdgePages(workspaceId, revisionBefore),
      this.client
        .from("findings")
        .select(
          "id, repository_id, title, source_node_id, target_node_id, kind, severity, status, provenance, confidence, evidence_grade",
        )
        .eq("workspace_id", workspaceId)
        .order("id", { ascending: true })
        .limit(MCP_WORKSPACE_READ_LIMIT + 1),
      this.client
        .from("receipts")
        .select("id, repository_id, commit_sha, status, summary, digest")
        .eq("workspace_id", workspaceId)
        .order("id", { ascending: true })
        .limit(MCP_WORKSPACE_READ_LIMIT + 1),
      this.client
        .from("index_entries")
        .select(
          "id, repository_id, node_id, neighbor_ids, search_key, entry_type, title, path, headings, tags, symbols",
        )
        .eq("workspace_id", workspaceId)
        .order("id", { ascending: true })
        .limit(MCP_WORKSPACE_READ_LIMIT + 1),
      this.client
        .from("memory_block_entries")
        .select("id, anchor_node_id, name, entry_key, text, valid_from")
        .eq("workspace_id", workspaceId)
        .is("invalidated_at", null),
      this.client
        .from("module_summaries")
        .select(
          "repository_id, module_key, name, member_paths, member_digest, summary",
        )
        .eq("workspace_id", workspaceId)
        .order("id", { ascending: true })
        .limit(MCP_WORKSPACE_READ_LIMIT + 1),
      this.client
        .from("routes")
        .select("id, repository_id, url, tier, methods")
        .eq("workspace_id", workspaceId)
        .order("id", { ascending: true })
        .limit(MCP_WORKSPACE_READ_LIMIT + 1),
      this.client
        .from("db_objects")
        .select("id, repository_id, name, kind, source_path, source_line")
        .eq("workspace_id", workspaceId)
        .order("id", { ascending: true })
        .limit(MCP_WORKSPACE_READ_LIMIT + 1),
      this.client
        .from("sections")
        .select("id, repository_id, token, heading, source_path")
        .eq("workspace_id", workspaceId)
        .order("id", { ascending: true })
        .limit(MCP_WORKSPACE_READ_LIMIT + 1),
    ]);
    for (const [label, result] of [
      ["repositories", repositories],
      ["graph nodes", nodes],
      ["artifacts", artifacts],
      ["requirements", requirements],
      ["evidence", evidence],

      ["findings", findings],
      ["receipts", receipts],
      ["index entries", indexEntries],
      ["memory entries", memoryEntries],
      ["module summaries", moduleSummaries],
      ["routes", routes],
      ["database objects", dbObjects],
      ["sections", sections],
    ] as const)
      queryError(`MCP ${label} query failed`, result.error);

    const labels = new Map(
      kept("graph_nodes", nodes.data).map((row) => [
        requiredString(row, "id"),
        requiredString(row, "label"),
      ]),
    );
    const artifactRows = kept("artifacts", artifacts.data);
    const requirementRows = kept("requirements", requirements.data);
    const evidenceRows = kept("evidence", evidence.data);
    const edgeRows = edgePages.rows;
    if (edgePages.truncation) truncated.push(edgePages.truncation);

    // What each repository's rows are standing on: the revision, the commit
    // the structure was published from, and whether the derived layer caught
    // up. Three independent states, reported as three (REMEDY §5.4).
    const basisResponse = await this.client.rpc("read_repository_basis", {
      target_workspace_id: workspaceId,
    });
    const basisByRepository = new Map<string, McpReadBasis>(
      (basisResponse.error ? [] : rows(basisResponse.data)).map((row) => [
        requiredString(row, "repositoryId"),
        row as unknown as McpReadBasis,
      ]),
    );
    /**
     * What the vocabulary filter left behind, per repository and relation.
     * A read that returns less than it found without saying so makes a
     * caller confident about an absence it never checked (Codex remedy
     * P0-D #5).
     */
    const edgeOmissionsFor = (repositoryId: string): McpEdgeOmission[] => {
      const counts = new Map<string, number>();
      for (const row of edgeRows) {
        if (row.repository_id !== repositoryId || isRelation(row.relation)) {
          continue;
        }
        const relation = String(row.relation);
        counts.set(relation, (counts.get(relation) ?? 0) + 1);
      }
      return [...counts]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([relation, count]) => ({
          count,
          reason:
            relation === "contains"
              ? "the directory hierarchy is excluded from graph answers until the tools can filter it (todo 22)"
              : "relation is outside the MCP vocabulary",
          relation,
        }));
    };
    const findingRows = kept("findings", findings.data);
    const receiptRows = kept("receipts", receipts.data);
    const indexRows = kept("index_entries", indexEntries.data);
    const moduleSummaryRows = kept("module_summaries", moduleSummaries.data);
    const routeRows = kept("routes", routes.data);
    const dbObjectRows = kept("db_objects", dbObjects.data);
    const sectionRows = kept("sections", sections.data);

    const artifactPathById = new Map(
      artifactRows.map((row) => [
        requiredString(row, "id"),
        requiredString(row, "path"),
      ]),
    );

    const revisionAfter = await this.#revisionOf(workspaceId);
    const fenceHeld =
      revisionBefore !== null &&
      revisionAfter !== null &&
      revisionBefore === revisionAfter;

    return {
      coverage: {
        readConsistency: fenceHeld ? "revision-fenced" : "unproven",
        result: truncated.length === 0 ? "complete" : "partial",
        truncated,
      },
      id: workspaceId,
      memoryEntries: kept("memory_block_entries", memoryEntries.data).flatMap(
        (row) => {
          const name = String(row.name);
          if (
            name !== "conventions" &&
            name !== "decisions" &&
            name !== "gotchas"
          )
            return [];
          const anchorNodeId = nullableString(row.anchor_node_id);
          return [
            {
              anchorNodeId,
              anchorPath: anchorNodeId
                ? (artifactPathById.get(anchorNodeId) ?? null)
                : null,
              entryKey: requiredString(row, "entry_key"),
              id: requiredString(row, "id"),
              name,
              text: requiredString(row, "text"),
              updatedAt: requiredString(row, "valid_from"),
            },
          ];
        },
      ),
      ownerUserId: principal.userId,
      repositories: rows(repositories.data).map((repository) => {
        const repositoryId = requiredString(repository, "id");
        const repoArtifacts = artifactRows.filter(
          (row) => row.repository_id === repositoryId,
        );
        const repoIndex = indexRows.filter(
          (row) => row.repository_id === repositoryId,
        );
        return {
          moduleSummaries: moduleSummaryRows
            .filter((row) => row.repository_id === repositoryId)
            .map((row) => ({
              memberDigest: requiredString(row, "member_digest"),
              memberPaths: strings(row.member_paths),
              moduleKey: requiredString(row, "module_key"),
              name: requiredString(row, "name"),
              summary: requiredString(row, "summary"),
            })),
          artifacts: repoArtifacts.map((row) => artifactData(row, labels)),
          contextPacks:
            repoIndex.length === 0
              ? []
              : [
                  {
                    content: repoIndex
                      .map(
                        (row) =>
                          `${String(row.title ?? "Indexed item")} (${String(row.path ?? "unknown path")})`,
                      )
                      .filter(Boolean)
                      .join("\n\n"),
                    id: repositoryId,
                    nodeIds: repoIndex.map((row) =>
                      requiredString(row, "node_id"),
                    ),
                    paths: [
                      ...new Set(
                        repoIndex
                          .map((row) => String(row.path ?? ""))
                          .filter(Boolean),
                      ),
                    ],
                    title: `${requiredString(repository, "full_name")} indexed context`,
                  },
                ],
          defaultBranch: requiredString(repository, "default_branch"),
          ...(basisByRepository.has(repositoryId)
            ? { basis: basisByRepository.get(repositoryId) as McpReadBasis }
            : {}),
          edgeOmissions: edgeOmissionsFor(repositoryId),
          edges: edgeRows
            .filter((row) => row.repository_id === repositoryId)
            .flatMap((row) =>
              isRelation(row.relation)
                ? [
                    {
                      confidence:
                        row.confidence === null || row.confidence === undefined
                          ? null
                          : Number(row.confidence),
                      family: edgeFamily(row.family),
                      id: requiredString(row, "id"),
                      provenance: edgeProvenance(row.provenance),
                      relation: row.relation,
                      sourceNodeId: requiredString(row, "source_node_id"),
                      targetNodeId: requiredString(row, "target_node_id"),
                      tier: edgeTier(record(row.provenance).tier),
                    },
                  ]
                : [],
            ),
          evidence: evidenceRows
            .filter((row) => row.repository_id === repositoryId)
            .map((row) => {
              const metadata = record(row.metadata);
              return {
                id: requiredString(row, "id"),
                kind: requiredString(row, "kind"),
                sourceArtifactId: requiredString(row, "source_artifact_id"),
                ...(typeof metadata.status === "string"
                  ? { status: metadata.status }
                  : {}),
                verdict: requiredString(row, "verdict"),
              };
            }),
          findings: findingRows
            .filter((row) => row.repository_id === repositoryId)
            .map((row) => ({
              confidence: Number(row.confidence),
              evidenceGrade:
                row.evidence_grade === "verified" ? "verified" : "inferred",
              id: requiredString(row, "id"),
              kind: requiredString(row, "kind"),
              provenance: findingProvenance(row.provenance),
              severity: requiredString(row, "severity"),
              sourceNodeId: nullableString(row.source_node_id),
              status: requiredString(row, "status"),
              targetNodeId: nullableString(row.target_node_id),
              title: requiredString(row, "title"),
            })),
          fullName: requiredString(repository, "full_name"),
          id: repositoryId,
          indexEntries: repoIndex.flatMap((row) => {
            if (!isNodeType(row.entry_type)) return [];
            return [
              {
                headings: strings(row.headings),
                id: requiredString(row, "id"),
                neighborIds: strings(row.neighbor_ids),
                nodeId: requiredString(row, "node_id"),
                path: requiredString(row, "path"),
                searchKey: requiredString(row, "search_key"),
                symbols: strings(row.symbols),
                tags: strings(row.tags),
                title: requiredString(row, "title"),
                type: row.entry_type,
              },
            ];
          }),
          overview: `${requiredString(repository, "full_name")} on ${requiredString(repository, "default_branch")}`,
          receipts: receiptRows
            .filter((row) => row.repository_id === repositoryId)
            .map((row) => ({
              commitSha: requiredString(row, "commit_sha"),
              digest: nullableString(row.digest),
              id: requiredString(row, "id"),
              status: requiredString(row, "status"),
              summary: record(row.summary),
            })),
          requirements: requirementRows
            .filter((row) => row.repository_id === repositoryId)
            .map((row) => ({
              id: requiredString(row, "id"),
              sourceArtifactId: requiredString(row, "source_artifact_id"),
              statement: requiredString(row, "statement"),
              status: requiredString(row, "status"),
            })),
          routes: routeRows
            .filter((row) => row.repository_id === repositoryId)
            .map((row) => ({
              methods: strings(row.methods),
              nodeId: requiredString(row, "id"),
              tier:
                row.tier === "reference"
                  ? ("reference" as const)
                  : ("resolved" as const),
              url: requiredString(row, "url"),
            })),
          dbObjects: dbObjectRows
            .filter((row) => row.repository_id === repositoryId)
            .map((row) => ({
              kind: dbObjectKind(row.kind),
              name: requiredString(row, "name"),
              nodeId: requiredString(row, "id"),
              sourceLine: Number(row.source_line ?? 0),
              sourcePath: requiredString(row, "source_path"),
            })),
          sections: sectionRows
            .filter((row) => row.repository_id === repositoryId)
            .map((row) => ({
              heading: requiredString(row, "heading"),
              nodeId: requiredString(row, "id"),
              sourcePath: requiredString(row, "source_path"),
              token: requiredString(row, "token"),
            })),
        };
      }),
    };
  }

  async publishAccessEvent(
    channel: string,
    event: McpAccessEvent,
  ): Promise<void> {
    // httpSend() is the documented REST broadcast primitive: it never joins
    // the WebSocket, so there is no subscribe/wait-for-ack step per event
    // (QW-17). Calling .send() on an unsubscribed channel worked too, but
    // only via an implicit, warning-emitting fallback the SDK has flagged
    // for removal — this is the explicit, supported replacement.
    const realtime = this.client.channel(channel);
    try {
      const result = await realtime.httpSend("access_event", event);
      if (!result.success) {
        const reason = "error" in result ? result.error : "unknown error";
        throw new Error(`Realtime broadcast failed: ${reason}`);
      }
    } finally {
      await this.client.removeChannel(realtime);
    }
  }

  async requestModuleSummary(
    principal: McpPrincipal,
    input: {
      memberDigest: string;
      memberPaths: string[];
      moduleKey: string;
      repositoryId: string;
    },
  ): Promise<{ jobId: string | null }> {
    // BYOK on the default provider wins over credits — the same decision the
    // settings trigger makes; no new billing path.
    const keyed = await this.client
      .from("workspace_ai_keys")
      .select("provider")
      .eq("workspace_id", principal.workspaceId)
      .eq("provider", "anthropic")
      .maybeSingle();
    const result = await this.client.rpc("enqueue_module_summary_job", {
      requested_billing_mode: keyed.data ? "byok" : "credits",
      requested_provider: "anthropic",
      target_member_digest: input.memberDigest,
      target_member_paths: input.memberPaths,
      target_module_key: input.moduleKey,
      target_repository_id: input.repositoryId,
      target_workspace_id: principal.workspaceId,
    });
    if (result.error) {
      throw new Error(`Module summary enqueue failed: ${result.error.message}`);
    }
    return { jobId: result.data ? String(result.data) : null };
  }

  async recordAccessEvent(
    event: McpAccessEvent,
    measurement?: McpPackMeasurement,
  ): Promise<void> {
    const result = await this.client.from("access_events").insert({
      id: event.id,
      occurred_at: event.occurredAt,
      pack_baseline_tokens: measurement?.baselineTokens ?? null,
      pack_selected_tokens: measurement?.selectedTokens ?? null,
      target_node_ids: event.targetNodeIds,
      token_id: event.tokenId,
      tool: event.tool,
      workspace_id: event.workspaceId,
    });
    queryError("Access event write failed", result.error);
  }

  async revokeAccessToken(input: {
    actorUserId: string;
    tokenId: string;
    workspaceId: string;
  }): Promise<void> {
    await this.assertOwner(input.actorUserId, input.workspaceId);
    const result = await this.client
      .from("mcp_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", input.tokenId)
      .eq("workspace_id", input.workspaceId)
      .eq("created_by", input.actorUserId)
      .select("id")
      .maybeSingle();
    queryError("MCP token revocation failed", result.error);
    if (!result.data) throw new Error("MCP token not found");
  }
}
