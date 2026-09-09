/**
 * The one description of how to use this graph (Phase 4 Wave E todo 22 ⑵).
 *
 * Four surfaces tell an agent the same thing — the instruction block a repo
 * installs, the minimal-index PR, `get_graph_schema.text`, and the tool
 * descriptions — and before this file three of them said it in their own
 * words. Todo 22 already caught one copy teaching three tools that no longer
 * existed. So the flow is **data** here: the sentence and the block are both
 * rendered from `AGENT_FLOW_STEPS`, and the forced-call ceiling is counted
 * from the same array rather than asserted beside it.
 *
 * It lives in core rather than in `@alrescha/mcp` because the minimal index
 * is built here and core cannot import the MCP package. `@alrescha/mcp`
 * re-exports it, so nothing about the MCP surface moved.
 */

/**
 * Calls an agent may be told to make before it is allowed to read a file.
 *
 * Two, and the number is enforced rather than described: a harness that
 * demands four round trips before the first useful byte has spent more than
 * it saved, and the block below is itself part of what a session pays for.
 */
export const AGENT_FORCED_CALL_CEILING = 2;

/** The block is loaded every session, so it is budgeted like a payload. */
export const AGENT_INSTRUCTION_BLOCK_TOKEN_BUDGET = 300;

export interface AgentFlowStep {
  /**
   * `true` when the flow tells the agent to make this call whether or not it
   * has a reason. Counted against `AGENT_FORCED_CALL_CEILING`.
   */
  readonly forced: boolean;
  /** The instruction, as it appears in the block. */
  readonly instruction: string;
  /** How the sentence form names this step. */
  readonly phrase: string;
  /** Tools this step names. Pinned against the live catalogue by a test. */
  readonly tools: readonly string[];
  /**
   * `true` for the step that ends the forced-call prefix: everything after
   * it happens because the agent chose it, not because the flow said so.
   */
  readonly readsFile?: boolean;
}

/**
 * The flow, once.
 *
 * The plan's text opens with an optional `query_brain(kind:'todo')`. That
 * filter is todo 21's and is not built, and a block that names a call the
 * server would reject is the exact failure this file exists to prevent — so
 * the step is absent until the filter is, and `agent-instructions.test.ts`
 * holds every named tool against the registered catalogue.
 */
export const AGENT_FLOW_STEPS: readonly AgentFlowStep[] = [
  {
    forced: true,
    instruction:
      "Start with one `search_index` call. It answers with ids and paths; that is the point.",
    phrase: "search_index once",
    tools: ["search_index"],
  },
  {
    forced: true,
    instruction:
      "Use `get_neighbors`, `trace_path` or `impact_of` only for a relational question — a path, an impact, a dependency.",
    phrase: "get_neighbors/trace_path/impact_of for relational questions",
    tools: ["get_neighbors", "trace_path", "impact_of"],
  },
  {
    forced: false,
    instruction:
      "Then read the file. After three lookups without an answer, read it anyway — the graph is an index, not an oracle.",
    phrase:
      "get_artifact last (ids first, bodies last); after three lookups, read the file",
    readsFile: true,
    tools: ["get_artifact"],
  },
  {
    forced: false,
    instruction:
      "Before editing a file this graph calls risky, call `impact_of` once and read `bound` — `lower-bound` means the answer is a floor, not a list.",
    phrase: "impact_of once before editing a risky file",
    tools: ["impact_of"],
  },
  {
    forced: false,
    instruction:
      "When a task unit is done: `log_progress` once, `memory_write` at most once. `assert_link` and `record_ruled_out` only when there is something to record.",
    phrase: "log_progress once at the end",
    tools: ["log_progress", "memory_write", "assert_link", "record_ruled_out"],
  },
];

/**
 * The tension worth naming rather than hiding (todo 22 ⑵).
 *
 * Cursor's `alwaysApply: true` makes a rule part of every turn's prompt, and
 * WORK_SPEC §1.5 is the promise that this product does not quietly add to
 * what an agent carries. Both cannot be satisfied by a block that asks to be
 * always applied, so it asks not to be.
 */
export const CURSOR_ALWAYS_APPLY_NOTE =
  "Do not mark this rule `alwaysApply`. It is a map to read once, not a policy to re-read every turn — a block that loads on every message costs more than the lookups it replaces.";

/** The flow as one line, for the schema card and the tool descriptions. */
export const AGENT_FLOW_SENTENCE = `flow: ${AGENT_FLOW_STEPS.map(({ phrase }) => phrase).join(" → ")}`;

/**
 * The block a repository installs. Rendered from the steps above, so it
 * cannot drift from the sentence or from the ceiling.
 */
export function renderAgentInstructionBlock(): string {
  return [
    "## Working with this project's graph",
    ...AGENT_FLOW_STEPS.map(({ instruction }) => `- ${instruction}`),
    `- At most ${AGENT_FORCED_CALL_CEILING} calls before you read a file.`,
    `- ${CURSOR_ALWAYS_APPLY_NOTE}`,
  ].join("\n");
}

/** Calls the flow forces before it lets the agent open a file. */
export function forcedCallsBeforeFirstRead(): number {
  const firstRead = AGENT_FLOW_STEPS.findIndex(({ readsFile }) => readsFile);
  return AGENT_FLOW_STEPS.slice(
    0,
    firstRead === -1 ? AGENT_FLOW_STEPS.length : firstRead,
  ).filter(({ forced }) => forced).length;
}

/** Every tool the flow names, deduplicated — the set a test pins. */
export function agentFlowTools(): readonly string[] {
  return [...new Set(AGENT_FLOW_STEPS.flatMap(({ tools }) => tools))].sort();
}
