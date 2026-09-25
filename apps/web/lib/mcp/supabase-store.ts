import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MCP_ARTIFACT_MATCH_LIMIT,
  MCP_EDGE_FAMILIES,
  MCP_EDGE_MAX_PAGES,
  MCP_EDGE_PAGE_BYTES,
  MCP_EDGE_PAGE_ROWS,
  MCP_EDGE_RELATIONS,
  MCP_EDGE_TIERS,
  MCP_NODE_TYPES,
  MCP_DEFAULT_READ_BANDS,
  MCP_SCOPES,
  MCP_WORKSPACE_READ_LIMIT,
  SYMBOL_EDGE_RELATIONS,
  SYMBOL_LAYER_LIMITS,
  bandUnsupportedReason,
  selectFileSymbols,
  selectSymbolNeighborhood,
  createAccessTokenSecret,
  createUlid,
  edgeOmissionReason,
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
  type McpEdgeData,
  type McpEdgeFamily,
  type McpEdgeOmission,
  type McpEdgeProvenance,
  type McpEdgeRelation,
  type McpEdgeTier,
  type McpFileSymbolRead,
  type McpReadBasis,
  type McpRescanResult,
  type McpReadTruncation,
  type McpReceiptSummaryRead,
  type McpFindingProvenance,
  type McpNodeType,
  type McpSourceSpan,
  type McpSymbolData,
  type McpSymbolNeighborhood,
  type McpTodoMatch,
  type McpNote,
  type McpPackMeasurement,
  type McpPrincipal,
  type McpProgressEvent,
  type McpProgressStatus,
  type McpBandRead,
  type McpReadBand,
  type McpScope,
  type McpSessionUsageInput,
  type McpSessionUsageResult,
  type McpStore,
  type McpWorkspaceData,
  type PublicMcpTokenRecord,
} from "@alrescha/mcp";
import { LINK_SCHEMA_VERSION, summaryState } from "@alrescha/core";

import { firstRowsById, readInBatches } from "../supabase/id-batches";
import { readByIdPages, type RowPage } from "../supabase/row-pages";

type Row = Record<string, unknown>;
/**
 * The part of a PostgREST query builder the paged reads use (RE-04).
 *
 * Stated structurally because supabase-js types a select from its column
 * string, and a column list chosen at run time sends that inference into a
 * recursion TypeScript gives up on. One cast, where the builder is made.
 */
interface TableQuery extends PromiseLike<RowPage<Row>> {
  eq(column: string, value: unknown): TableQuery;
  gt(column: string, value: unknown): TableQuery;
  in(column: string, values: readonly unknown[]): TableQuery;
  is(column: string, value: null): TableQuery;
  limit(count: number): TableQuery;
  neq(column: string, value: unknown): TableQuery;
  or(filters: string): TableQuery;
  order(column: string, options: { ascending: boolean }): TableQuery;
}

/**
 * Minimum gap between `last_used_at` touches on the same token (QW-11). The
 * column is observability only (surfaced in the tokens settings UI), so
 * coalescing writes within this window trades a little display staleness
 * for one fewer write per tool call under repeat use.
 */
const LAST_USED_AT_TOUCH_THROTTLE_MS = 5 * 60_000;

/** A PostgREST (`PGRST116`) or SQLSTATE (`57014`) code, and nothing else. */
const RESPONSE_CODE = /^(?:PGRST\d{3}|[0-9A-Z]{5})$/;

/**
 * A failed read as an error a verifier can classify without keeping its
 * body (RE-04): `[HTTP 414] MCP symbol edge query failed: URI too long`.
 *
 * The status and the response code lead and the label names the read;
 * everything after the colon is the upstream's text, which may quote the
 * request. The first `search_index` after 47b32d2 failed with a message
 * that led with none of these, and the only way to tell which read it was
 * would have been to keep the text. A response with no status — only a
 * test double's — keeps the old form.
 */
