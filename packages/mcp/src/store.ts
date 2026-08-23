import { createHash, randomBytes } from "node:crypto";

export const MCP_SCOPES = ["mcp:read", "mcp:write"] as const;

export type McpScope = (typeof MCP_SCOPES)[number];

export type McpNodeType =
  | "artifact"
  | "requirement"
  | "evidence"
  | "finding"
  | "receipt"
  | "context_pack"
  | "memory";

export type McpEdgeRelation =
  | "requires"
  | "implements"
  | "tests"
  | "supports"
  | "contradicts"
  | "supersedes"
  | "references"
  | "imports"
  | "calls";

export interface McpArtifactData {
  content: string;
  headings: string[];
  id: string;
  kind: string;
  path: string;
  status: string;
  summary: string;
  symbols: string[];
  tags: string[];
  title: string;
}

export interface McpRequirementData {
  id: string;
  sourceArtifactId: string;
  statement: string;
  status: string;
}

export interface McpEvidenceData {
  id: string;
  kind: string;
  sourceArtifactId: string;
  status?: string;
  verdict: string;
}

export interface McpEdgeData {
  id: string;
  relation: McpEdgeRelation;
  sourceNodeId: string;
  targetNodeId: string;
}

export interface McpSourceSpan {
  endLine: number;
  path: string;
  startLine: number;
}

export interface McpFindingData {
  confidence: number;
  evidenceGrade: "inferred" | "verified";
  id: string;
  kind: string;
  provenance:
    { reason: string } | { sourceArtifactId: string; span: McpSourceSpan };
  severity: string;
  sourceNodeId: string | null;
  status: string;
  title: string;
}

export interface McpReceiptData {
  commitSha: string;
  digest: string | null;
  id: string;
  status: string;
  summary: Record<string, unknown>;
}

export interface McpContextPackData {
  content: string;
  id: string;
  nodeIds: string[];
  paths: string[];
  title: string;
}

export interface McpIndexEntryData {
  headings: string[];
  id: string;
  neighborIds: string[];
  nodeId: string;
  path: string;
  searchKey: string;
  symbols: string[];
  tags: string[];
  title: string;
  type: McpNodeType;
}

export interface McpRepositoryData {
  artifacts: McpArtifactData[];
  contextPacks: McpContextPackData[];
  defaultBranch: string;
  edges: McpEdgeData[];
  evidence: McpEvidenceData[];
  findings: McpFindingData[];
  fullName: string;
  id: string;
  indexEntries: McpIndexEntryData[];
  overview: string;
  receipts: McpReceiptData[];
  requirements: McpRequirementData[];
}

/** Closed concept-relation vocabulary (Graft) — agents assert only these. */
export const AGENT_ASSERTION_RELATIONS = [
  "part_of",
  "uses",
  "depends_on",
  "produces",
  "configures",
  "validates",
  "implements",
] as const;
export type AgentAssertionRelation = (typeof AGENT_ASSERTION_RELATIONS)[number];

export const MEMORY_BLOCK_NAMES = [
  "conventions",
  "decisions",
  "gotchas",
] as const;
export type McpMemoryBlockName = (typeof MEMORY_BLOCK_NAMES)[number];

/** One active memory entry, as workspace data for reads and search. */
export interface McpMemoryEntryData {
  anchorNodeId: string | null;
  anchorPath: string | null;
  entryKey: string;
  id: string;
  name: McpMemoryBlockName;
  text: string;
  updatedAt: string;
}

export interface McpAssertLinkResult {
  id: string | null;
  invalidatedId: string | null;
  outcome: "added" | "noop" | "superseded" | "unknown_node";
}

export interface McpWriteMemoryResult {
  id: string | null;
  invalidatedId: string | null;
  outcome:
    | "added"
    | "invalidated"
    | "noop"
    | "rejected_cap"
    | "unknown_node"
    | "updated";
}

