import {
  applyManagedIndex,
  buildMinimalIndexProposalFiles,
  PROGRESS_LOGGING_INSTRUCTION,
  renderManagedIndex,
} from "../packages/core/src/index";
import { describe, expect, it } from "vitest";

describe("minimal agent index", () => {
  it("replaces only managed bytes and is byte-idempotent", () => {
    const existing = [
      "# Team rules",
      "",
      "Keep this exact prefix.",
      "",
      "<!-- ARR:BEGIN (managed — do not edit inside) -->",
      "old managed bytes",
      "<!-- ARR:END -->",
      "",
      "Keep this exact suffix.",
      "",
    ].join("\n");
    const section = renderManagedIndex({
      dashboardUrl: "https://app.arr.test/workspaces/ws_demo",
      mcpEndpoint: "https://mcp.arr.test",
    });

    const once = applyManagedIndex(existing, section);
    const twice = applyManagedIndex(once, section);

    expect(twice).toBe(once);
    expect(once.startsWith("# Team rules\n\nKeep this exact prefix.\n\n")).toBe(
      true,
    );
    expect(once.endsWith("\n\nKeep this exact suffix.\n")).toBe(true);
    expect(section.split("\n")).toHaveLength(9);
    expect(section.split("\n").length).toBeLessThanOrEqual(30);
    expect(once).toContain("call MCP tool `request_context_pack`");
    expect(once).toContain("Project context via Alrescha");
    expect(once).toContain("Once per completed task unit");
  });

  it("keeps the verified logging instruction below 150 estimated tokens", () => {
    const estimatedTokens = Math.ceil(PROGRESS_LOGGING_INSTRUCTION.length / 4);

    expect(estimatedTokens).toBeLessThanOrEqual(150);
    expect(PROGRESS_LOGGING_INSTRUCTION).toContain(
      '"summary":"<verified result; max 200 chars>"',
    );
    expect(PROGRESS_LOGGING_INSTRUCTION).toContain("never invent progress");
    expect(PROGRESS_LOGGING_INSTRUCTION).toContain("never log per turn");
  });

  it("proposes bounded index files without document-body inlining", () => {
    const proposal = buildMinimalIndexProposalFiles({
      agentsContent: null,
      claudeContent: null,
      dashboardUrl: "https://app.arr.test/workspaces/ws_demo",
      mcpEndpoint: "https://mcp.arr.test",
    });

    expect(proposal.files).toEqual([
      {
        after: `${proposal.managedSection}\n`,
        before: null,
        path: "AGENTS.md",
      },
      { after: "@AGENTS.md\n", before: null, path: "CLAUDE.md" },
    ]);
    expect(proposal.managedSection).not.toContain("REQ-AUTH-001");
    expect(
      proposal.files.every(({ path }) =>
        ["AGENTS.md", "CLAUDE.md"].includes(path),
      ),
    ).toBe(true);

    const regenerated = buildMinimalIndexProposalFiles({
      agentsContent: proposal.files[0]?.after ?? null,
      claudeContent: proposal.files[1]?.after ?? null,
      dashboardUrl: "https://app.arr.test/workspaces/ws_demo",
      mcpEndpoint: "https://mcp.arr.test",
    });

    expect(regenerated.files).toEqual([]);
    expect(regenerated.managedSection).toBe(proposal.managedSection);
  });

  it("fails closed on incomplete or duplicate managed markers", () => {
    const section = renderManagedIndex({
      dashboardUrl: "https://app.arr.test/workspaces/ws_demo",
      mcpEndpoint: "https://mcp.arr.test",
    });

    expect(() =>
      applyManagedIndex("prefix\n<!-- ARR:END -->\n", section),
    ).toThrow("exactly one complete");
    expect(() =>
      applyManagedIndex(`${section}\n${section}\n`, section),
    ).toThrow("exactly one complete");
  });
});
