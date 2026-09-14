import { createHash, randomBytes } from "node:crypto";

import { normalizeTodoTitle, type SummaryState } from "@alrescha/core";

export const MCP_SCOPES = ["mcp:read", "mcp:write"] as const;

export type McpScope = (typeof MCP_SCOPES)[number];

/**
 * The node vocabulary, as one array (Codex remedy P0-D / R-01 #4).
 *
 * It was a union, and three other places copied it by hand: the Supabase
 * decoder's guard, the hosted output schema, and the display maps. Every
 * copy drifted — by the end of Wave A′ the decoder was silently dropping
 * every `db_object` edge and the hosted schema would have rejected a
 * `section` node. A vocabulary with four hand-maintained copies is a
 * vocabulary that is wrong somewhere.
 *
 * Beyond the seven original kinds:
 * - `route` — a URL (todo 6). Traversable, because "what does `/auth` touch"
 *   is a question an agent should be able to ask.
 * - `db_object` — a table, view or function this repository declares
 *   (todo 7).
 * - `section` — an ID-token heading: `ADR-013`, `OQ-041`, `MT-7` (todo 8).
 * - `todo` — a checkbox the scan read out of a todo document (todo 21).
 *   Reading todos is a filter on `query_brain`, not a tool of its own: an
 *   agent that already knows how to ask this graph a question should not
 *   have to learn a second way to ask about work.
 * - `concept` — an AI-synthesised concept (Wave C todo 7): a named idea
 *   over member files, with a summary that is always `inferred`. It sat in
 *   `graph_nodes` and on the map since Phase 3 and no tool could name it
 *   (Phase 4 Wave D todo 19 ⑴).
 *
 * None of the five is an `index_entries.entry_type`: the search index keeps
 * its own six-value vocabulary until a migration widens that CHECK.
 */
export const MCP_NODE_TYPES = [
  "artifact",
  "concept",
  "context_pack",
  "db_object",
  "evidence",
  "finding",
  "memory",
  "receipt",
  "requirement",
  "route",
  "section",
  "todo",
] as const;

export type McpNodeType = (typeof MCP_NODE_TYPES)[number];

/**
 * The relation vocabulary, as one array, for the reason `MCP_NODE_TYPES` is.
 *
 * `handles` is a route and the files that serve it (todo 6). `defines`,
 * `modifies` and `queries` are the database family (todo 7): the migration
 * that declares an object, the one that alters it, and the code that names
 * one in a query literal.
 *
 * `part_of`, `uses`, `depends_on`, `produces`, `configures` and
 * `validates` are the concept vocabulary (Wave C todo 7, the same closed
 * set `assert_link` accepts): edges the synthesis wrote from a concept to
 * its members and between concepts, stored with tier `inferred`. Until
 * todo 19 ⑴ the decoder reported every one of them as "outside the MCP
 * vocabulary", so the concept layer was on the map and invisible to the
 * tools.
 *
 * **`contains` is deliberately absent.** The directory hierarchy would bury
 * every `get_neighbors` answer it appeared in, and the flag that would make
 * it safe is todo 22's. Absent is not the same as hidden: the decoder
 * reports what it left out and why, so a caller asking "does this file have
 * a `contains` edge" gets `unknown` rather than a confident no.
 */
export const MCP_EDGE_RELATIONS = [
  "calls",
  "configures",
  "contradicts",
  "defines",
  "depends_on",
  "handles",
  "implements",
  "imports",
  "modifies",
  "part_of",
  "produces",
  "queries",
  "references",
  "requires",
  "supersedes",
  "supports",
  "tests",
  "uses",
  "validates",
] as const;

export type McpEdgeRelation = (typeof MCP_EDGE_RELATIONS)[number];

/** Read limits, force strength and traversal policy are decided per family. */
export const MCP_EDGE_FAMILIES = [
  "database",
  "doc",
  "evidence",
  "hierarchy",
  "route",
  "semantic",
  "statistical",
  "structure",
] as const;

