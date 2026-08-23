/**
 * Agent instruction blocks (Phase 3 Wave D todo 11, CBM ergonomics).
 *
 * Reviews of codebase-memory-mcp agree on one point: agents keep grepping
 * unless their own instruction file tells them the graph exists. This
 * generates the snippet a user pastes into each agent's config — graph-first
 * reading order, then the write-back habits. English on purpose: the snippet
 * is consumed by agents, not by the UI.
 *
 * The generated region is delimited (Graft's generated/human markers) so a
 * future regeneration can replace its own text and nothing else.
 */

export const AGENT_TARGETS = ["claude", "codex", "cursor", "generic"] as const;
export type AgentInstructionTarget = (typeof AGENT_TARGETS)[number];

export interface InstructionBlock {
  /** Where the snippet belongs, relative to the user's repository. */
  readonly filename: string;
  readonly snippet: string;
  readonly target: AgentInstructionTarget;
}

const BODY = `## Arr knowledge graph (MCP server: arr)

Before grepping or reading files broadly:

1. \`get_graph_schema\` — learn this repository's graph vocabulary first.
2. \`repo_map\` (pass \`focus\` = files/symbols from the task) — token-budgeted orientation.
3. \`search_nodes\` → \`get_neighbors\` / \`trace_path\` — navigate by ids; fetch bodies only through \`get_node_content\`.
4. \`memory_read\` — check what earlier agents already learned (gotchas, conventions, decisions).

Record what you learn before finishing:

- \`memory_write\` (name: gotchas | conventions | decisions) — one keyed, ≤500-char entry; rewrite the entry instead of appending duplicates.
- \`assert_link\` — a structural insight as a graph edge (part_of, uses, depends_on, produces, configures, validates, implements).
- \`record_ruled_out\` — hypotheses you tried and eliminated, so the next agent does not retry them.`;

const MARK_START = "<!-- arr:instructions:start -->";
const MARK_END = "<!-- arr:instructions:end -->";

function markdownSnippet(): string {
  return `${MARK_START}\n\n${BODY}\n\n${MARK_END}\n`;
}

export function buildInstructionBlock(
  target: AgentInstructionTarget,
): InstructionBlock {
  switch (target) {
    case "claude":
      return { filename: "CLAUDE.md", snippet: markdownSnippet(), target };
    case "codex":
      return { filename: "AGENTS.md", snippet: markdownSnippet(), target };
    case "cursor":
      return {
        filename: ".cursor/rules/arr.mdc",
        snippet: `---\ndescription: Arr knowledge graph tools\nalwaysApply: true\n---\n\n${markdownSnippet()}`,
        target,
      };
    case "generic":
      return {
        filename: "arr-instructions.md",
        snippet: markdownSnippet(),
        target,
      };
  }
}

/** MCP client config snippet pointing at this deployment's endpoint. */
export function buildMcpConfigSnippet(baseUrl: string): string {
  const endpoint = `${baseUrl.replace(/\/$/, "")}/api/mcp`;
  return JSON.stringify(
    {
      mcpServers: {
        arr: {
          headers: { Authorization: "Bearer <ARR_MCP_TOKEN>" },
          type: "http",
          url: endpoint,
        },
      },
    },
    null,
    2,
  );
}