export interface McpWorkspaceData {
  id: string;
  /** Active memory entries (Wave D todo 10); absent on older fixtures. */
  memoryEntries?: McpMemoryEntryData[];
  ownerUserId: string;
  repositories: McpRepositoryData[];
}

export interface McpTokenRecord {
  createdAt: string;
  expiresAt: string | null;
  id: string;
  lastUsedAt: string | null;
  name: string;
  revokedAt: string | null;
  scopes: McpScope[];
  tokenHash: string;
  tokenPrefix: string;
  userId: string;
  workspaceId: string;
}

export interface McpPrincipal {
  scopes: readonly McpScope[];
  tokenId: string;
  userId: string;
  workspaceId: string;
}

export type McpProgressStatus = "started" | "progress" | "done" | "blocked";
export type McpTodoStatus = "open" | "in-progress" | "done" | "blocked";

export interface McpTodo {
  createdAt: string;
  id: string;
  sourceEventId: string;
  sourceKey: string;
  status: McpTodoStatus;
  title: string;
  updatedAt: string;
  workspaceId: string;
}

export interface McpProgressEvent {
  id: string;
  occurredAt: string;
  refs: string[];
  status: McpProgressStatus;
  summary: string;
  task: string;
  todoId: string;
  tokenId: string;
  userId: string;
  workspaceId: string;
}

export interface McpNote {
  id: string;
  occurredAt: string;
  target: string | null;
  text: string;
  tokenId: string;
  userId: string;
  workspaceId: string;
}

export interface McpAccessEvent {
  id: string;
  occurredAt: string;
  targetNodeIds: string[];
  tokenId: string;
  tool: string;
  workspaceId: string;
}

export interface McpPackMeasurement {
  accessEventId: string;
  baselineTokens: number;
  occurredAt: string;
  selectedTokens: number;
  workspaceId: string;
}

export interface IssueAccessTokenInput {
  actorUserId: string;
  expiresAt?: string | null;
  name: string;
  scopes: McpScope[];
  workspaceId: string;
}

export interface IssuedAccessToken {
  record: Omit<McpTokenRecord, "tokenHash">;
  secret: string;
}

export type PublicMcpTokenRecord = Omit<McpTokenRecord, "tokenHash">;

function publicTokenRecord(record: McpTokenRecord): PublicMcpTokenRecord {
  return {
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    id: record.id,
    lastUsedAt: record.lastUsedAt,
    name: record.name,
    revokedAt: record.revokedAt,
    scopes: [...record.scopes],
    tokenPrefix: record.tokenPrefix,
    userId: record.userId,
    workspaceId: record.workspaceId,
  };
}

