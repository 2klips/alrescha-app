import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MCP_SCOPES,
  createAccessTokenSecret,
  createUlid,
  hashAccessToken,
  type IssueAccessTokenInput,
  type IssuedAccessToken,
  type McpAccessEvent,
  type McpEdgeRelation,
  type McpNodeType,
  type McpNote,
  type McpPrincipal,
  type McpProgressEvent,
  type McpProgressStatus,
  type McpScope,
  type McpStore,
  type McpWorkspaceData,
  type PublicMcpTokenRecord,
} from "@specproof/mcp";

type Row = Record<string, unknown>;

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

function isRelation(value: unknown): value is McpEdgeRelation {
  return [
    "requires",
    "implements",
    "tests",
    "supports",
    "contradicts",
    "supersedes",
    "references",
  ].includes(String(value));
}

function findingProvenance(value: unknown) {
  const provenance = record(value);
  const span = record(provenance.span);
  if (
    typeof provenance.sourceArtifactId === "string" &&
    typeof span.path === "string" &&
    typeof span.startLine === "number" &&
    typeof span.endLine === "number"
  ) {
    return {
      sourceArtifactId: provenance.sourceArtifactId,
      span: {
        endLine: span.endLine,
        path: span.path,
        startLine: span.startLine,
      },
    };
  }
  return {
    reason:
      typeof provenance.reason === "string"
        ? provenance.reason
        : "Stored finding provenance",
  };
}

export class SupabaseMcpStore implements McpStore {
  constructor(private readonly client: SupabaseClient) {}

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

  async appendNote(
    principal: McpPrincipal,
    input: { target?: string | undefined; text: string },
  ): Promise<McpNote> {
    await this.assertOwner(principal.userId, principal.workspaceId);
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
    await this.assertOwner(principal.userId, principal.workspaceId);
    const occurredAt = new Date();
    const event: McpProgressEvent = {
      id: createUlid(occurredAt),
      occurredAt: occurredAt.toISOString(),
      refs: input.refs ?? [],
      status: input.status,
      summary: input.summary,
      task: input.task,
      tokenId: principal.tokenId,
      userId: principal.userId,
      workspaceId: principal.workspaceId,
    };
    const result = await this.client.from("progress_events").insert({
      id: event.id,
      occurred_at: event.occurredAt,
      refs: event.refs,
      status: event.status,
      summary: event.summary,
      task: event.task,
      token_id: event.tokenId,
      user_id: event.userId,
      workspace_id: event.workspaceId,
    });
    queryError("MCP progress write failed", result.error);
    return event;
  }

  async authenticateAccessToken(secret: string): Promise<McpPrincipal | null> {
    const result = await this.client
      .from("mcp_tokens")
      .select("id, workspace_id, created_by, scopes, expires_at, revoked_at")
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
    const updated = await this.client
      .from("mcp_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", tokenId)
      .eq("workspace_id", workspaceId);
    queryError("MCP token usage update failed", updated.error);
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

  async loadWorkspace(principal: McpPrincipal): Promise<McpWorkspaceData> {
    await this.assertOwner(principal.userId, principal.workspaceId);
    const workspaceId = principal.workspaceId;
    const [
      repositories,
      nodes,
      artifacts,
      requirements,
      evidence,
      edges,
      findings,
      receipts,
      indexEntries,
    ] = await Promise.all([
      this.client
        .from("repositories")
        .select("id, full_name, default_branch")
        .eq("workspace_id", workspaceId),
      this.client
        .from("graph_nodes")
        .select("id, label")
        .eq("workspace_id", workspaceId),
      this.client
        .from("artifacts")
        .select("id, repository_id, kind, path, metadata")
        .eq("workspace_id", workspaceId),
      this.client
        .from("requirements")
        .select("id, repository_id, source_artifact_id, statement, status")
        .eq("workspace_id", workspaceId),
      this.client
        .from("evidence")
        .select(
          "id, repository_id, source_artifact_id, kind, verdict, metadata",
        )
        .eq("workspace_id", workspaceId),
      this.client
        .from("edges")
        .select("id, repository_id, source_node_id, target_node_id, relation")
        .eq("workspace_id", workspaceId),
      this.client
        .from("findings")
        .select(
          "id, repository_id, title, source_node_id, kind, severity, status, provenance, confidence, evidence_grade",
        )
        .eq("workspace_id", workspaceId),
      this.client
        .from("receipts")
        .select("id, repository_id, commit_sha, status, summary, digest")
        .eq("workspace_id", workspaceId),
      this.client
        .from("index_entries")
        .select(
          "id, repository_id, node_id, neighbor_ids, search_key, entry_type, title, path, headings, tags, symbols",
        )
        .eq("workspace_id", workspaceId),
    ]);
    for (const [label, result] of [
      ["repositories", repositories],
      ["graph nodes", nodes],
      ["artifacts", artifacts],
      ["requirements", requirements],
      ["evidence", evidence],
      ["edges", edges],
      ["findings", findings],
      ["receipts", receipts],
      ["index entries", indexEntries],
    ] as const)
      queryError(`MCP ${label} query failed`, result.error);

    const labels = new Map(
      rows(nodes.data).map((row) => [
        requiredString(row, "id"),
        requiredString(row, "label"),
      ]),
    );
    const artifactRows = rows(artifacts.data);
    const requirementRows = rows(requirements.data);
    const evidenceRows = rows(evidence.data);
    const edgeRows = rows(edges.data);
    const findingRows = rows(findings.data);
    const receiptRows = rows(receipts.data);
    const indexRows = rows(indexEntries.data);

    return {
      id: workspaceId,
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
          artifacts: repoArtifacts.map((row) => {
            const metadata = record(row.metadata);
            const id = requiredString(row, "id");
            const path = requiredString(row, "path");
            return {
              content:
                typeof metadata.summary === "string" ? metadata.summary : "",
              headings: strings(metadata.headings),
              id,
              kind: requiredString(row, "kind"),
              path,
              status:
                typeof metadata.status === "string"
                  ? metadata.status
                  : "active",
              summary:
                typeof metadata.summary === "string"
                  ? metadata.summary
                  : (labels.get(id) ?? path),
              symbols: strings(metadata.symbols),
              tags: strings(metadata.tags),
              title:
                typeof metadata.title === "string"
                  ? metadata.title
                  : (labels.get(id) ?? path),
            };
          }),
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
          edges: edgeRows
            .filter((row) => row.repository_id === repositoryId)
            .flatMap((row) =>
              isRelation(row.relation)
                ? [
                    {
                      id: requiredString(row, "id"),
                      relation: row.relation,
                      sourceNodeId: requiredString(row, "source_node_id"),
                      targetNodeId: requiredString(row, "target_node_id"),
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
        };
      }),
    };
  }

  async publishAccessEvent(
    channel: string,
    event: McpAccessEvent,
  ): Promise<void> {
    const realtime = this.client.channel(channel);
    try {
      const status = await realtime.send({
        event: "access_event",
        payload: event,
        type: "broadcast",
      });
      if (status !== "ok")
        throw new Error(`Realtime broadcast returned ${status}`);
    } finally {
      await this.client.removeChannel(realtime);
    }
  }

  async recordAccessEvent(event: McpAccessEvent): Promise<void> {
    const result = await this.client.from("access_events").insert({
      id: event.id,
      occurred_at: event.occurredAt,
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
