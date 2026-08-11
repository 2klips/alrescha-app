import {
  applyManagedIndex,
  buildMinimalIndexProposalFiles,
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
      "<!-- SPECPROOF:BEGIN (managed — do not edit inside) -->",
      "old managed bytes",
      "<!-- SPECPROOF:END -->",
      "",
      "Keep this exact suffix.",
      "",
    ].join("\n");
    const section = renderManagedIndex({
      dashboardUrl: "https://app.specproof.test/workspaces/ws_demo",
      mcpEndpoint: "https://mcp.specproof.test",
    });

    const once = applyManagedIndex(existing, section);
    const twice = applyManagedIndex(once, section);

    expect(twice).toBe(once);
    expect(once.startsWith("# Team rules\n\nKeep this exact prefix.\n\n")).toBe(
      true,
    );
    expect(once.endsWith("\n\nKeep this exact suffix.\n")).toBe(true);
    expect(section.split("\n")).toHaveLength(6);
    expect(section.split("\n").length).toBeLessThanOrEqual(30);
    expect(once).toContain("call MCP tool `request_context_pack`");
  });

  it("proposes bounded index files without document-body inlining", () => {
    const proposal = buildMinimalIndexProposalFiles({
      agentsContent: null,
      claudeContent: null,
      dashboardUrl: "https://app.specproof.test/workspaces/ws_demo",
      mcpEndpoint: "https://mcp.specproof.test",
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
      dashboardUrl: "https://app.specproof.test/workspaces/ws_demo",
      mcpEndpoint: "https://mcp.specproof.test",
    });

    expect(regenerated.files).toEqual([]);
    expect(regenerated.managedSection).toBe(proposal.managedSection);
  });

  it("fails closed on incomplete or duplicate managed markers", () => {
    const section = renderManagedIndex({
      dashboardUrl: "https://app.specproof.test/workspaces/ws_demo",
      mcpEndpoint: "https://mcp.specproof.test",
    });

    expect(() =>
      applyManagedIndex("prefix\n<!-- SPECPROOF:END -->\n", section),
    ).toThrow("exactly one complete");
    expect(() => applyManagedIndex(`${section}\n${section}\n`, section)).toThrow(
      "exactly one complete",
    );
  });
});