export interface McpStore {
  appendNote(
    principal: McpPrincipal,
    input: { target?: string | undefined; text: string },
  ): Promise<McpNote>;
  /**
   * Record an agent-asserted edge (Wave D todo 9). Bi-temporal and
   * reconciled at write time: same active pair + same relation is a noop, a
   * different relation supersedes (invalidates) the old edge. Deletion does
   * not exist — the schema forbids it.
   */
  assertLink(
    principal: McpPrincipal,
    input: {
      reason: string;
      relation: AgentAssertionRelation;
      sourceNodeId: string;
      targetNodeId: string;
    },
  ): Promise<McpAssertLinkResult>;
  /**
   * Write one bounded memory-block entry (Wave D todo 10) with Mem0-style
   * reconciliation: ADD / UPDATE (invalidate+insert) / NOOP / remove
   * (invalidate). At most 12 active entries per (anchor, name) — over the
   * cap the write is rejected, forcing distillation instead of rotation.
   */
  writeMemory(
    principal: McpPrincipal,
    input: {
      anchorNodeId?: string | undefined;
      entryKey: string;
      name: McpMemoryBlockName;
      remove?: boolean | undefined;
      text?: string | undefined;
    },
  ): Promise<McpWriteMemoryResult>;
  appendProgress(
    principal: McpPrincipal,
    input: {
      refs?: string[] | undefined;
      status: McpProgressStatus;
      summary: string;
      task: string;
    },
  ): Promise<McpProgressEvent>;
  authenticateAccessToken(secret: string): Promise<McpPrincipal | null>;
  issueAccessToken(input: IssueAccessTokenInput): Promise<IssuedAccessToken>;
  listAccessTokens(input: {
    actorUserId: string;
    workspaceId: string;
  }): Promise<PublicMcpTokenRecord[]>;
  loadWorkspace(principal: McpPrincipal): Promise<McpWorkspaceData>;
  publishAccessEvent(channel: string, event: McpAccessEvent): Promise<void>;
  /**
   * Record one prompt for the authenticated member (ADR-011). The store is
   * a pass-through: workspace enablement, the member's consent and the
   * separate raw-text switch are enforced in the database, so no caller —
   * this one included — can write around them.
   */
  recordPrompt(
    principal: McpPrincipal,
    input: {
      rawText?: string | undefined;
      rubric?: Record<string, number> | undefined;
      targetNodeIds?: string[] | undefined;
      tokenCount: number;
      toolName: string;
    },
  ): Promise<{ id: string }>;
  /**
   * Append one ruled-out attempt (Phase 2C todo 2). The store is a
   * pass-through: the log is append-only in the schema, so no caller — this
   * one included — can rewrite or remove what it wrote.
   */
  recordRuledOut(
    principal: McpPrincipal,
    input: {
      hypothesis: string;
      outcome: string;
      refs?: string[] | undefined;
      repositoryId?: string | undefined;
    },
  ): Promise<{ id: string }>;
  recordAccessEvent(
    event: McpAccessEvent,
    measurement?: McpPackMeasurement,
  ): Promise<void>;
  revokeAccessToken(input: {
    actorUserId: string;
    tokenId: string;
    workspaceId: string;
  }): Promise<void>;
}

interface InMemoryMcpStoreOptions {
  accessEventFailures?: boolean;
  now?: () => Date;
  workspaces: McpWorkspaceData[];
}

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function encodeBase32(value: bigint, length: number): string {
  let encoded = "";
  for (let index = 0; index < length; index += 1) {
    encoded = CROCKFORD[Number(value & 31n)] + encoded;
    value >>= 5n;
  }
  return encoded;
}

export function createUlid(now: Date): string {
  const timestamp = encodeBase32(BigInt(now.getTime()), 10);
  const random = BigInt(`0x${randomBytes(10).toString("hex")}`);
  return `${timestamp}${encodeBase32(random, 16)}`;
}

