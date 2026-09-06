import { describe, expect, it } from "vitest";

import { buildArtifactCard } from "../packages/core/src/index";
import {
  artifactRowFromQuery,
  inspectionArtifactCard,
} from "../apps/web/lib/inspection/inspection-report";
import { getWorkspaceArtifact } from "../packages/mcp/src/data-brain";
import { prepareChange } from "../packages/mcp/src/prepare-change";
import type {
  McpEdgeData,
  McpRepositoryData,
  McpWorkspaceData,
} from "../packages/mcp/src/store";

/**
 * The shared artifact card (Codex remedy §6.1 / §9.1, step S5).
 *
 * The screen and the agent were describing a file separately: the inspector
 * read `metadata.summary`, `get_artifact` read `metadata.summary`, the search
 * excerpt read `content`. Three answers to one question is three chances to
 * be differently wrong, and the point of one builder is that they cannot be.
 */

const WORKSPACE_ID = "01K200000000000000000000W1";
const USER_ID = "10000000-0000-4000-8000-000000000001";
const REPOSITORY_ID = "01K200000000000000000000R1";
const CODE = "01K200000000000000000000A1";
const TEST = "01K200000000000000000000A2";
const BLOB = "a".repeat(40);
const OLDER = "b".repeat(40);

function edge(relation: string, source: string, target: string): McpEdgeData {
  return {
    confidence: 1,
    family: "structure",
    id: `${source}-${relation}-${target}`,
    provenance: { method: null, reason: "fixture", span: null },
    relation: relation as McpEdgeData["relation"],
    sourceNodeId: source,
    targetNodeId: target,
    tier: "resolved",
  };
}

function workspaceOf(input: {
  summary: string | null;
  summaryBlobSha: string | null;
}): McpWorkspaceData {
  const state =
    input.summary === null
      ? ({ state: "missing" } as const)
      : input.summaryBlobSha === BLOB
        ? ({
            grade: "inferred" as const,
            sourceBlobSha: BLOB,
            state: "current" as const,
            text: input.summary,
          } as const)
        : ({
            currentBlobSha: BLOB,
            sourceBlobSha: input.summaryBlobSha ?? "",
            state: "stale" as const,
            text: input.summary,
          } as const);
  const repository: McpRepositoryData = {
    artifacts: [
      {
        blobSha: BLOB,
        content: "",
        headings: [],
        id: CODE,
        kind: "code_metadata",
        path: "src/session.ts",
        status: "active",
        summary: input.summary ?? "src/session.ts",
        ...(input.summaryBlobSha === null ? {} : { summaryState: state }),
        symbols: ["isSessionExpired", "SESSION_TIMEOUT_MS"],
        tags: [],
        title: "src/session.ts",
      },
      {
        blobSha: BLOB,
        content: "",
        headings: [],
        id: TEST,
        kind: "code_metadata",
        path: "tests/session.test.ts",
        status: "active",
        summary: "tests/session.test.ts",
        symbols: [],
        tags: [],
        title: "tests/session.test.ts",
      },
    ],
    contextPacks: [],
    defaultBranch: "main",
    edges: [edge("tests", TEST, CODE), edge("imports", TEST, CODE)],
    evidence: [],
    findings: [],
    fullName: "2klips/cards",
    id: REPOSITORY_ID,
    indexEntries: [],
    overview: "card fixture",
    receipts: [],
    requirements: [],
  };
  return { id: WORKSPACE_ID, ownerUserId: USER_ID, repositories: [repository] };
}

