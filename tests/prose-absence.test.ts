import { describe, expect, it } from "vitest";

import {
  buildArtifactCard,
  summaryAbsence,
  type SummaryState,
} from "../packages/core/src/index";
import { searchWorkspaceIndex } from "../packages/mcp/src/data-brain";
import { getNodeContent } from "../packages/mcp/src/graph-tools";
import type {
  McpArtifactData,
  McpWorkspaceData,
} from "../packages/mcp/src/store";

/**
 * One absence, one sentence (Phase 4 Wave D todo 19 보완 R-02).
 *
 * The freshness rule runs at the store boundary, so prose written for an
 * older blob never reaches a reader — it reaches them as an empty string.
 * That is the right call and it leaves a hole, and a hole with no
 * explanation reads as "this file has nothing to say". An agent acts on that
 * differently than on "nobody has described this file yet" or "the
 * description is out of date".
 *
 * Three surfaces report the hole: the shared artifact card, the
 * `get_node_content` answer and the `search_index` excerpt. They take the
 * sentence from `summaryAbsence`, and this pins that they take it from the
 * same place rather than each writing their own.
 */

const WORKSPACE = "01K900000000000000000000W1";
const REPOSITORY = "01K900000000000000000000R1";
const NODE = "01K900000000000000000000A1";
const BLOB = "b".repeat(40);
const OLDER = "c".repeat(40);

function artifact(overrides: Partial<McpArtifactData> = {}): McpArtifactData {
  return {
    blobSha: BLOB,
    content: "",
    headings: [],
    id: NODE,
    kind: "code_metadata",
    path: "src/session.ts",
    status: "active",
    summary: "src/session.ts",
    summaryState: { state: "missing" },
    symbols: [],
    tags: [],
    title: "src/session.ts",
    ...overrides,
  };
}

function workspace(row: McpArtifactData): McpWorkspaceData {
  return {
    id: WORKSPACE,
    ownerUserId: "owner",
    repositories: [
      {
        artifacts: [row],
        contextPacks: [],
        defaultBranch: "main",
        edges: [],
        evidence: [],
        findings: [],
        fullName: "owner/repo",
        id: REPOSITORY,
        indexEntries: [
          {
            headings: [],
            id: NODE,
            neighborIds: [],
            nodeId: NODE,
            path: row.path,
            searchKey: "src/session.ts session.ts code_metadata",
            symbols: [],
            tags: [],
            title: "session.ts",
            type: "artifact",
          },
        ],
        overview: "owner/repo on main",
        receipts: [],
        requirements: [],
      },
    ],
  };
}

const STALE: SummaryState = {
  currentBlobSha: BLOB,
  sourceBlobSha: OLDER,
  state: "stale",
  text: "the description of an older version",
};
const UNKNOWN: SummaryState = {
  reason: "summary carries no source digest",
  state: "unknown",
  text: "a description of unrecorded vintage",
};

describe("an absent description", () => {
  for (const [name, state] of [
    ["missing", { state: "missing" } as SummaryState],
    ["stale", STALE],
    ["unknown", UNKNOWN],
  ] as const) {
    it(`reads the same on all three surfaces when it is ${name}`, () => {
      const row = artifact({ summaryState: state });
      const expected = summaryAbsence(state);
      expect(expected).not.toBeNull();

      const content = getNodeContent(workspace(row), NODE);
      expect(content?.content).toBe("");
      expect(content?.contentAbsence).toEqual(expected);

      const [hit] = searchWorkspaceIndex(workspace(row), {
        query: "session.ts",
      });
      expect(hit?.excerpt).toBe("");
      expect(hit?.excerptAbsence).toEqual(expected);

      const card = buildArtifactCard({
        classification: "code_metadata",
        path: row.path,
        summary: state,
      });
      expect(card.missing).toContain(expected?.reason);
    });
  }

  /**
   * Not a tautology: the three states have to be told apart, or one sentence
   * for all of them would pass the test above and tell a reader nothing.
   */
  it("gives each state its own sentence", () => {
    const sentences = [
      summaryAbsence({ state: "missing" })?.reason,
      summaryAbsence(STALE)?.reason,
      summaryAbsence(UNKNOWN)?.reason,
    ];
    expect(new Set(sentences).size).toBe(3);
    expect(sentences[1]).toMatch(/older version/);
    expect(sentences[2]).toMatch(/no source digest/);
  });

  it("says nothing when the description is current", () => {
    const state: SummaryState = {
      grade: "inferred",
      sourceBlobSha: BLOB,
      state: "current",
      text: "what this file does",
    };
    const row = artifact({ content: state.text, summaryState: state });

    expect(summaryAbsence(state)).toBeNull();
    expect(
      getNodeContent(workspace(row), NODE)?.contentAbsence,
    ).toBeUndefined();
    const [hit] = searchWorkspaceIndex(workspace(row), { query: "session.ts" });
    expect(hit?.excerpt).toBe("what this file does");
    expect(hit?.excerptAbsence).toBeUndefined();
  });
});