export type McpEdgeFamily = (typeof MCP_EDGE_FAMILIES)[number];

/** How a link was derived — separate from what it proves. */
export const MCP_EDGE_TIERS = [
  "agent_asserted",
  "inferred",
  "reference",
  "resolved",
] as const;

export type McpEdgeTier = (typeof MCP_EDGE_TIERS)[number];

export interface McpArtifactData {
  /**
   * The freshness rule's answer for this row (S1), decided once where the
   * row was read. `content` and `summary` above already respect it; this
   * carries *which* state produced them, so a card can say "stale" instead
   * of "missing" (Codex remedy §6.1).
   */
  summaryState?: SummaryState;
  /** Source blob sha as last scanned — module freshness input (todo 8). */
  blobSha?: string;
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

/**
 * Why an edge says what it says, as stored (Codex remedy P0-D).
 *
 * A `reason` or a `span` — the writer states at least one, and an edge with
 * neither is an edge nobody can check. Nothing is invented here: a missing
 * field arrives as `null` rather than as a plausible default, because
 * `resolved` written over an absent tier is exactly the dressing-up the
 * remedy forbids.
 */
export interface McpEdgeProvenance {
  /** The extractor that produced it, when the writer named one. */
  method: string | null;
  reason: string | null;
  span: McpSourceSpan | null;
}

export interface McpEdgeData {
  confidence: number | null;
  family: McpEdgeFamily | null;
  id: string;
  provenance: McpEdgeProvenance;
  relation: McpEdgeRelation;
  sourceNodeId: string;
  targetNodeId: string;
  tier: McpEdgeTier | null;
}

/**
 * An edge the decoder did not pass on, and why.
 *
 * A read that quietly returns less than it found makes a caller confident
 * about an absence it never checked. `contains` is the live case: the
 * hierarchy is excluded on purpose, and saying so is what separates "this
 * file is in no folder" from "this view does not carry folders".
 */
export interface McpEdgeOmission {
  count: number;
  reason: string;
  /** The stored relation, as written — it is outside the vocabulary. */
  relation: string;
}

/**
 * Why a stored relation did not reach the answer.
 *
 * Both readers — the hosted one decoding rows and the local one projecting a
 * scan plan (todo 17) — report the same absences, so the sentence lives here
 * rather than in whichever of them was written first. An agent that hears
 * two different reasons for the same missing hierarchy is being told the
 * transport matters, and it does not.
 */
export function edgeOmissionReason(relation: string): string {
  return relation === "contains"
    ? "the directory hierarchy is excluded from graph answers until the tools can filter it (todo 22)"
    : "relation is outside the MCP vocabulary";
}

/**
 * A read that reached its row budget (Codex remedy P0-B / R-01).
 *
 * PostgREST answers with at most `max_rows` and says nothing about it, so a
 * workspace read of a repository with 5,000 edges used to return an
 * arbitrary, unordered thousand and present them as the whole graph. Reads
 * now ask for one row more than they will use: getting it back means there
 * are more, and the caller is told which table ran out rather than left to
 * assume it saw everything.
 */
export interface McpReadTruncation {
  /** Rows the read kept. There is at least one more it did not. */
  limit: number;
  table: string;
}

/** What a rescan request did, and why it did that rather than what was asked. */
export interface McpRescanResult {
  jobId: string | null;
  /** Null when nothing was scheduled. */
  mode: "full" | "incremental" | null;
  /**
   * `requested` when the mode is the caller's, a sentence explaining the
   * upgrade when it is not, or why nothing was scheduled.
   */
  reason: string;
  repositoryId: string | null;
  scheduled: boolean;
}

/** An artifact and the repository it belongs to, from a targeted read. */
export interface McpArtifactMatch {
  artifact: McpArtifactData;
  repositoryFullName: string;
  repositoryId: string;
}

export interface McpReadCoverage {
  /**
   * How much the rows can be trusted to belong together (Codex remedy §5.3,
   * step S6).
   *
   * `single-statement` — one SELECT, one snapshot.
   * `revision-fenced` — several reads, and the repository revision was the
   * same before and after, so no writer published between them.
   * `unproven` — several reads and the revision moved, so this is a mix of
   * two states. Not an error, and not something to present as one picture
   * either.
   */
  readConsistency: "revision-fenced" | "single-statement" | "unproven";
  /**
   * `complete` for the stated scope — never a claim about the repository's
   * behaviour, only about the rows this read carried.
   */
  result: "complete" | "partial";
  /**
   * What each requested band did (todo 22 ⑹). A caller that asked for
   * `route` and got nothing can tell "this workspace has none" from "this
   * read does not carry them" without guessing.
   */
  bands?: readonly McpBandRead[];
  truncated: McpReadTruncation[];
}

/**
 * What one repository's rows are standing on (REMEDY §4's ReadBasis).
 *
 * The three states are independent: `dataRevision` says whether the rows are
 * consistent, `structure` says whether the graph is published, and `analysis`
 * says whether the derived layer caught up. A repository can have a real,
 * complete graph and findings from an older commit, and a reader that
 * collapses those into one word will get one of them wrong.
 */
export interface McpReadBasis {
  analyzedCommit: string | null;
  dataRevision: number;
  /** Null: there is no immutable generation to name, so nothing is named. */
  graphGeneration: null;
  indexedCommit: string | null;
  repositoryId: string;
  stages: {
    analysis: "current" | "pending" | "unavailable";
    structure: "building" | "ready";
  };
}

/** An ID-token heading this repository's own documents declare. */
export interface McpSectionData {
  /** The declaring heading, as written. */
  heading: string;
  nodeId: string;
  sourcePath: string;
  /** `ADR-013`, upper-cased. */
  token: string;
}

/** A table, view or function this repository's own migrations declare. */
export interface McpDbObjectData {
  kind: "function" | "table" | "view";
  name: string;
  nodeId: string;
  /** The newest migration that declares it, and the line. */
  sourceLine: number;
  sourcePath: string;
}

/**
 * An AI-synthesised concept (Wave C todo 7), as workspace data (todo 19 ⑴).
 *
 * The summary is prose a model wrote over the member files' stored
 * summaries; it is `inferred` by construction and every reader says so.
 * Members are paths, because that is what the synthesis was given.
 */
export interface McpConceptData {
  readonly id: string;
  readonly kind: "api" | "concept" | "system";
  readonly memberPaths: readonly string[];
  readonly name: string;
  readonly slug: string;
  readonly summary: string;
}

/** A URL this repository serves, and the verbs it answers to. */
export interface McpRouteData {
  /** Empty for a Next.js page; a decorator states its own. */
  methods: string[];
  nodeId: string;
  /** `resolved` when the path stated the URL, `reference` for a decorator. */
  tier: "reference" | "resolved";
  url: string;
}

export interface McpSourceSpan {
  endLine: number;
  path: string;
  startLine: number;
}

/**
 * Why a finding says what it says, as stored.
 *
 * The deterministic rules write a reason, the spans they read and the action
 * they suggest. Flattening all of that to `{reason}` — which the Supabase
 * store did until Phase 4 Wave A todo 1 — left an agent with "deterministic
 * stale-doc rule" and no path, line or next step (R5 §4.3). Every field is
 * optional because a row may carry any subset, but a finding always has at
 * least a reason or a source span (enforced by `findings_provenance_shape`).
 */
export interface McpFindingProvenance {
  reason?: string;
  sourceArtifactId?: string;
  span?: McpSourceSpan;
  /** Every span the rule read, in the order it read them. */
  spans?: McpSourceSpan[];
  suggestedAction?: string;
}

export interface McpFindingData {
  confidence: number;
  evidenceGrade: "inferred" | "verified";
  id: string;
  kind: string;
  provenance: McpFindingProvenance;
  severity: string;
  sourceNodeId: string | null;
  status: string;
  /** Code node the finding is about, when a rule could name one. */
  targetNodeId?: string | null;
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

/** Cached lazy module summary (Wave C todo 8). */
export interface McpModuleSummaryData {
  memberDigest: string;
  memberPaths: string[];
  moduleKey: string;
  name: string;
  summary: string;
}

export interface McpRepositoryData {
  artifacts: McpArtifactData[];
  /** Lazy module-summary cache; absent = nothing cached yet. */
  moduleSummaries?: McpModuleSummaryData[];
  contextPacks: McpContextPackData[];
  /** Concepts the enrich synthesis wrote; absent before todo 19 ⑴. */
  concepts?: McpConceptData[];
  /** Absent on a workspace scanned before Wave A′ todo 7. */
  dbObjects?: McpDbObjectData[];
  defaultBranch: string;
  edges: McpEdgeData[];
  evidence: McpEvidenceData[];
  findings: McpFindingData[];
  fullName: string;
  id: string;
  indexEntries: McpIndexEntryData[];
  overview: string;
  receipts: McpReceiptData[];
  /** What this repository's rows are standing on. */
  basis?: McpReadBasis;
  /** What the edge read left out, per stored relation. */
  edgeOmissions?: McpEdgeOmission[];
  requirements: McpRequirementData[];
  /** Absent on a workspace scanned before Wave A′ todo 6. */
  routes?: McpRouteData[];
  /** Absent on a workspace scanned before Wave A′ todo 8. */
  sections?: McpSectionData[];
}

/** How many rows one workspace read carries per table before it truncates. */
export const MCP_WORKSPACE_READ_LIMIT = 2_000;

/**
 * What a workspace read is asked to carry (Phase 4 Wave E todo 22 ⑹).
 *
 * A read used to be one thing: every table, every time, whether the caller
 * was answering "what does this file import" or "which routes exist". The
 * bands split it by what a question actually needs.
 *
 * - `structure` — repositories, nodes, artifacts, the search index.
 * - `evidence` — requirements, evidence, findings, receipts.
 * - `semantic` — module summaries, sections, workspace memory.
 * - `database` — `db_object` nodes.
 * - `route` — `route` nodes.
 * - `hierarchy` — directories and `contains`. **Unsupported here**: the
 *   hierarchy is excluded from graph answers entirely (`edgeOmissionReason`),
 *   so a read that claimed to carry it would be claiming something no reader
 *   could use. It is in the vocabulary so that asking for it gets an answer
 *   with a reason rather than an empty band that reads as "there is none".
 */
export const MCP_READ_BANDS = [
  "database",
  "evidence",
  "hierarchy",
  "route",
  "semantic",
  "structure",
] as const;

export type McpReadBand = (typeof MCP_READ_BANDS)[number];

/**
 * What a read carries when the caller says nothing (todo 22 ⑹).
 *
 * The three the plan names. `database` and `route` are a partial query now —
 * every caller that needs them asks, and `hosted.ts` is where they ask.
 */
export const MCP_DEFAULT_READ_BANDS: readonly McpReadBand[] = [
  "evidence",
  "semantic",
  "structure",
];

/**
 * What one band's read did, and why (보완 R-01, todo 22 ⑹).
 *
 * Three states, never two: `complete` is the rows, `truncated` is some of
 * them with the budget named, and `unsupported` is a band this reader cannot
 * answer for. Collapsing `unsupported` into an empty `complete` is how a
 * caller concludes a repository has no routes when nobody looked.
 */
export interface McpBandRead {
  readonly band: McpReadBand;
  /** Stated for `truncated` and `unsupported`; null when there is nothing to explain. */
  readonly reason: string | null;
  readonly result: "complete" | "truncated" | "unsupported";
}

/** Why a band cannot be answered for, when it cannot. */
export function bandUnsupportedReason(band: McpReadBand): string | null {
  return band === "hierarchy"
    ? "directory nodes and `contains` edges are excluded from graph answers, so no read carries them"
    : null;
}

/**
 * How many repositories a single path lookup will report. A path answered by
 * more than a handful of repositories is a workspace-shaped question, not a
 * file one, and the ambiguity is the answer either way.
 */
export const MCP_ARTIFACT_MATCH_LIMIT = 25;

/**
 * The edge read pages through `public.read_edge_page` (step S3). Rows per
 * request and requests per load are separate numbers on purpose: the first
 * is what one round trip should carry, the second is how much of a large
 * graph one workspace load is willing to walk before reporting that it
 * stopped.
 */
export const MCP_EDGE_PAGE_ROWS = 2_000;
export const MCP_EDGE_MAX_PAGES = 4;

/** Serialized bytes one edge page may carry, matching the RPC ceiling. */
export const MCP_EDGE_PAGE_BYTES = 4_194_304;

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
  /**
   * What this read carried. Absent on a fixture that states nothing, which
   * reads as complete — a hand-written workspace has no row budget.
   */
  coverage?: McpReadCoverage;
  id: string;
  /** Active memory entries (Wave D todo 10); absent on older fixtures. */
  memoryEntries?: McpMemoryEntryData[];
  ownerUserId: string;
  repositories: McpRepositoryData[];
  /**
   * Work items the scan read out of todo documents (todo 21). Workspace
   * scoped like `memoryEntries`, because a todo can name no repository at
   * all; `query_brain(types: ["todo"])` is the only reader.
   */
  todos?: McpTodo[];
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

/**
 * How a progress entry reached its todo (todo 21). Reported rather than
 * inferred: "created" and "normalized_title" are very different outcomes for
 * a caller who thought they were updating something.
 */
export type McpTodoMatch =
  "created" | "id" | "normalized_title" | "source_key" | "todo_id";

export interface McpTodo {
  createdAt: string;
  id: string;
  /** Null for a todo nobody has tied to a repository yet. */
  repositoryId?: string | null;
  /** The document the checkbox lives in, when the scan recorded one. */
  sourcePath?: string | null;
  sourceEventId: string;
  sourceKey: string;
  status: McpTodoStatus;
  title: string;
  updatedAt: string;
  workspaceId: string;
}

export interface McpProgressEvent {
  /** The commit the caller named, when it named one. */
  commitSha?: string | null;
  id: string;
  /** How the entry found its todo — the same four words in both stores. */
  matched?: McpTodoMatch;
  repositoryId?: string | null;
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
  /**
   * `responseChars` at the fixed 4 chars/token ratio. Carried so a realtime
   * consumer does not re-derive it and quietly pick a different ratio; the
   * database computes the stored column from `responseChars` itself.
   */
  estimatedTokens?: number;
  id: string;
  occurredAt: string;
  /**
   * Characters of the serialised result this call handed back — a length,
   * never content. Absent when the call produced no sized result, which is
   * not the same fact as a zero-length one.
   */
  responseChars?: number;
  targetNodeIds: string[];
  tokenId: string;
  tool: string;
  workspaceId: string;
}

/**
 * A model identifier, not prose. The same rule as the
 * `session_usage_reports_model_identifier` CHECK, written once here and
 * pinned against the database in `tests/session-telemetry.test.ts`: the
 * point of the constraint is that this field can never become somewhere to
 * put a sentence.
 */
export const MODEL_IDENTIFIER_PATTERN = /^[A-Za-z0-9._:/-]{1,120}$/;

/**
 * What the agent's own provider says the session cost (Phase 4 Wave E todo
 * 23). The served side is measurable here; the paid side is only visible to
 * the client, and after caching the two are not the same number.
 */
export interface McpSessionUsageInput {
  cacheCreationTokens?: number | undefined;
  cacheReadTokens?: number | undefined;
  inputTokens?: number | undefined;
  model?: string | undefined;
  outputTokens?: number | undefined;
  repositoryId?: string | undefined;
}

export interface McpSessionUsageResult {
  /**
   * Why the report was or was not kept. A status, never a thrown error:
   * telemetry that can fail an agent's session costs more than it measures.
   * `unavailable` is a store with nowhere to put it.
   */
  status: "not_enabled" | "recorded" | "unavailable" | "unknown_repository";
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
  /**
   * Record one progress entry, against the todo it is about (todo 21).
   *
   * `todoId` names one outright; without it the writer matches by id, then
   * by the key it mints itself, then by **normalised title** — which is what
   * lets an entry land on a checkbox the scan read out of a document rather
   * than minting a second todo with the same name.
   */
  appendProgress(
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
  ): Promise<McpProgressEvent>;
  authenticateAccessToken(secret: string): Promise<McpPrincipal | null>;
  issueAccessToken(input: IssueAccessTokenInput): Promise<IssuedAccessToken>;
  listAccessTokens(input: {
    actorUserId: string;
    workspaceId: string;
  }): Promise<PublicMcpTokenRecord[]>;
  /**
   * One artifact by id, or every artifact answering to a path, read directly
   * rather than filtered out of a workspace load (Codex remedy P0-B / R-01).
   *
   * `loadWorkspace` carries a row budget, so on a repository past it an
   * artifact simply was not in the answer and nothing said so. A file the
   * user names is a lookup, not a search, and a lookup should not depend on
   * where the file happens to sort.
   *
   * Returns every match across the workspace's repositories: deciding what
   * two repositories answering to one path means belongs to the caller.
   */
  findArtifacts(
    principal: McpPrincipal,
    selector: { id?: string | undefined; path?: string | undefined },
  ): Promise<readonly McpArtifactMatch[]>;
  /**
   * The workspace, in the bands the caller asked for (todo 22 ⑹). Omitting
   * `bands` reads `MCP_DEFAULT_READ_BANDS`; the answer says what each
   * requested band did, so a narrower read never reads as an empty one.
   */
  loadWorkspace(
    principal: McpPrincipal,
    options?: { bands?: readonly McpReadBand[] },
  ): Promise<McpWorkspaceData>;
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
  /**
   * Lazy module summaries (Wave C todo 8): enqueue one enrich job scoped to
   * a module cluster. Idempotent per (module, digest) at the queue, so a
   * storm of identical requests costs one job. Inherits the credit
   * lifecycle — the store decides BYOK vs credits, never a new billing path.
   */
  requestModuleSummary(
    principal: McpPrincipal,
    input: {
      memberDigest: string;
      memberPaths: string[];
      moduleKey: string;
      repositoryId: string;
    },
  ): Promise<{ jobId: string | null }>;
  /**
   * Ask for a repository to be scanned again (Phase 4 Wave C todo 16).
   *
   * Deterministic and free, like every scan. The **mode is decided by the
   * server**, not by the caller: an incremental request whose stored links
   * come from an older resolver generation is upgraded to a full relink,
   * because an incremental pass never re-parses an unchanged file and would
   * leave the thin graph exactly as it is.
   */
  requestRescan(
    principal: McpPrincipal,
    input: {
      mode?: "full" | "incremental" | undefined;
      repositoryId?: string | undefined;
    },
  ): Promise<McpRescanResult>;
  /**
   * Accept one opt-in usage report (Phase 4 Wave E todo 23). The workspace
   * switch is enforced in the database, so this path cannot write around
   * consent, and the answer is a status rather than an exception — a caller
   * that reports its own cost must never be punished for it.
   */
  reportSessionUsage(
    principal: McpPrincipal,
    input: McpSessionUsageInput,
  ): Promise<McpSessionUsageResult>;
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
  /** Observable log of lazy module-summary enqueues (todo 8 contract tests). */
  readonly moduleSummaryRequests: Array<{
    memberDigest: string;
    memberPaths: string[];
    moduleKey: string;
    repositoryId: string;
    workspaceId: string;
  }> = [];
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
      for (const concept of repository.concepts ?? []) ids.add(concept.id);
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
      commitSha?: string | undefined;
      refs?: string[] | undefined;
      repositoryId?: string | undefined;
      status: McpProgressStatus;
      summary: string;
      task: string;
      todoId?: string | undefined;
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

