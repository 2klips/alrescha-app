import { AGENT_FORCED_CALL_CEILING } from "./agent-instructions";

/**
 * Opt-in harness snippets (Phase 4 Wave E todo 22 ⑶).
 *
 * WORK_SPEC §11's prompt capture and the progress log both need a caller,
 * and until now the only caller was an agent remembering to make one. A hook
 * is the honest place for "do this every time" — it runs whether or not the
 * model felt like it, and it costs no tokens in the session's context.
 *
 * Two rules hold over everything here:
 *
 * 1. **Opt-in.** Nothing is installed by the product. These are snippets a
 *    person pastes, and each one is inert until its environment variable is
 *    set. A harness that starts calling home because a scan ran is the
 *    behaviour ADR-011 exists to forbid.
 * 2. **Never blocking.** The `Read`/`Grep` hook advises and exits 0. An
 *    advisory that can fail an agent's tool call has made the product a
 *    gate, and a gate that is wrong once is a gate nobody installs twice.
 */

export const AGENT_HOOK_AGENTS = ["claude_code", "codex", "cursor"] as const;

export type AgentHookAgent = (typeof AGENT_HOOK_AGENTS)[number];

export interface AgentHookSnippet {
  readonly agent: AgentHookAgent;
  /** What the reader pastes, verbatim. */
  readonly content: string;
  /** One line: what it does and when it does nothing. */
  readonly description: string;
  /** Where it goes, relative to the repository root. */
  readonly path: string;
  /** The variable that keeps it inert until someone opts in. */
  readonly requiresEnv: string | null;
  readonly title: string;
}

const SESSION_END_COMMAND = [
  "#!/usr/bin/env sh",
  "# Inert without both variables — that is the opt-in.",
  '[ -n "$ALRESCHA_MCP_ENDPOINT" ] && [ -n "$ALRESCHA_MCP_TOKEN" ] || exit 0',
  'summary=$(git log -1 --pretty=%s 2>/dev/null || echo "session ended")',
  'curl -sS -m 5 -X POST "$ALRESCHA_MCP_ENDPOINT" \\',
  '  -H "Authorization: Bearer $ALRESCHA_MCP_TOKEN" \\',
  '  -H "Content-Type: application/json" \\',
  '  -d "$(printf \'%s\' "$summary" | tr -d \'\\\\"\' | sed \'s/.*/{"jsonrpc":"2.0","id":1,"method":"tools\\\\/call","params":{"name":"log_progress","arguments":{"task":"&","status":"done","summary":"&"}}}/\')" \\',
  "  >/dev/null 2>&1 || true",
  "# A telemetry call that fails a session costs more than it records.",
  "exit 0",
].join("\n");

const PRE_TOOL_ADVICE = [
  "#!/usr/bin/env sh",
  "# Advisory only. This hook never blocks: it exits 0 on every path.",
  '[ -n "$ALRESCHA_MCP_ENDPOINT" ] || exit 0',
  `echo "alrescha: one \\\`search_index\\\` call answers with ids and paths; at most ${AGENT_FORCED_CALL_CEILING} calls before reading a file."`,
  "exit 0",
].join("\n");

const CLAUDE_SETTINGS = JSON.stringify(
  {
    hooks: {
      PreToolUse: [
        {
          hooks: [
            {
              command: ".claude/hooks/alrescha-search-first.sh",
              type: "command",
            },
          ],
          matcher: "Grep|Read",
        },
      ],
      SessionEnd: [
        {
          hooks: [
            {
              command: ".claude/hooks/alrescha-log-progress.sh",
              type: "command",
            },
          ],
        },
      ],
    },
  },
  null,
  2,
);

export const AGENT_HOOK_SNIPPETS: readonly AgentHookSnippet[] = [
  {
    agent: "claude_code",
    content: CLAUDE_SETTINGS,
    description:
      "Wires both hooks below. Neither runs without ALRESCHA_MCP_ENDPOINT set.",
    path: ".claude/settings.json",
    requiresEnv: "ALRESCHA_MCP_ENDPOINT",
    title: "Claude Code — hook registration",
  },
  {
    agent: "claude_code",
    content: SESSION_END_COMMAND,
    description:
      "One log_progress call when a session ends. Times out at five seconds and swallows every failure.",
    path: ".claude/hooks/alrescha-log-progress.sh",
    requiresEnv: "ALRESCHA_MCP_TOKEN",
    title: "Claude Code — SessionEnd → log_progress",
  },
  {
    agent: "claude_code",
    content: PRE_TOOL_ADVICE,
    description:
      "Suggests search_index before a Read or Grep. Advisory: it exits 0 on every path and blocks nothing.",
    path: ".claude/hooks/alrescha-search-first.sh",
    requiresEnv: "ALRESCHA_MCP_ENDPOINT",
    title: "Claude Code — PreToolUse(Grep|Read) → search_index advice",
  },
  {
    agent: "codex",
    content: [
      "# Alrescha (optional)",
      "",
      "Codex has no hook runner, so this is a convention rather than a hook:",
      "run the same script from your own shell wrapper when a task unit ends.",
      "",
      "    sh .claude/hooks/alrescha-log-progress.sh",
      "",
      "It is inert without ALRESCHA_MCP_ENDPOINT and ALRESCHA_MCP_TOKEN.",
    ].join("\n"),
    description:
      "Codex loads AGENTS.md but runs no hooks; the same script is invoked by hand or from a wrapper.",
    path: "AGENTS.md",
    requiresEnv: "ALRESCHA_MCP_TOKEN",
    title: "Codex — no hook runner, one documented convention",
  },
  {
    agent: "cursor",
    content: [
      "---",
      "description: Alrescha graph lookups",
      "alwaysApply: false",
      "---",
      "",
      "Prefer one `search_index` call over a repository-wide grep.",
      `At most ${AGENT_FORCED_CALL_CEILING} calls before reading a file.`,
    ].join("\n"),
    description:
      "alwaysApply stays false on purpose: a rule applied every turn is paid for every turn.",
    path: ".cursor/rules/alrescha.mdc",
    requiresEnv: null,
    title: "Cursor — an on-demand rule, not an always-applied one",
  },
];

/** Snippets for one harness, in the order a reader installs them. */
export function agentHookSnippets(
  agent: AgentHookAgent,
): readonly AgentHookSnippet[] {
  return AGENT_HOOK_SNIPPETS.filter((snippet) => snippet.agent === agent);
}
