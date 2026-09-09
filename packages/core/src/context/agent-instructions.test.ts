import { describe, expect, it } from "vitest";

import {
  AGENT_FLOW_SENTENCE,
  AGENT_FLOW_STEPS,
  AGENT_FORCED_CALL_CEILING,
  AGENT_INSTRUCTION_BLOCK_TOKEN_BUDGET,
  CURSOR_ALWAYS_APPLY_NOTE,
  agentFlowTools,
  forcedCallsBeforeFirstRead,
  renderAgentInstructionBlock,
} from "./agent-instructions";
import { AGENT_HOOK_SNIPPETS, agentHookSnippets } from "./agent-hooks";
import { estimateTokens } from "../stats/token-estimate";

/**
 * Phase 4 Wave E todo 22 ⑵⑶ — the shared instruction surface.
 *
 * These are budget and drift tests. The block is loaded every session, so it
 * is measured; the flow is written once, so every surface that renders it is
 * checked against the same array; and the hooks advise, so the advisory one
 * is checked for never blocking.
 */
describe("the shared agent flow", () => {
  it("fits the instruction budget the plan sets", () => {
    const block = renderAgentInstructionBlock();
    const tokens = estimateTokens(block);

    expect(tokens).toBeLessThanOrEqual(AGENT_INSTRUCTION_BLOCK_TOKEN_BUDGET);
    // The measured value, as a ratchet. It can go down; a change that pushes
    // it up should have to say so.
    expect(tokens).toBeLessThanOrEqual(240);
  });

  it("forces no more calls than the ceiling before the first file read", () => {
    // The rule the plan states as prose, counted from the same array the
    // block is rendered from — so the block cannot say one thing and the
    // flow do another.
    expect(forcedCallsBeforeFirstRead()).toBeLessThanOrEqual(
      AGENT_FORCED_CALL_CEILING,
    );
    expect(forcedCallsBeforeFirstRead()).toBe(2);
    const firstRead = AGENT_FLOW_STEPS.findIndex(({ readsFile }) => readsFile);
    expect(firstRead).toBeGreaterThan(0);
    // Everything after the read is the agent's choice, not the flow's.
    expect(
      AGENT_FLOW_STEPS.slice(firstRead).every(({ forced }) => !forced),
    ).toBe(true);
  });

  it("renders the sentence and the block from one array", () => {
    const block = renderAgentInstructionBlock();
    for (const step of AGENT_FLOW_STEPS) {
      expect(AGENT_FLOW_SENTENCE).toContain(step.phrase);
      expect(block).toContain(step.instruction);
    }
    // The one thing todo 22 ⑵ existed to prevent: a second copy that keeps
    // teaching a tool after the catalogue drops it.
    for (const removed of ["search_nodes", "get_node_content", "route_query"]) {
      expect(AGENT_FLOW_SENTENCE).not.toContain(removed);
      expect(block).not.toContain(removed);
    }
  });

  it("states the Cursor tension instead of leaving it implicit", () => {
    const block = renderAgentInstructionBlock();

    expect(block).toContain(CURSOR_ALWAYS_APPLY_NOTE);
    expect(CURSOR_ALWAYS_APPLY_NOTE).toContain("alwaysApply");
    // WORK_SPEC §1.5: the product does not quietly add to what an agent
    // carries, so the block asks not to be carried on every turn.
    const cursor = agentHookSnippets("cursor")[0];
    expect(cursor?.content).toContain("alwaysApply: false");
  });

  it("names only tools an agent can actually call", () => {
    // Pinned against the registered catalogue in
    // `packages/mcp/src/hosted.test.ts`; here the set is exported so that
    // test has one place to read it from.
    expect(agentFlowTools()).toEqual([
      "assert_link",
      "get_artifact",
      "get_neighbors",
      "impact_of",
      "log_progress",
      "memory_write",
      "record_ruled_out",
      "search_index",
      "trace_path",
    ]);
  });
});

describe("opt-in harness hooks", () => {
  it("is inert until someone opts in", () => {
    for (const snippet of AGENT_HOOK_SNIPPETS) {
      if (!snippet.requiresEnv) continue;
      // Every executable snippet checks its variable before doing anything.
      if (snippet.content.startsWith("#!")) {
        expect(snippet.content).toContain(`$${snippet.requiresEnv}`);
        expect(snippet.content.split("\n")[2]).toContain("exit 0");
      }
    }
  });

  it("advises and never blocks", () => {
    const advisory = AGENT_HOOK_SNIPPETS.find(({ path }) =>
      path.endsWith("alrescha-search-first.sh"),
    );

    expect(advisory?.content).toContain("search_index");
    // Claude Code treats exit 2 as "block this tool call". An advisory that
    // can fail a read has made the product a gate.
    expect(advisory?.content).not.toContain("exit 2");
    expect(advisory?.content).not.toContain("deny");
    expect(
      advisory?.content
        .split("\n")
        .filter((line) => line.startsWith("exit "))
        .every((line) => line === "exit 0"),
    ).toBe(true);
  });

  it("gives log_progress the caller WORK_SPEC §11 never had", () => {
    const sessionEnd = AGENT_HOOK_SNIPPETS.find(({ path }) =>
      path.endsWith("alrescha-log-progress.sh"),
    );

    expect(sessionEnd?.content).toContain("log_progress");
    expect(sessionEnd?.content).toContain("ALRESCHA_MCP_TOKEN");
    // Bounded and swallowed: telemetry that can hang or fail a session has
    // cost the user more than it records.
    expect(sessionEnd?.content).toContain("-m 5");
    expect(sessionEnd?.content).toContain("|| true");
  });

  it("says plainly that Codex has no hook runner", () => {
    const codex = agentHookSnippets("codex");

    expect(codex).toHaveLength(1);
    expect(codex[0]?.content).toContain("no hook runner");
    // Not a pretend hook: the same script, run by hand, and the doc says so.
    expect(codex[0]?.content).toContain("alrescha-log-progress.sh");
  });
});

describe("docs/agents/HOOKS.md", () => {
  it("carries every snippet verbatim", async () => {
    const { readFile } = await import("node:fs/promises");
    const { resolve } = await import("node:path");
    const doc = await readFile(
      resolve(import.meta.dirname, "../../../../docs/agents/HOOKS.md"),
      "utf8",
    );

    // The page is generated from the module, so this is the guard that the
    // generated copy is still the current one. A doc that quietly falls
    // behind a snippet is worse than no doc: someone pastes the old one.
    for (const snippet of AGENT_HOOK_SNIPPETS) {
      expect(doc).toContain(snippet.title);
      expect(doc).toContain(snippet.path);
      expect(doc).toContain(snippet.content);
    }
    expect(doc).toContain(renderAgentInstructionBlock());
  });
});