    if (input.commitSha && !/^[0-9a-f]{40}$/.test(input.commitSha))
      throw new Error(
        "log_progress commit_sha must be a 40-character commit sha",
      );
    /**
     * Both halves. A fixture's todos live on the workspace object and this
     * writer's own live in `#todos`; matching against only the second made
     * every scanned checkbox invisible here while the SQL found it — which
     * is the divergence the equivalence test caught on its first run.
     */
    const mine = [
      ...(this.#workspaces.get(principal.workspaceId)?.todos ?? []),
      ...this.#todos.filter(
        (todo) => todo.workspaceId === principal.workspaceId,
      ),
    ];
    if (
      input.repositoryId !== undefined &&
      !(
        this.#workspaces
          .get(principal.workspaceId)
          ?.repositories.some(({ id }) => id === input.repositoryId) ?? false
      )
    ) {
      throw new Error("log_progress repository_id is not in this workspace");
    }

    const sourceKey = `progress:${task.toLocaleLowerCase("en-US")}`;
    const normalizedTitle = normalizeTodoTitle(task);
    /**
     * The same order the SQL walks (todo 21): named outright, then exact id,
     * then the key this writer mints, then the normalised title. Widest last,
     * so an exact answer always beats a matched one — and the answer says
     * which, because "created" and "matched by title" are very different
     * outcomes for a caller who thought they were updating something.
     */
    let matched: McpTodoMatch = "created";
    let existingTodo: McpTodo | undefined;
    if (input.todoId !== undefined) {
      existingTodo = mine.find((todo) => todo.id === input.todoId);
      if (!existingTodo)
        throw new Error("log_progress todo_id is not in this workspace");
      matched = "todo_id";
    } else {
      existingTodo = mine.find((todo) => todo.id === task);
      if (existingTodo) matched = "id";
      else {
        existingTodo = mine.find((todo) => todo.sourceKey === sourceKey);
        if (existingTodo) matched = "source_key";
        else {
          existingTodo = mine.find(
            (todo) => normalizeTodoTitle(todo.title) === normalizedTitle,
          );
          if (existingTodo) matched = "normalized_title";
        }
      }
    }
    const todoStatus: McpTodoStatus =
      input.status === "started" || input.status === "progress"
        ? "in-progress"
        : input.status;
    const eventId = createUlid(now);
    const todo: McpTodo = existingTodo
      ? {
          ...existingTodo,
          // Attribution fills a gap; it never moves a todo that already
          // names a repository to one the caller happened to mention.
          repositoryId: existingTodo.repositoryId ?? input.repositoryId ?? null,
          status: todoStatus,
          updatedAt: now.toISOString(),
        }
      : {
          createdAt: now.toISOString(),
          id: createUlid(now),
          repositoryId: input.repositoryId ?? null,
          sourceEventId: eventId,
          sourceKey,
          status: todoStatus,
          title: task,
          updatedAt: now.toISOString(),
          workspaceId: principal.workspaceId,
        };
    const event: McpProgressEvent = {
      commitSha: input.commitSha ?? null,
      id: eventId,
      matched,
      occurredAt: now.toISOString(),
      refs,
      repositoryId: input.repositoryId ?? null,
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

  /**
   * The in-memory store has no row budget, so this is the same set the
   * workspace load would carry — which is the point: the contract is what
   * differs between the two, not the answer.
   */
  /**
   * The in-memory store schedules nothing — it has no queue. It answers with
   * the shape a caller has to handle anyway, which is the one where the
   * server declined to schedule.
   */
  async requestRescan(
    principal: McpPrincipal,
    input: { repositoryId?: string | undefined },
  ): Promise<McpRescanResult> {
    const workspace = this.#workspaces.get(principal.workspaceId);
    if (!workspace || workspace.ownerUserId !== principal.userId) {
      throw new Error("Workspace access denied");
    }
    const repository =
      input.repositoryId === undefined
        ? workspace.repositories[0]
        : workspace.repositories.find(({ id }) => id === input.repositoryId);
    return {
      jobId: null,
      mode: null,
      reason: repository ? "no queue in this store" : "unknown repository",
      repositoryId: repository?.id ?? null,
      scheduled: false,
    };
  }

  async findArtifacts(
    principal: McpPrincipal,
    selector: { id?: string | undefined; path?: string | undefined },
  ): Promise<readonly McpArtifactMatch[]> {
    const workspace = this.#workspaces.get(principal.workspaceId);
    if (!workspace || workspace.ownerUserId !== principal.userId) {
      throw new Error("Workspace access denied");
    }
    return workspace.repositories.flatMap((repository) =>
      repository.artifacts
        .filter((artifact) =>
          selector.id
            ? artifact.id === selector.id
            : artifact.path === selector.path,
        )
        .map((artifact) => ({
          artifact,
          repositoryFullName: repository.fullName,
          repositoryId: repository.id,
        })),
    );
  }

  /**
   * The same band contract as the hosted store (todo 22 ⑹). It has no row
   * budget, so nothing here is ever `truncated` — but a band the caller did
   * not ask for is withheld here too, because the local serving mode and the
   * hosted one answering differently is the failure todo 17 spent a whole
   * equivalence suite preventing.
   */
  async loadWorkspace(
    principal: McpPrincipal,
    options?: { bands?: readonly McpReadBand[] },
  ): Promise<McpWorkspaceData> {
    const workspace = this.#workspaces.get(principal.workspaceId);
    if (!workspace || workspace.ownerUserId !== principal.userId) {
      throw new Error("Workspace access denied");
    }
    const requested = new Set(options?.bands ?? MCP_DEFAULT_READ_BANDS);
    const bands: McpBandRead[] = [...requested].sort().map((band) => {
      const unsupported = bandUnsupportedReason(band);
      return unsupported
        ? { band, reason: unsupported, result: "unsupported" as const }
        : { band, reason: null, result: "complete" as const };
    });
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
      coverage: {
        ...(workspace.coverage ?? {
          readConsistency: "single-statement" as const,
          result: "complete" as const,
          truncated: [],
        }),
        bands,
      },
      memoryEntries: [...(workspace.memoryEntries ?? []), ...written],
      // Todos written through `appendProgress` join the ones the fixture
      // declared, so `query_brain(types: ["todo"])` sees the same set here
      // as it would hosted (todo 21).
      todos: [
        ...(workspace.todos ?? []),
        ...this.#todos.filter((todo) => todo.workspaceId === workspace.id),
      ],
      repositories: workspace.repositories.map((repository) => ({
        ...repository,
        ...(requested.has("database") ? {} : { dbObjects: [] }),
        ...(requested.has("route") ? {} : { routes: [] }),
      })),
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

  /**
   * The in-memory store keeps no telemetry — the local serving mode has no
   * workspace to consent for and nowhere to send it. It still checks the
   * repository, so a caller sees the same rejection it would get hosted.
   */
  async reportSessionUsage(
    principal: McpPrincipal,
    input: McpSessionUsageInput,
  ): Promise<McpSessionUsageResult> {
    const workspace = this.#workspaces.get(principal.workspaceId);
    if (!workspace || workspace.ownerUserId !== principal.userId) {
      throw new Error("Workspace access denied");
    }
    if (
      input.repositoryId !== undefined &&
      !workspace.repositories.some(({ id }) => id === input.repositoryId)
    ) {
      return { status: "unknown_repository" };
    }
    return { status: "unavailable" };
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
    this.moduleSummaryRequests.push({
      memberDigest: input.memberDigest,
      memberPaths: [...input.memberPaths],
      moduleKey: input.moduleKey,
      repositoryId: input.repositoryId,
      workspaceId: principal.workspaceId,
    });
    return { jobId: createUlid(this.#now()) };
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
