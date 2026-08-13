import { createHash, randomBytes } from "node:crypto";

export const MCP_SCOPES = ["mcp:read", "mcp:write"] as const;

export type McpScope = (typeof MCP_SCOPES)[number];

export type McpNodeType =
  | "artifact"
  | "requirement"
  | "evidence"
  | "finding"
  | "receipt"
  | "context_pack";

export type McpEdgeRelation =
  | "requires"
  | "implements"
  | "tests"
  | "supports"
  | "contradicts"
  | "supersedes"
  | "references";

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

export interface McpWorkspaceData {
  id: string;
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

export interface McpProgressEvent {
  id: string;
  occurredAt: string;
  refs: string[];
  status: McpProgressStatus;
  summary: string;
  task: string;
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
  readonly #now: () => Date;
  readonly #progressEvents: McpProgressEvent[] = [];
  readonly #publishedAccessEvents: Array<{
    channel: string;
    event: McpAccessEvent;
  }> = [];
  readonly #tokensByHash = new Map<string, McpTokenRecord>();
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
    const event: McpProgressEvent = {
      id: createUlid(now),
      occurredAt: now.toISOString(),
      refs: [...(input.refs ?? [])],
      status: input.status,
      summary: input.summary,
      task: input.task,
      tokenId: principal.tokenId,
      userId: principal.userId,
      workspaceId: principal.workspaceId,
    };
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
    return workspace;
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
