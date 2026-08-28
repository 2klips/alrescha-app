"use client";

import { useState } from "react";

import {
  AGENT_TARGETS,
  buildInstructionBlock,
  buildMcpConfigSnippet,
  type AgentInstructionTarget,
} from "../../../../../lib/mcp/instruction-blocks";
import { SETTINGS } from "../../../../../lib/strings";
import { Button } from "../../../../ui/button";

/**
 * The paste-once installer (Wave D todo 11): per-agent instruction blocks
 * that steer agents to the graph tools before grep, plus the MCP connection
 * config. Copy is the whole interaction — nothing here writes anywhere.
 */
export function InstructionBlocks({ baseUrl }: { baseUrl: string }) {
  const [target, setTarget] = useState<AgentInstructionTarget>("claude");
  const [copied, setCopied] = useState<"block" | "config" | null>(null);
  const block = buildInstructionBlock(target);
  const config = buildMcpConfigSnippet(baseUrl);

  async function copy(kind: "block" | "config", text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 2_000);
  }

  return (
    <section
      aria-labelledby="instruction-blocks-title"
      className="mcp-settings-card"
      data-testid="instruction-blocks"
    >
      <div className="eyebrow">{SETTINGS.mcp.instructions.eyebrow}</div>
      <h2 id="instruction-blocks-title">{SETTINGS.mcp.instructions.title}</h2>
      <p>{SETTINGS.mcp.instructions.lead}</p>
      <div className="instruction-targets" role="group">
        {AGENT_TARGETS.map((candidate) => (
          <button
            aria-pressed={candidate === target}
            key={candidate}
            onClick={() => setTarget(candidate)}
            type="button"
          >
            {SETTINGS.mcp.instructions.targets[candidate]}
          </button>
        ))}
      </div>
      <p className="instruction-file">
        {SETTINGS.mcp.instructions.filePrefix}
        <code>{block.filename}</code>
      </p>
      <pre className="instruction-snippet" data-testid="instruction-snippet">
        <code>{block.snippet}</code>
      </pre>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => void copy("block", block.snippet)}
      >
        {copied === "block"
          ? SETTINGS.mcp.instructions.copied
          : SETTINGS.mcp.instructions.copy}
      </Button>

      <h3>{SETTINGS.mcp.instructions.configTitle}</h3>
      <p>{SETTINGS.mcp.instructions.configLead}</p>
      <pre className="instruction-snippet">
        <code>{config}</code>
      </pre>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => void copy("config", config)}
      >
        {copied === "config"
          ? SETTINGS.mcp.instructions.copied
          : SETTINGS.mcp.instructions.copyConfig}
      </Button>
    </section>
  );
}
