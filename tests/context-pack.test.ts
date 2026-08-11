import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  composeContextPack,
  type ContextDocument,
} from "../packages/core/src/index";
import { describe, expect, it } from "vitest";

const FIXTURE_ROOT = resolve(import.meta.dirname, "../fixtures/drifted-demo");

async function fixtureDocument(
  path: string,
  kind: ContextDocument["kind"],
  title: string,
  relatedNodeIds: readonly string[] = [],
): Promise<ContextDocument> {
  return {
    content: await readFile(resolve(FIXTURE_ROOT, path), "utf8"),
    id: `document:${path}`,
    kind,
    path,
    relatedNodeIds,
    title,
  };
}

describe("graph-driven context packs", () => {
  it("selects fixture authentication docs under budget in reading order", async () => {
    const documents = await Promise.all([
      fixtureDocument("AGENTS.md", "agents", "Fixture agent rules"),
      fixtureDocument("spec.md", "spec", "Drifted Demo Specification", [
        "REQ-AUTH-001",
      ]),
      fixtureDocument("TODO.md", "todo_progress", "Drifted Demo TODO", [
        "REQ-AUTH-001",
      ]),
      fixtureDocument(
        ".agents/skills/review-auth/SKILL.md",
        "skill",
        "Review authentication",
        ["REQ-AUTH-001"],
      ),
      fixtureDocument(
        "docs/adr/ADR-001-session-timeout.md",
        "adr",
        "Session timeout",
        ["REQ-AUTH-002"],
      ),
      fixtureDocument(
        "docs/adr/ADR-002-unused-export.md",
        "adr",
        "Export weekly snapshots",
        ["REQ-EXPORT-001"],
      ),
    ]);

    const pack = composeContextPack({
      documents,
      relations: [
        {
          sourceId: "REQ-AUTH-001",
          targetId: "document:spec.md",
          type: "specified_by",
        },
        {
          sourceId: "REQ-AUTH-001",
          targetId: "document:TODO.md",
          type: "tracked_by",
        },
      ],
      targetAgent: "codex",
      taskDescription: "Implement GitHub OAuth login and prove REQ-AUTH-001.",
      tokenBudget: 270,
    });

    expect(pack.readingOrder.map(({ path }) => path)).toEqual([
      "AGENTS.md",
      "spec.md",
      "TODO.md",
    ]);
    expect(pack.estimatedTokens).toBeLessThanOrEqual(270);
    expect(pack.omitted.map(({ path }) => path)).toContain(
      ".agents/skills/review-auth/SKILL.md",
    );
  });

  it.each([
    ["claude-code", "Claude Code"],
    ["codex", "Codex"],
    ["cursor", "Cursor"],
    ["generic", "Generic agent"],
  ] as const)("formats the pack for %s", (targetAgent, label) => {
    const pack = composeContextPack({
      documents: [
        {
          content: "# Authentication\nUse GitHub OAuth.",
          id: "doc:auth",
          kind: "spec",
          path: "spec.md",
          title: "Authentication",
        },
      ],
      relations: [],
      targetAgent,
      taskDescription: "Implement authentication",
      tokenBudget: 128,
    });

    expect(pack.formattedText).toMatch(
      new RegExp(`^# Context pack for ${label}`),
    );
    expect(pack.assumption).toContain("formatting overhead is excluded");
  });

  it("selects a document through a graph-neighbor label without lexical document matches", () => {
    const pack = composeContextPack({
      documents: [
        {
          content: "# Decision\nUse the accepted provider.",
          id: "doc:decision",
          kind: "adr",
          path: "docs/adr/001.md",
          title: "Provider decision",
        },
      ],
      relations: [
        {
          sourceId: "requirement:01",
          sourceLabel: "Implement GitHub OAuth login",
          targetId: "doc:decision",
          type: "specified_by",
        },
      ],
      targetAgent: "generic",
      taskDescription: "Add GitHub OAuth login",
      tokenBudget: 128,
    });

    expect(pack.readingOrder).toEqual([
      expect.objectContaining({
        path: "docs/adr/001.md",
        reason: expect.stringContaining("evidence-graph relation"),
      }),
    ]);
  });
});