function queryError(
  label: string,
  response: {
    error: { code?: string; message: string } | null;
    status?: number;
  },
): void {
  const { error } = response;
  if (!error) return;
  const code =
    typeof error.code === "string" && RESPONSE_CODE.test(error.code)
      ? ` ${error.code}`
      : "";
  const tag =
    typeof response.status === "number"
      ? `[HTTP ${response.status}${code}] `
      : "";
  throw new Error(`${tag}${label}: ${error.message}`);
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
/**
 * A concept's kind, as the synthesis wrote it (`concepts_kind` CHECK).
 * A row outside the three is a defect, not a fourth kind.
 */
function conceptKind(value: unknown): "api" | "concept" | "system" {
  if (value === "api" || value === "concept" || value === "system") {
    return value;
  }
  throw new Error(`Malformed database row: concept kind ${String(value)}`);
}

function dbObjectKind(value: unknown): McpDbObjectData["kind"] {
  return value === "function" || value === "view" ? value : "table";
}

function isScope(value: string): value is McpScope {
  return MCP_SCOPES.some((scope) => scope === value);
}

/** The five words the SQL returns; anything else is a schema that moved. */
function todoMatch(value: unknown): McpTodoMatch {
  const word = String(value);
  return word === "created" ||
    word === "id" ||
    word === "normalized_title" ||
    word === "source_key" ||
    word === "todo_id"
    ? word
    : "created";
}

/**
 * The node vocabulary, read from the package (Codex remedy P0-D). This was
 * the fourth hand-maintained copy the comment on `MCP_NODE_TYPES` warns
 * about, and it had fallen six values behind — `memory`, `route`,
 * `db_object`, `section` and now `todo` all failed this guard.
 */
function isNodeType(value: unknown): value is McpNodeType {
  return (MCP_NODE_TYPES as readonly string[]).includes(String(value));
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

const ULID_SHAPE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const SYMBOL_COLUMNS =
  "id, repository_id, artifact_id, path, container, kind, name, start_line, end_line, engine, stable_key";
const SYMBOL_EDGE_COLUMNS =
  "id, source_node_id, target_node_id, relation, family, confidence, provenance";

/** One symbol row (todo 26): the columns the table has, and no other. */
function symbolData(row: Row): McpSymbolData {
  return {
    artifactNodeId: requiredString(row, "artifact_id"),
    container: nullableString(row.container),
    endLine: Number(row.end_line),
    engine: nullableString(row.engine),
    kind: requiredString(row, "kind"),
    name: requiredString(row, "name"),
    nodeId: requiredString(row, "id"),
    path: requiredString(row, "path"),
    repositoryId: requiredString(row, "repository_id"),
    stableKey: requiredString(row, "stable_key"),
    startLine: Number(row.start_line),
  };
}

/** A symbol edge, or null when the row names a relation the layer has not. */
function symbolEdgeData(row: Row): McpEdgeData | null {
  const relation = String(row.relation);
  if (!(SYMBOL_EDGE_RELATIONS as readonly string[]).includes(relation)) {
    return null;
  }
  return {
    confidence:
      row.confidence === null || row.confidence === undefined
        ? null
        : Number(row.confidence),
    family: edgeFamily(row.family),
    id: requiredString(row, "id"),
    provenance: edgeProvenance(row.provenance),
    relation: relation as McpEdgeRelation,
    sourceNodeId: requiredString(row, "source_node_id"),
    targetNodeId: requiredString(row, "target_node_id"),
    tier: edgeTier(record(row.provenance).tier),
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
    queryError("Workspace owner check failed", result);
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
    queryError("MCP note write failed", result);
    return note;
  }

  async appendProgress(
    principal: McpPrincipal,
    input: {
      commitSha?: string | undefined;
      refs?: string[] | undefined;
      repositoryId?: string | undefined;
      status: McpProgressStatus;
      summary: string;
      task: string;
      todoId?: string | undefined;
    },
  ): Promise<McpProgressEvent> {
    const result = await this.client.rpc("log_progress_atomic", {
      p_commit_sha: input.commitSha ?? null,
      p_refs: input.refs ?? [],
      p_repository_id: input.repositoryId ?? null,
      p_status: input.status,
      p_summary: input.summary,
      p_task: input.task,
      p_todo_id: input.todoId ?? null,
      p_token_id: principal.tokenId,
      p_user_id: principal.userId,
      p_workspace_id: principal.workspaceId,
    });
    queryError("MCP progress write failed", result);
    const row = rows(result.data)[0];
    if (!row) throw new Error("MCP progress write failed: empty result");
    const event: McpProgressEvent = {
      commitSha: input.commitSha ?? null,
      id: requiredString(row, "event_id"),
      // How the entry found its todo, as the function reports it — not
      // re-derived here, because two answers to "did this create a todo"
      // is exactly the drift the equivalence test exists to catch.
      matched: todoMatch(row.todo_matched),
      occurredAt: requiredString(row, "event_occurred_at"),
      refs: input.refs ?? [],
      repositoryId: input.repositoryId ?? null,
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
    queryError("MCP token lookup failed", result);
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
    queryError("MCP token issuance failed", inserted);
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
    queryError("MCP token list failed", result);
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
  /**
   * One table's rows for a workspace, in id order, up to `limit` — paged
   * past the server's own row cap (RE-04).
   *
   * PostgREST stops every answer at `max_rows` (1,000 unless the project
   * raised it) and says nothing, so one request for 2,001 rows came back
   * with 1,000 and the read called itself complete. `readByIdPages` asks for
   * the exact count and continues after the last id until the rows are in
   * hand; a table under the cap is still one request. The tenant predicate
   * is on every page.
   */
  #pages(
    workspaceId: string,
    name: string,
    columns: string,
    limit: number,
    narrow: (query: TableQuery) => TableQuery = (query) => query,
  ) {
    return readByIdPages<Row>((page) => {
      let query = narrow(
        (
          this.client
            .from(name)
            .select(
              columns,
              page.count ? { count: "exact" } : undefined,
            ) as unknown as TableQuery
        ).eq("workspace_id", workspaceId),
      );
      if (page.after !== null) query = query.gt("id", page.after);
      return query.order("id", { ascending: true }).limit(page.limit);
    }, limit);
  }

  /**
   * Every receipt with its summary (RE-04 B-01), for the one reader that
   * needs them. The workspace read stopped selecting `summary` because it
   * was 40,101,144 bytes over 330 rows on the pilot and no workspace reader
   * used it; this is the same table, the same order and the same row budget,
   * asked for only when the caller wants the statements.
   */
  async loadReceiptSummaries(
    principal: McpPrincipal,
  ): Promise<McpReceiptSummaryRead> {
    const response = await this.#pages(
      principal.workspaceId,
      "receipts",
      "id, repository_id, commit_sha, status, summary, digest",
      MCP_WORKSPACE_READ_LIMIT + 1,
    );
    queryError("MCP receipt summary query failed", response);
    const all = rows(response.data);
    const kept = all.slice(0, MCP_WORKSPACE_READ_LIMIT);
    return {
      receipts: kept.map((row) => ({
        commitSha: requiredString(row, "commit_sha"),
        digest: nullableString(row.digest),
        id: requiredString(row, "id"),
        repositoryId: requiredString(row, "repository_id"),
        status: requiredString(row, "status"),
        summary: record(row.summary),
      })),
      truncated:
        all.length > MCP_WORKSPACE_READ_LIMIT
          ? { limit: MCP_WORKSPACE_READ_LIMIT, table: "receipts" }
          : null,
    };
  }

  /**
   * The symbol layer for the ids named (todo 26): a file's symbols, a
   * symbol itself, their `declares` and one `extends` hop. Reads by id and
   * never a whole-workspace one — the caps are the map's.
   *
   * Every id list goes out in batches (RE-04). A file's edges used to be one
   * request carrying every symbol of the file, twice, in its URL — about
   * 28,000 characters for a barrel re-exporting 485 names. Each batch runs
   * the query the single request ran, so the merge below is exactly its
   * answer (`firstRowsById`).
   */
  async loadSymbolNeighborhood(
    principal: McpPrincipal,
    input: { nodeIds: readonly string[] },
  ): Promise<McpSymbolNeighborhood> {
    const workspaceId = principal.workspaceId;
    const named = [...new Set(input.nodeIds)].sort();
    const ids = named.filter((id) => ULID_SHAPE.test(id));
    if (ids.length === 0) {
      return { edges: [], symbols: [], truncated: [], unknownNodeIds: named };
    }

    const files = await readInBatches(ids, (batch) =>
      this.client
        .from("artifacts")
        .select("id")
        .eq("workspace_id", workspaceId)
        .in("id", batch),
    );
    for (const response of files) {
      queryError("MCP symbol file lookup failed", response);
    }
    const namedFiles = new Set(
      files.flatMap((response) =>
        rows(response.data).map((row) => requiredString(row, "id")),
      ),
    );
    const fileIds = ids
      .filter((id) => namedFiles.has(id))
      .slice(0, SYMBOL_LAYER_LIMITS.files);
    const symbolIds = ids.filter((id) => !namedFiles.has(id));

    const [byFile, byId] = await Promise.all([
      readInBatches(fileIds, (batch) =>
        this.#pages(
          workspaceId,
          "symbols",
          SYMBOL_COLUMNS,
          SYMBOL_LAYER_LIMITS.symbols + 1,
          (query) => query.in("artifact_id", batch),
        ),
      ),
      readInBatches(symbolIds, (batch) =>
        this.client
          .from("symbols")
          .select(SYMBOL_COLUMNS)
          .eq("workspace_id", workspaceId)
          .in("id", batch),
      ),
    ]);
    for (const response of byFile) {
      queryError("MCP symbol query failed", response);
    }
    for (const response of byId) {
      queryError("MCP symbol lookup failed", response);
    }
    const seeds = new Map<string, McpSymbolData>();
    for (const row of [
      ...firstRowsById(
        byFile.map((response) => rows(response.data)),
        SYMBOL_LAYER_LIMITS.symbols + 1,
      ),
      ...byId.flatMap((response) => rows(response.data)),
    ]) {
      const symbol = symbolData(row);
      seeds.set(symbol.nodeId, symbol);
    }
    if (seeds.size === 0) {
      return selectSymbolNeighborhood(
        { artifactIds: namedFiles, edges: [], symbols: [] },
        named,
      );
    }

    // Every edge that touches a seed: its declaration, what it extends and
    // what extends it. PostgREST's `or` takes the two lists inline; the ids
    // are ULIDs, so nothing in them needs quoting.
    const edgeResults = await readInBatches([...seeds.keys()], (batch) => {
      const list = batch.join(",");
      return this.#pages(
        workspaceId,
        "symbol_edges",
        SYMBOL_EDGE_COLUMNS,
        SYMBOL_LAYER_LIMITS.edges + 1,
        (query) =>
          query.or(`source_node_id.in.(${list}),target_node_id.in.(${list})`),
      );
    });
    for (const response of edgeResults) {
      queryError("MCP symbol edge query failed", response);
    }
    const edges = firstRowsById(
      edgeResults.map((response) => rows(response.data)),
      SYMBOL_LAYER_LIMITS.edges + 1,
    ).flatMap((row) => {
      const edge = symbolEdgeData(row);
      return edge ? [edge] : [];
    });

    // The far end of an `extends` hop is a symbol the reads above did not
    // fetch; its row is what lets the hop be a node rather than an id.
    const farIds = [
      ...new Set(
        edges
          .filter((edge) => edge.relation === "extends")
          .flatMap((edge) => [edge.sourceNodeId, edge.targetNodeId])
          .filter((id) => !seeds.has(id)),
      ),
    ];
    const far = await readInBatches(farIds, (batch) =>
      this.client
        .from("symbols")
        .select(SYMBOL_COLUMNS)
        .eq("workspace_id", workspaceId)
        .in("id", batch),
    );
    for (const response of far) {
      queryError("MCP symbol hop lookup failed", response);
    }
    const farSymbols = far.flatMap((response) =>
      rows(response.data).map(symbolData),
    );
    // …and their declaration edges, so a hop lands on a file too.
    const farDeclares = await readInBatches(
      farSymbols.map(({ nodeId }) => nodeId),
      (batch) =>
        this.client
          .from("symbol_edges")
          .select(SYMBOL_EDGE_COLUMNS)
          .eq("workspace_id", workspaceId)
          .eq("relation", "declares")
          .in("target_node_id", batch),
    );
    for (const response of farDeclares) {
      queryError("MCP symbol hop edge query failed", response);
    }
    const symbols = [...seeds.values(), ...farSymbols];
    return selectSymbolNeighborhood(
      {
        artifactIds: new Set([
          ...namedFiles,
          ...symbols.map(({ artifactNodeId }) => artifactNodeId),
        ]),
        edges: [
          ...edges,
          ...farDeclares.flatMap((response) =>
            rows(response.data).flatMap((row) => {
              const edge = symbolEdgeData(row);
              return edge ? [edge] : [];
            }),
          ),
        ],
        symbols,
      },
      named,
    );
  }

  /**
   * A search hit's symbols (RE-04): the named files' own, in the workspace,
   * with no edge and no hop — a hit shows a name, a kind and a span. Batched
   * like the neighbourhood, and merged to what one ordered, limited query
   * would have kept before the shared rule orders and caps it.
   */
  async loadFileSymbols(
    principal: McpPrincipal,
    input: { fileIds: readonly string[] },
  ): Promise<McpFileSymbolRead> {
    const workspaceId = principal.workspaceId;
    const named = [...new Set(input.fileIds)]
      .filter((id) => ULID_SHAPE.test(id))
      .sort();
    const responses = await readInBatches(
      named.slice(0, SYMBOL_LAYER_LIMITS.files),
      (batch) =>
        this.#pages(
          workspaceId,
          "symbols",
          SYMBOL_COLUMNS,
          SYMBOL_LAYER_LIMITS.symbols + 1,
          (query) => query.in("artifact_id", batch),
        ),
    );
    for (const response of responses) {
      queryError("MCP file symbol query failed", response);
    }
    return selectFileSymbols(
      firstRowsById(
        responses.map((response) => rows(response.data)),
        SYMBOL_LAYER_LIMITS.symbols + 1,
      ).map(symbolData),
      named,
    );
  }

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
    queryError("MCP artifact lookup failed", matches);

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
    queryError("MCP artifact repository lookup failed", repositories);
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
    queryError("MCP artifact label lookup failed", labels);
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
      queryError("MCP edge page query failed", response);
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

  async loadWorkspace(
    principal: McpPrincipal,
    options?: { bands?: readonly McpReadBand[]; edges?: boolean },
  ): Promise<McpWorkspaceData> {
    const workspaceId = principal.workspaceId;
    /**
     * Which bands this read carries (todo 22 ⑹). The two partial ones are
     * skipped unless asked for, and the skip is reported rather than
     * answered with an empty list — "this workspace has no routes" and
     * "this read did not look for routes" are different facts.
     */
    const requested = new Set(options?.bands ?? MCP_DEFAULT_READ_BANDS);
    const wants = (band: McpReadBand): boolean => requested.has(band);
    const empty = { data: [] as unknown, error: null };
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
    /** One table of this read, paged past the server's row cap (RE-04). */
    const table = (
      name: string,
      columns: string,
      narrow?: (query: TableQuery) => TableQuery,
    ) =>
      this.#pages(
        workspaceId,
        name,
        columns,
        MCP_WORKSPACE_READ_LIMIT + 1,
        narrow,
      );
    // Positional, and the order below must match the array exactly. Adding
    // `todos` in the middle of the array while its name stayed at the end of
    // this list shifted every result after it by one, and the first symptom
    // was the module-summary decoder being handed a todo row — a mismatch
    // that only shows up once both tables have rows.
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
      todoRows,
      moduleSummaries,
      routes,
      dbObjects,
      sections,
      concepts,
      basisResponse,
    ] = await Promise.all([
      table("repositories", "id, full_name, default_branch"),
      table("graph_nodes", "id, label", (query) =>
        // Labels name artifacts and nothing else here (`artifactData`), so
        // artifacts are all this reads. It used to take every kind but the
        // symbol layer (todo 26), and requirements, findings, sections and
        // directories spent the row budget too: on 7074b74 the pilot had
        // 2,537 such nodes for 1,550 files, this read stopped at 2,000, and
        // every `search_index` answered `partial` over a table its ranking
        // never reads (RE-04 production read, 2026-09-25). One node per
        // artifact, so this stops where `artifacts` does and not before.
        query.eq("kind", "artifact"),
      ),
      table(
        "artifacts",
        "id, repository_id, kind, path, metadata, source_blob_sha",
      ),
      table(
        "requirements",
        "id, repository_id, source_artifact_id, statement, status",
      ),
      table(
        "evidence",
        "id, repository_id, source_artifact_id, kind, verdict, metadata",
      ),
      // No edge page for a caller that does not walk the graph (RE-04): the
      // pages were most of every search's bytes and its longest chain of
      // requests. The absence is reported as a table that stopped at none.
      options?.edges === false
        ? Promise.resolve({
            rows: [] as Row[],
            truncation: { limit: 0, table: "edges" } as McpReadTruncation,
          })
        : this.#readEdgePages(workspaceId, revisionBefore),
      table(
        "findings",
        "id, repository_id, title, source_node_id, target_node_id, kind, severity, status, provenance, confidence, evidence_grade",
      ),
      // No `summary` (RE-04 B-01). It is the whole in-toto statement — 330
      // receipts were 40,101,144 bytes on the pilot — and no reader of this
      // workspace uses it; the one that does calls `loadReceiptSummaries`.
      table("receipts", "id, repository_id, commit_sha, status, digest"),
      table(
        "index_entries",
        "id, repository_id, node_id, neighbor_ids, search_key, entry_type, title, path, headings, tags, symbols",
      ),
      table(
        "memory_block_entries",
        "id, anchor_node_id, name, entry_key, text, valid_from",
        (query) => query.is("invalidated_at", null),
      ),
      // Todos are workspace-scoped: a checkbox can name no repository at
      // all, so this is not part of the per-repository walk (todo 21).
      wants("evidence")
        ? table(
            "todos",
            "id, repository_id, title, status, source_key, source_event_id, source_path, created_at, updated_at",
          )
        : empty,
      // `id` is selected only to continue past a page; the decoder ignores it.
      table(
        "module_summaries",
        "id, repository_id, module_key, name, member_paths, member_digest, summary",
      ),
      wants("route")
        ? table("routes", "id, repository_id, url, tier, methods")
        : empty,
      wants("database")
        ? table(
            "db_objects",
            "id, repository_id, name, kind, source_path, source_line",
          )
        : empty,
      table("sections", "id, repository_id, token, heading, source_path"),
      // The concept layer (todo 19 ⑴): a semantic band row like a module
      // summary, and read like one — it is prose a model wrote.
      table(
        "concepts",
        "id, repository_id, slug, name, kind, summary, member_paths",
      ),
      // What each repository's rows are standing on (REMEDY §5.4). It needs
      // none of the rows above, so it no longer waits for them as a round
      // trip of its own (RE-04); it is still read after the first revision
      // and before the second, inside the fence like every read here.
      this.client.rpc("read_repository_basis", {
        target_workspace_id: workspaceId,
      }),
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
      ["todos", todoRows],
      ["module summaries", moduleSummaries],
      ["routes", routes],
      ["database objects", dbObjects],
      ["sections", sections],
      ["concepts", concepts],
    ] as const)
      queryError(`MCP ${label} query failed`, result);

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
          reason: edgeOmissionReason(relation),
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
    const conceptRows = kept("concepts", concepts.data);

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

    // Per band, in three states (todo 22 ⑹ / 보완 R-01). A band nobody asked
    // for is absent from this list; a band that was asked for and cannot be
    // answered says so with its reason.
    const bandTables: Partial<Record<McpReadBand, readonly string[]>> = {
      database: ["db_objects"],
      evidence: ["requirements", "evidence", "findings", "receipts", "todos"],
      route: ["routes"],
      semantic: [
        "sections",
        "module_summaries",
        "memory_block_entries",
        "concepts",
      ],
      structure: ["repositories", "graph_nodes", "artifacts", "index_entries"],
    };
    const bands: McpBandRead[] = [...requested].sort().map((band) => {
      const unsupported = bandUnsupportedReason(band);
      if (unsupported) {
        return { band, reason: unsupported, result: "unsupported" as const };
      }
      const short = truncated.filter(({ table }) =>
        (bandTables[band] ?? []).includes(table),
      );
      return short.length === 0
        ? { band, reason: null, result: "complete" as const }
        : {
            band,
            reason: short
              .map(({ limit, table }) => `${table} stopped at ${limit} rows`)
              .join("; "),
            result: "truncated" as const,
          };
    });

    return {
      coverage: {
        bands,
        readConsistency: fenceHeld ? "revision-fenced" : "unproven",
        result: truncated.length === 0 ? "complete" : "partial",
        truncated,
      },
      id: workspaceId,
      todos: kept("todos", todoRows.data).flatMap((row) => {
        const status = String(row.status);
        // The CHECK on the column allows exactly these four; a fifth value
        // means the schema moved, and dropping the row is safer than
        // widening a union at the decoder.
        if (
          status !== "open" &&
          status !== "in-progress" &&
          status !== "done" &&
          status !== "blocked"
        ) {
          return [];
        }
        return [
          {
            createdAt: String(row.created_at),
            id: requiredString(row, "id"),
            repositoryId: nullableString(row.repository_id),
            sourceEventId: nullableString(row.source_event_id) ?? "",
            sourceKey: requiredString(row, "source_key"),
            sourcePath: nullableString(row.source_path),
            status,
            title: requiredString(row, "title"),
            updatedAt: String(row.updated_at),
            workspaceId,
          },
        ];
      }),
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
          concepts: conceptRows
            .filter((row) => row.repository_id === repositoryId)
            .map((row) => ({
              id: requiredString(row, "id"),
              kind: conceptKind(row.kind),
              memberPaths: strings(row.member_paths),
              name: requiredString(row, "name"),
              slug: requiredString(row, "slug"),
              summary: requiredString(row, "summary"),
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
    //
    // Private, because the browser joins the topic as a private channel
    // (Phase 4 Wave B todo 15): Realtime keeps public and private frames on
    // the same topic apart, and a public publish never reaches a private
    // subscriber — measured, not assumed. The service role publishes past
    // the `realtime.messages` policy; that policy is what lets a workspace
    // member, and nobody else, listen.
    const realtime = this.client.channel(channel, {
      config: { private: true },
    });
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

  /**
   * Phase 4 Wave C todo 16. The repository must belong to the principal's
   * workspace, and the SQL function checks that again — a client-supplied id
   * is a request, never a claim.
   */
  async requestRescan(
    principal: McpPrincipal,
    input: {
      mode?: "full" | "incremental" | undefined;
      repositoryId?: string | undefined;
    },
  ): Promise<McpRescanResult> {
    const repositoryId =
      input.repositoryId ?? (await this.#soleRepositoryId(principal));
    if (repositoryId === null) {
      return {
        jobId: null,
        mode: null,
        // Naming a repository is the caller's job when there is more than
        // one; guessing would scan the wrong one silently.
        reason: "name a repository_id: this workspace has none, or several",
        repositoryId: null,
        scheduled: false,
      };
    }

    const result = await this.client.rpc("enqueue_repository_rescan", {
      expected_link_schema_version: LINK_SCHEMA_VERSION,
      requested_mode: input.mode ?? null,
      target_repository_id: repositoryId,
      target_workspace_id: principal.workspaceId,
    });
    queryError("MCP rescan request failed", result);
    const outcome = record(result.data);
    return {
      jobId: typeof outcome.jobId === "string" ? outcome.jobId : null,
      mode:
        outcome.mode === "full" || outcome.mode === "incremental"
          ? outcome.mode
          : null,
      reason: typeof outcome.reason === "string" ? outcome.reason : "unknown",
      repositoryId,
      scheduled: outcome.scheduled === true,
    };
  }

  /** The workspace's repository when it has exactly one, else null. */
  async #soleRepositoryId(principal: McpPrincipal): Promise<string | null> {
    const rows = await this.client
      .from("repositories")
      .select("id")
      .eq("workspace_id", principal.workspaceId)
      .order("id", { ascending: true })
      .limit(2);
    queryError("MCP repository lookup failed", rows);
    const found = rows.data ?? [];
    return found.length === 1 ? String((found[0] as Row)["id"]) : null;
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
      // The length only. `estimated_tokens` is a generated column, so the
      // 4 chars/token assumption stays the schema's and this writer cannot
      // report a ratio of its own (todo 23).
      response_chars: event.responseChars ?? null,
      target_node_ids: event.targetNodeIds,
      token_id: event.tokenId,
      tool: event.tool,
      workspace_id: event.workspaceId,
    });
    queryError("Access event write failed", result);
  }

  /**
   * Phase 4 Wave E todo 23. The workspace opt-in and the tenant check both
   * live in the SQL function, which answers with a status rather than
   * raising — an agent that volunteers its own usage numbers should never
   * lose a call for having done so.
   */
  async reportSessionUsage(
    principal: McpPrincipal,
    input: McpSessionUsageInput,
  ): Promise<McpSessionUsageResult> {
    const result = await this.client.rpc("report_session_usage", {
      target_cache_creation_tokens: input.cacheCreationTokens ?? 0,
      target_cache_read_tokens: input.cacheReadTokens ?? 0,
      target_input_tokens: input.inputTokens ?? 0,
      target_model: input.model ?? null,
      target_output_tokens: input.outputTokens ?? 0,
      target_repository_id: input.repositoryId ?? null,
      target_token_id: principal.tokenId,
      target_workspace_id: principal.workspaceId,
    });
    if (result.error || typeof result.data !== "string") {
      throw new Error(result.error?.message ?? "Session usage report failed");
    }
    return { status: result.data as McpSessionUsageResult["status"] };
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
    queryError("MCP token revocation failed", result);
    if (!result.data) throw new Error("MCP token not found");
  }
}