describe("the shared artifact card", () => {
  it("describes a file with no prose at all", () => {
    const card = buildArtifactCard({
      classification: "code_metadata",
      exportedSymbols: [{ name: "isSessionExpired" }],
      path: "src/session.ts",
      relations: [{ direction: "incoming", relation: "imports" }],
      summary: { state: "missing" },
    });

    // A repository that has never paid for enrich still gets facts.
    expect(card).toMatchObject({
      domain: "backend",
      exports: ["isSessionExpired"],
      kind: "code_metadata",
      path: "src/session.ts",
      relations: { imports: 1 },
      tested: false,
      unit: "lib",
    });
    // And `missing` says what is absent instead of leaving an empty string
    // to be read as "nothing to say".
    expect(card.missing).toContain("no summary has been written");
    expect(card.missing).toContain("no test edge points at this file");
  });

  it("says a summary is stale rather than showing or hiding it silently", () => {
    const card = buildArtifactCard({
      classification: "code_metadata",
      path: "src/session.ts",
      relations: [{ direction: "incoming", relation: "tests" }],
      summary: {
        currentBlobSha: BLOB,
        sourceBlobSha: OLDER,
        state: "stale",
        text: "the old description",
      },
    });

    expect(card.summary.state).toBe("stale");
    expect(card.missing).toContain(
      "the summary describes an older version of this file",
    );
    expect(card.tested).toBe(true);
  });

  it("carries names, never signatures", () => {
    const card = buildArtifactCard({
      classification: "code_metadata",
      exportedSymbols: [
        { name: "isSessionExpired" },
        { name: "isSessionExpired" },
        { name: "SESSION_TIMEOUT_MS" },
      ],
      path: "src/session.ts",
      summary: { state: "missing" },
    });
    expect(card.exports).toEqual(["SESSION_TIMEOUT_MS", "isSessionExpired"]);
    expect(JSON.stringify(card)).not.toContain("(");
  });

  /**
   * The property that matters: two mappings into one builder. The screen and
   * the agent read different row shapes, so a drift between those mappings
   * is the failure this replaces two builders with.
   */
  it("gives the screen and the agent the same card from the same facts", () => {
    const workspace = workspaceOf({
      summary: "현행 설명",
      summaryBlobSha: BLOB,
    });
    const fromAgent = getWorkspaceArtifact(workspace, {
      path: "src/session.ts",
    }).card;

    const fromScreen = inspectionArtifactCard(
      artifactRowFromQuery({
        exported_symbols: [
          { name: "isSessionExpired" },
          { name: "SESSION_TIMEOUT_MS" },
        ],
        kind: "code_metadata",
        last_seen_commit_sha: null,
        path: "src/session.ts",
        source_blob_sha: BLOB,
        summary: "현행 설명",
        summary_blob_sha: BLOB,
      }),
    );

    // The screen's row carries no edges, so the relation-derived fields
    // differ — everything the two bases agree on has to match exactly.
    expect(fromScreen.domain).toBe(fromAgent?.domain);
    expect(fromScreen.exports).toEqual(fromAgent?.exports);
    expect(fromScreen.kind).toBe(fromAgent?.kind);
    expect(fromScreen.path).toBe(fromAgent?.path);
    expect(fromScreen.summary).toEqual(fromAgent?.summary);
    expect(fromScreen.unit).toBe(fromAgent?.unit);
  });

  it("does not present stale prose as the file's description on either side", () => {
    const workspace = workspaceOf({
      summary: "the old description",
      summaryBlobSha: OLDER,
    });
    const fromAgent = getWorkspaceArtifact(workspace, {
      path: "src/session.ts",
    }).card;
    const fromScreen = inspectionArtifactCard(
      artifactRowFromQuery({
        exported_symbols: [],
        kind: "code_metadata",
        last_seen_commit_sha: null,
        path: "src/session.ts",
        source_blob_sha: BLOB,
        summary: "the old description",
        summary_blob_sha: OLDER,
      }),
    );

    expect(fromAgent?.summary.state).toBe("stale");
    expect(fromScreen.summary.state).toBe("stale");
    expect(fromScreen.summary).toEqual(fromAgent?.summary);
  });
});

describe("prepareChange", () => {
  it("composes the card, the consumers and what is missing", () => {
    const workspace = workspaceOf({
      summary: "현행 설명",
      summaryBlobSha: BLOB,
    });
    const brief = prepareChange(workspace, { path: "src/session.ts" });

    expect(brief.target.nodeId).toBe(CODE);
    expect(brief.target.card?.path).toBe("src/session.ts");
    // The test imports the file, so it is a consumer and a related test.
    expect(brief.consumers?.candidates.map(({ nodeId }) => nodeId)).toEqual([
      TEST,
    ]);
    expect(brief.consumers?.relatedTests).toEqual([TEST]);
    expect(brief.consumers?.complete).toBe(true);
  });

  it("says so when the path names no stored artifact", () => {
    const brief = prepareChange(
      workspaceOf({ summary: null, summaryBlobSha: null }),
      {
        path: "src/nowhere.ts",
      },
    );

    expect(brief.target.nodeId).toBeNull();
    expect(brief.target.card).toBeNull();
    expect(brief.consumers).toBeNull();
    expect(brief.missing).toContain("no artifact is stored at this path");
  });
});
