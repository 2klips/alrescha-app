export const CONTEXT_TOKEN_ESTIMATE_ASSUMPTION =
  "Approximation: one token per four UTF-16 characters in selected document bodies; formatting overhead is excluded.";

export type ContextTargetAgent = "claude-code" | "codex" | "cursor" | "generic";

export type ContextDocumentKind =
  | "agents"
  | "claude"
  | "skill"
  | "cursor_rule"
  | "spec"
  | "adr"
  | "todo_progress";

export interface ContextDocument {
  readonly content: string;
  readonly id: string;
  readonly kind: ContextDocumentKind;
  readonly path: string;
  readonly relatedNodeIds?: readonly string[];
  readonly title: string;
}

export interface ContextRelation {
  readonly sourceId: string;
  readonly sourceLabel?: string;
  readonly targetId: string;
  readonly targetLabel?: string;
  readonly type: string;
}

export interface ComposeContextPackInput {
  readonly documents: readonly ContextDocument[];
  readonly relations: readonly ContextRelation[];
  readonly targetAgent: ContextTargetAgent;
  readonly taskDescription: string;
  readonly tokenBudget: number;
}

export interface ContextPackEntry {
  readonly content: string;
  readonly estimatedTokens: number;
  readonly id: string;
  readonly path: string;
  readonly rank: number;
  readonly reason: string;
  readonly title: string;
}

export interface OmittedContextDocument {
  readonly estimatedTokens: number;
  readonly path: string;
  readonly rank: number;
  readonly reason: string;
  readonly title: string;
}

export interface ContextPack {
  readonly assumption: string;
  readonly estimatedTokens: number;
  readonly formattedText: string;
  readonly omitted: readonly OmittedContextDocument[];
  readonly readingOrder: readonly ContextPackEntry[];
  readonly targetAgent: ContextTargetAgent;
  readonly taskDescription: string;
  readonly tokenBudget: number;
}

const KIND_PRIORITY: Record<ContextDocumentKind, number> = {
  agents: 100,
  claude: 90,
  spec: 50,
  todo_progress: 40,
  skill: 30,
  cursor_rule: 20,
  adr: 10,
};

const TARGET_LABELS: Record<ContextTargetAgent, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
  generic: "Generic agent",
};

interface RankedDocument {
  readonly document: ContextDocument;
  readonly estimatedTokens: number;
  readonly graphMatches: number;
  readonly keywordMatches: number;
  readonly score: number;
}

function tokens(value: string): Set<string> {
  return new Set(
    value
      .toLocaleLowerCase("en-US")
      .split(/[^\p{L}\p{N}]+/u)
      .filter((token) => token.length > 1),
  );
}

function intersectionSize(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): number {
  let count = 0;

  for (const value of left) {
    if (right.has(value)) {
      count += 1;
    }
  }

  return count;
}

function estimateTokens(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4));
}

function rankDocument(
  document: ContextDocument,
  taskTokens: ReadonlySet<string>,
  relations: readonly ContextRelation[],
): RankedDocument {
  const documentTokens = tokens(
    `${document.path} ${document.title} ${document.content} ${(document.relatedNodeIds ?? []).join(" ")}`,
  );
  const keywordMatches = intersectionSize(taskTokens, documentTokens);
  const graphMatches = relations.filter((relation) => {
    if (
      relation.sourceId !== document.id &&
      relation.targetId !== document.id
    ) {
      return false;
    }

    const neighbor =
      relation.sourceId === document.id
        ? `${relation.targetId} ${relation.targetLabel ?? ""}`
        : `${relation.sourceId} ${relation.sourceLabel ?? ""}`;
    return intersectionSize(taskTokens, tokens(neighbor)) > 0;
  }).length;
  const baseline =
    document.kind === "agents" && document.path === "AGENTS.md" ? 10_000 : 0;

  return {
    document,
    estimatedTokens: estimateTokens(document.content),
    graphMatches,
    keywordMatches,
    score:
      baseline +
      graphMatches * 100 +
      keywordMatches * 10 +
      KIND_PRIORITY[document.kind],
  };
}

function selectionReason(ranked: RankedDocument): string {
  if (
    ranked.document.kind === "agents" &&
    ranked.document.path === "AGENTS.md"
  ) {
    return "Repository-wide agent instructions apply before task-specific context.";
  }

  if (ranked.graphMatches > 0) {
    return `Connected by ${ranked.graphMatches} evidence-graph relation${ranked.graphMatches === 1 ? "" : "s"} and matched ${ranked.keywordMatches} task terms.`;
  }

  return `Matched ${ranked.keywordMatches} task terms; ${ranked.document.kind} precedence broke ties.`;
}

function formatPack(
  targetAgent: ContextTargetAgent,
  taskDescription: string,
  entries: readonly ContextPackEntry[],
): string {
  const sections = entries.map(
    (entry) =>
      `## ${entry.rank}. ${entry.path}\n\nSelection: ${entry.reason}\n\n${entry.content.trimEnd()}`,
  );

  return [
    `# Context pack for ${TARGET_LABELS[targetAgent]}`,
    "",
    `Task: ${taskDescription}`,
    "",
    ...sections,
  ].join("\n");
}

export function composeContextPack(
  input: ComposeContextPackInput,
): ContextPack {
  if (!Number.isSafeInteger(input.tokenBudget) || input.tokenBudget < 1) {
    throw new RangeError("tokenBudget must be a positive integer.");
  }

  if (input.taskDescription.trim().length === 0) {
    throw new TypeError("taskDescription must not be empty.");
  }

  const taskTokens = tokens(input.taskDescription);
  const ranked = input.documents
    .map((document) => rankDocument(document, taskTokens, input.relations))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.document.path.localeCompare(right.document.path),
    );
  const selected: RankedDocument[] = [];
  const omitted: Array<{ ranked: RankedDocument; reason: string }> = [];
  let estimatedTokens = 0;

  for (const candidate of ranked) {
    const isRelevant =
      candidate.keywordMatches > 0 ||
      candidate.graphMatches > 0 ||
      (candidate.document.kind === "agents" &&
        candidate.document.path === "AGENTS.md");

    if (!isRelevant) {
      omitted.push({
        ranked: candidate,
        reason: "No task-term or evidence-graph match.",
      });
      continue;
    }

    if (estimatedTokens + candidate.estimatedTokens > input.tokenBudget) {
      omitted.push({
        ranked: candidate,
        reason: "Token budget reserved for higher-ranked documents.",
      });
      continue;
    }

    selected.push(candidate);
    estimatedTokens += candidate.estimatedTokens;
  }

  const readingOrder = selected.map<ContextPackEntry>((candidate, index) => ({
    content: candidate.document.content,
    estimatedTokens: candidate.estimatedTokens,
    id: candidate.document.id,
    path: candidate.document.path,
    rank: index + 1,
    reason: selectionReason(candidate),
    title: candidate.document.title,
  }));

  return {
    assumption: CONTEXT_TOKEN_ESTIMATE_ASSUMPTION,
    estimatedTokens,
    formattedText: formatPack(
      input.targetAgent,
      input.taskDescription,
      readingOrder,
    ),
    omitted: omitted.map(({ ranked: candidate, reason }, index) => ({
      estimatedTokens: candidate.estimatedTokens,
      path: candidate.document.path,
      rank: index + 1,
      reason,
      title: candidate.document.title,
    })),
    readingOrder,
    targetAgent: input.targetAgent,
    taskDescription: input.taskDescription,
    tokenBudget: input.tokenBudget,
  };
}