export function hashAccessToken(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function createAccessTokenSecret(): string {
  return `sp_mcp_${randomBytes(32).toString("base64url")}`;
}

export class InMemoryMcpStore implements McpStore {
  readonly #accessEventFailures: boolean;
  readonly #accessEvents: McpAccessEvent[] = [];
  readonly #packMeasurements: McpPackMeasurement[] = [];
  readonly #notes: McpNote[] = [];
  readonly #promptRecords: Array<{
    id: string;
    occurredAt: string;
    rawText: string | null;
    rubric: Record<string, number>;
    targetNodeIds: string[];
    tokenCount: number;
    toolName: string;
    userId: string;
    workspaceId: string;
  }> = [];
  readonly #ruledOut: Array<{
    hypothesis: string;
    id: string;
    outcome: string;
    recordedAt: string;
    refs: string[];
    repositoryId: string | null;
    userId: string;
    workspaceId: string;
  }> = [];
  readonly #now: () => Date;
  readonly #progressEvents: McpProgressEvent[] = [];
  readonly #publishedAccessEvents: Array<{
    channel: string;
    event: McpAccessEvent;
  }> = [];
  readonly #tokensByHash = new Map<string, McpTokenRecord>();
  readonly #todos: McpTodo[] = [];
  readonly #workspaces = new Map<string, McpWorkspaceData>();

  constructor(options: InMemoryMcpStoreOptions) {
    this.#accessEventFailures = options.accessEventFailures ?? false;
    this.#now = options.now ?? (() => new Date());
    for (const workspace of options.workspaces)
      this.#workspaces.set(workspace.id, workspace);
  }

  accessEventsForWorkspace(workspaceId: string): McpAccessEvent[] {
    return this.#accessEvents
      .filter((event) => event.workspaceId === workspaceId)
      .map((event) => ({ ...event, targetNodeIds: [...event.targetNodeIds] }));
  }

  packMeasurementsForWorkspace(workspaceId: string): McpPackMeasurement[] {
    return this.#packMeasurements
      .filter((measurement) => measurement.workspaceId === workspaceId)
      .map((measurement) => ({ ...measurement }));
  }

  readonly #assertions: Array<{
    id: string;
    invalidatedAt: string | null;
    invalidatedBy: string | null;
    reason: string;
    relation: AgentAssertionRelation;
    sourceNodeId: string;
    targetNodeId: string;
    tokenId: string;
    validFrom: string;
    workspaceId: string;
  }> = [];
  readonly #memoryEntries: Array<{
    anchorNodeId: string | null;
    entryKey: string;
    id: string;
    invalidatedAt: string | null;
    name: McpMemoryBlockName;
    text: string;
    tokenId: string;
    validFrom: string;
    workspaceId: string;
  }> = [];

  /** Test inspector — bi-temporal state, invalidated rows included. */
  assertionsForWorkspace(workspaceId: string) {
    return this.#assertions.filter(
      (assertion) => assertion.workspaceId === workspaceId,
    );
  }

  /** Test inspector — invalidated entries included. */
  memoryEntriesForWorkspace(workspaceId: string) {
    return this.#memoryEntries.filter(
      (entry) => entry.workspaceId === workspaceId,
    );
  }

  #workspaceNodeIds(workspace: McpWorkspaceData): Set<string> {
    const ids = new Set<string>();
    for (const repository of workspace.repositories) {
      for (const artifact of repository.artifacts) ids.add(artifact.id);
      for (const requirement of repository.requirements)
        ids.add(requirement.id);
      for (const evidence of repository.evidence) ids.add(evidence.id);
      for (const finding of repository.findings) ids.add(finding.id);
    }
    return ids;
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
    const workspace = await this.loadWorkspace(principal);
    const nodeIds = this.#workspaceNodeIds(workspace);
    if (
      !nodeIds.has(input.sourceNodeId) ||
      !nodeIds.has(input.targetNodeId) ||
      input.sourceNodeId === input.targetNodeId
    ) {
      return { id: null, invalidatedId: null, outcome: "unknown_node" };
    }
    const existing = this.#assertions.find(
      (assertion) =>
        assertion.workspaceId === principal.workspaceId &&
        assertion.sourceNodeId === input.sourceNodeId &&
        assertion.targetNodeId === input.targetNodeId &&
        assertion.invalidatedAt === null,
    );
    if (existing && existing.relation === input.relation) {
      return { id: existing.id, invalidatedId: null, outcome: "noop" };
    }
    const now = this.#now();
    const created = {
      id: createUlid(now),
      invalidatedAt: null,
      invalidatedBy: null,
      reason: input.reason,
      relation: input.relation,
      sourceNodeId: input.sourceNodeId,
      targetNodeId: input.targetNodeId,
      tokenId: principal.tokenId,
      validFrom: now.toISOString(),
      workspaceId: principal.workspaceId,
    };
    this.#assertions.push(created);
    if (existing) {
      existing.invalidatedAt = now.toISOString();
      existing.invalidatedBy = created.id;
      return {
        id: created.id,
        invalidatedId: existing.id,
        outcome: "superseded",
      };
    }
    return { id: created.id, invalidatedId: null, outcome: "added" };
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
    const workspace = await this.loadWorkspace(principal);
    const anchorNodeId = input.anchorNodeId ?? null;
    if (anchorNodeId && !this.#workspaceNodeIds(workspace).has(anchorNodeId)) {
      return { id: null, invalidatedId: null, outcome: "unknown_node" };
    }
    const existing = this.#memoryEntries.find(
      (entry) =>
        entry.workspaceId === principal.workspaceId &&
        entry.anchorNodeId === anchorNodeId &&
        entry.name === input.name &&
        entry.entryKey === input.entryKey &&
        entry.invalidatedAt === null,
    );
    const now = this.#now();
    if (input.remove) {
      if (!existing) return { id: null, invalidatedId: null, outcome: "noop" };
      existing.invalidatedAt = now.toISOString();
      return { id: existing.id, invalidatedId: null, outcome: "invalidated" };
    }
    const text = input.text ?? "";
    if (existing && existing.text === text) {
      return { id: existing.id, invalidatedId: null, outcome: "noop" };
    }
    if (!existing) {
      const activeCount = this.#memoryEntries.filter(
        (entry) =>
          entry.workspaceId === principal.workspaceId &&
          entry.anchorNodeId === anchorNodeId &&
          entry.name === input.name &&
          entry.invalidatedAt === null,
      ).length;
      if (activeCount >= 12) {
        return { id: null, invalidatedId: null, outcome: "rejected_cap" };
      }
    }
    const created = {
      anchorNodeId,
      entryKey: input.entryKey,
      id: createUlid(now),
      invalidatedAt: null,
      name: input.name,
      text,
      tokenId: principal.tokenId,
      validFrom: now.toISOString(),
      workspaceId: principal.workspaceId,
    };
    this.#memoryEntries.push(created);
    if (existing) {
      existing.invalidatedAt = now.toISOString();
      return { id: created.id, invalidatedId: existing.id, outcome: "updated" };
    }
    return { id: created.id, invalidatedId: null, outcome: "added" };
  }

  async appendNote(
    principal: McpPrincipal,
    input: { target?: string | undefined; text: string },
  ): Promise<McpNote> {
    await this.loadWorkspace(principal);
    const now = this.#now();
    const note: McpNote = {
      id: createUlid(now),
      occurredAt: now.toISOString(),
      target: input.target ?? null,
      text: input.text,
      tokenId: principal.tokenId,
      userId: principal.userId,
      workspaceId: principal.workspaceId,
    };
    this.#notes.push(note);
    return { ...note };
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
    await this.loadWorkspace(principal);
    const now = this.#now();
    const record = {
      id: createUlid(now),
      occurredAt: now.toISOString(),
      rawText: input.rawText ?? null,
      rubric: input.rubric ?? {},
      targetNodeIds: input.targetNodeIds ?? [],
      tokenCount: input.tokenCount,
      toolName: input.toolName,
      userId: principal.userId,
      workspaceId: principal.workspaceId,
    };
    this.#promptRecords.push(record);
    return { id: record.id };
  }

  /** Test inspector — the consent gate itself lives in the database. */
  promptRecordsForWorkspace(workspaceId: string) {
    return this.#promptRecords.filter(
      (record) => record.workspaceId === workspaceId,
    );
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
    await this.loadWorkspace(principal);
    const now = this.#now();
    const attempt = {
      hypothesis: input.hypothesis,
      id: createUlid(now),
      outcome: input.outcome,
      recordedAt: now.toISOString(),
      refs: input.refs ?? [],
      repositoryId: input.repositoryId ?? null,
      userId: principal.userId,
      workspaceId: principal.workspaceId,
    };
    this.#ruledOut.push(attempt);
    return { id: attempt.id };
  }

  /** Test inspector — append-only itself is a schema property. */
  ruledOutForWorkspace(workspaceId: string) {
    return this.#ruledOut.filter(
      (attempt) => attempt.workspaceId === workspaceId,
    );
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
    await this.loadWorkspace(principal);
    const now = this.#now();
    const task = input.task.trim();
    const summary = input.summary.trim();
    const refs = [...(input.refs ?? [])];
    if (task.length < 1 || task.length > 120)
      throw new Error("log_progress task must contain 1 to 120 characters");
    if (summary.length < 1 || summary.length > 200)
      throw new Error("log_progress summary must contain 1 to 200 characters");
    if (refs.length > 10)
      throw new Error("log_progress refs must contain at most 10 entries");

    const sourceKey = `progress:${task.toLocaleLowerCase("en-US")}`;
    const existingTodo = this.#todos.find(
      (todo) =>
        todo.workspaceId === principal.workspaceId &&
        (todo.id === task || todo.sourceKey === sourceKey),
    );
    const todoStatus: McpTodoStatus =
      input.status === "started" || input.status === "progress"
        ? "in-progress"
        : input.status;
    const eventId = createUlid(now);
    const todo: McpTodo = existingTodo
      ? { ...existingTodo, status: todoStatus, updatedAt: now.toISOString() }
      : {
          createdAt: now.toISOString(),
          id: createUlid(now),
          sourceEventId: eventId,
          sourceKey,
          status: todoStatus,
          title: task,
          updatedAt: now.toISOString(),
          workspaceId: principal.workspaceId,
        };
    const event: McpProgressEvent = {
      id: eventId,
      occurredAt: now.toISOString(),
      refs,
      status: input.status,
      summary,
      task,
      todoId: todo.id,
      tokenId: principal.tokenId,
      userId: principal.userId,
      workspaceId: principal.workspaceId,
    };
    if (existingTodo) Object.assign(existingTodo, todo);
    else this.#todos.push(todo);
    this.#progressEvents.push(event);
    return { ...event, refs: [...event.refs] };
  }

  async authenticateAccessToken(secret: string): Promise<McpPrincipal | null> {
    const record = this.#tokensByHash.get(hashAccessToken(secret));
    if (!record || record.revokedAt) return null;
    if (
      record.expiresAt &&
      Date.parse(record.expiresAt) <= this.#now().getTime()
    )
      return null;

    record.lastUsedAt = this.#now().toISOString();
    return {
      scopes: [...record.scopes],
      tokenId: record.id,
      userId: record.userId,
      workspaceId: record.workspaceId,
    };
  }

  async issueAccessToken(
    input: IssueAccessTokenInput,
  ): Promise<IssuedAccessToken> {
    const workspace = this.#workspaces.get(input.workspaceId);
    if (!workspace || workspace.ownerUserId !== input.actorUserId) {
      throw new Error("Workspace access denied");
    }
    if (
      input.scopes.length === 0 ||
      input.scopes.some((scope) => !MCP_SCOPES.includes(scope))
    ) {
      throw new Error("At least one valid MCP scope is required");
    }
    if (!input.name.trim()) throw new Error("MCP token name is required");

    const now = this.#now();
    const secret = createAccessTokenSecret();
    const record: McpTokenRecord = {
      createdAt: now.toISOString(),
      expiresAt: input.expiresAt ?? null,
      id: createUlid(now),
      lastUsedAt: null,
      name: input.name.trim(),
      revokedAt: null,
      scopes: [...new Set(input.scopes)],
      tokenHash: hashAccessToken(secret),
      tokenPrefix: secret.slice(0, 12),
      userId: input.actorUserId,
      workspaceId: input.workspaceId,
    };
    this.#tokensByHash.set(record.tokenHash, record);
    return { record: publicTokenRecord(record), secret };
  }

  async loadWorkspace(principal: McpPrincipal): Promise<McpWorkspaceData> {
    const workspace = this.#workspaces.get(principal.workspaceId);
    if (!workspace || workspace.ownerUserId !== principal.userId) {
      throw new Error("Workspace access denied");
    }
    const artifactPaths = new Map(
      workspace.repositories.flatMap((repository) =>
        repository.artifacts.map(({ id, path }) => [id, path] as const),
      ),
    );
    const written: McpMemoryEntryData[] = this.#memoryEntries
      .filter(
        (entry) =>
          entry.workspaceId === workspace.id && entry.invalidatedAt === null,
      )
      .map((entry) => ({
        anchorNodeId: entry.anchorNodeId,
        anchorPath: entry.anchorNodeId
          ? (artifactPaths.get(entry.anchorNodeId) ?? null)
          : null,
        entryKey: entry.entryKey,
        id: entry.id,
        name: entry.name,
        text: entry.text,
        updatedAt: entry.validFrom,
      }));
    return {
      ...workspace,
      memoryEntries: [...(workspace.memoryEntries ?? []), ...written],
    };
  }

  async listAccessTokens(input: {
    actorUserId: string;
    workspaceId: string;
  }): Promise<PublicMcpTokenRecord[]> {
    const workspace = this.#workspaces.get(input.workspaceId);
    if (!workspace || workspace.ownerUserId !== input.actorUserId) {
      throw new Error("Workspace access denied");
    }
    return [...this.#tokensByHash.values()]
      .filter(
        (token) =>
          token.workspaceId === input.workspaceId &&
          token.userId === input.actorUserId,
      )
      .map(publicTokenRecord)
      .sort(
        (left, right) =>
          right.createdAt.localeCompare(left.createdAt) ||
          left.id.localeCompare(right.id),
      );
  }

  notesForWorkspace(workspaceId: string): McpNote[] {
    return this.#notes
      .filter((note) => note.workspaceId === workspaceId)
      .map((note) => ({ ...note }));
  }

  progressEventsForWorkspace(workspaceId: string): McpProgressEvent[] {
    return this.#progressEvents
      .filter((event) => event.workspaceId === workspaceId)
      .map((event) => ({ ...event, refs: [...event.refs] }));
  }

  todosForWorkspace(workspaceId: string): McpTodo[] {
    return this.#todos
      .filter((todo) => todo.workspaceId === workspaceId)
      .map((todo) => ({ ...todo }));
  }

  async publishAccessEvent(
    channel: string,
    event: McpAccessEvent,
  ): Promise<void> {
    if (this.#accessEventFailures)
      throw new Error("Realtime access event failed");
    this.#publishedAccessEvents.push({
      channel,
      event: { ...event, targetNodeIds: [...event.targetNodeIds] },
    });
  }

  publishedAccessEventsForWorkspace(
    workspaceId: string,
  ): Array<{ channel: string; event: McpAccessEvent }> {
    return this.#publishedAccessEvents
      .filter(({ event }) => event.workspaceId === workspaceId)
      .map(({ channel, event }) => ({
        channel,
        event: { ...event, targetNodeIds: [...event.targetNodeIds] },
      }));
  }

  async recordAccessEvent(
    event: McpAccessEvent,
    measurement?: McpPackMeasurement,
  ): Promise<void> {
    if (this.#accessEventFailures)
      throw new Error("Access event persistence failed");
    this.#accessEvents.push({
      ...event,
      targetNodeIds: [...event.targetNodeIds],
    });
    if (measurement) this.#packMeasurements.push({ ...measurement });
  }

  async revokeAccessToken(input: {
    actorUserId: string;
    tokenId: string;
    workspaceId: string;
  }): Promise<void> {
    const workspace = this.#workspaces.get(input.workspaceId);
    if (!workspace || workspace.ownerUserId !== input.actorUserId) {
      throw new Error("Workspace access denied");
    }
    const record = [...this.#tokensByHash.values()].find(
      (token) =>
        token.id === input.tokenId && token.workspaceId === input.workspaceId,
    );
    if (!record) throw new Error("MCP token not found");
    record.revokedAt = this.#now().toISOString();
  }
}
