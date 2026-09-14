import { describe, expect, it } from "vitest";

import { queryWorkspaceBrain } from "./data-brain";
import { collectNeighbors, getNodeContent, tracePath } from "./graph-tools";
import {
  InMemoryMcpStore,
  MCP_EDGE_RELATIONS,
  MCP_NODE_TYPES,
  type McpEdgeData,
  type McpWorkspaceData,
} from "./store";

/**
 * The concept layer, reachable through the tools (Phase 4 Wave D todo 19 ⑴).
 *
 * Concepts have been graph nodes since Wave C todo 7 and edges from them
 * carry the synthesis vocabulary (`part_of`, `uses`, …). Until this, the
 * node type was outside `MCP_NODE_TYPES` and every one of those relations
 * was reported as "outside the MCP vocabulary" — a layer on the map that no
 * tool could name. These pin the four surfaces that now can.
 */

const WORKSPACE_ID = "01K287J3D18V7A1MZG9E8D1Y01";
const USER_ID = "user-owner";
const REPOSITORY_ID = "01K287J3D18V7A1MZG9E8D1Y10";
const QUEUE_FILE = "01K287J3D18V7A1MZG9E8D1Y12";
const LEASE_FILE = "01K287J3D18V7A1MZG9E8D1Y13";
const CONCEPT = "01K287J3D18V7A1MZG9E8D1YC1";
const OTHER_CONCEPT = "01K287J3D18V7A1MZG9E8D1YC2";

function conceptEdge(input: {
  readonly id: string;
  readonly relation: McpEdgeData["relation"];
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
}): McpEdgeData {
  return {
    confidence: 0.8,
    family: "semantic",
    id: input.id,
    provenance: {
      method: "concept-synthesis",
      reason: "synthesised",
      span: null,
    },
    relation: input.relation,
    sourceNodeId: input.sourceNodeId,
    targetNodeId: input.targetNodeId,
    tier: "inferred",
  };
}

function workspace(): McpWorkspaceData {
  const artifact = (id: string, path: string) => ({
    content: "",
    headings: [],
    id,
    kind: "code_metadata",
    path,
    status: "active",
    summary: path,
    symbols: [],
    tags: [],
    title: path.split("/").at(-1) ?? path,
  });
  return {
    id: WORKSPACE_ID,
    ownerUserId: USER_ID,
    repositories: [
      {
        artifacts: [
          artifact(QUEUE_FILE, "apps/worker/src/queue.ts"),
          artifact(LEASE_FILE, "apps/worker/src/lease.ts"),
        ],
        concepts: [
          {
            id: CONCEPT,
            kind: "system",
            memberPaths: [
              "apps/worker/src/lease.ts",
              "apps/worker/src/queue.ts",
            ],
            name: "Job queue",
            slug: "job-queue",
            summary: "A Postgres-backed queue that claims jobs with leases.",
          },
          {
            id: OTHER_CONCEPT,
            kind: "concept",
            memberPaths: [],
            name: "Idempotent billing",
            slug: "idempotent-billing",
            summary: "Every charge carries an idempotency key.",
          },
        ],
        contextPacks: [],
        defaultBranch: "main",
        edges: [
          conceptEdge({
            id: "e1",
            relation: "part_of",
            sourceNodeId: QUEUE_FILE,
            targetNodeId: CONCEPT,
          }),
          conceptEdge({
            id: "e2",
            relation: "part_of",
            sourceNodeId: LEASE_FILE,
            targetNodeId: CONCEPT,
          }),
          conceptEdge({
            id: "e3",
            relation: "depends_on",
            sourceNodeId: OTHER_CONCEPT,
            targetNodeId: CONCEPT,
          }),
        ],
        evidence: [],
        findings: [],
        fullName: "acme/app",
        id: REPOSITORY_ID,
        indexEntries: [],
        overview: "fixture",
        receipts: [],
        requirements: [],
      },
    ],
  };
}

describe("concepts in the MCP vocabulary (todo 19 ⑴)", () => {
  it("names the node type and the six synthesis relations, contains still excluded", () => {
    expect(MCP_NODE_TYPES).toContain("concept");
    for (const relation of [
      "part_of",
      "uses",
      "depends_on",
      "produces",
      "configures",
      "validates",
    ]) {
      expect(MCP_EDGE_RELATIONS).toContain(relation);
    }
    expect(MCP_EDGE_RELATIONS).not.toContain("contains");
  });

  it("query_brain(types: ['concept']) lists concepts, synthesised, anchored to their first member", () => {
    const result = queryWorkspaceBrain(workspace(), { types: ["concept"] });
    expect(
      result.nodes.map(({ id, label, path, status, type }) => ({
        id,
        label,
        path,
        status,
        type,
      })),
    ).toEqual([
      // Same type, so by label — the brain query's own order.
      {
        id: OTHER_CONCEPT,
        label: "Idempotent billing",
        path: undefined,
        status: "synthesized",
        type: "concept",
      },
      {
        id: CONCEPT,
        label: "Job queue",
        path: "apps/worker/src/lease.ts",
        status: "synthesized",
        type: "concept",
      },
    ]);
    // The relations a concept carries are the synthesis vocabulary.
    expect(result.nodes.find(({ id }) => id === CONCEPT)?.relations).toEqual([
      "depends_on",
      "part_of",
    ]);
    expect(
      queryWorkspaceBrain(workspace(), {
        relations: ["part_of"],
        types: ["artifact"],
      }).nodes.map(({ id }) => id),
    ).toEqual([LEASE_FILE, QUEUE_FILE]);
  });

  it("get_neighbors walks part_of and depends_on to and from a concept", () => {
    const fromFile = collectNeighbors(workspace(), QUEUE_FILE, 1);
    // Neighbourhood nodes are sorted by id — the file sorts first here.
    expect(fromFile?.nodes.map(({ id, type }) => ({ id, type }))).toEqual([
      { id: QUEUE_FILE, type: "artifact" },
      { id: CONCEPT, type: "concept" },
    ]);
    expect(fromFile?.edges.map(({ relation }) => relation)).toEqual([
      "part_of",
    ]);
    const fromConcept = collectNeighbors(workspace(), CONCEPT, 1);
    expect(fromConcept?.nodes.map(({ id }) => id).sort()).toEqual(
      [CONCEPT, OTHER_CONCEPT, QUEUE_FILE, LEASE_FILE].sort(),
    );
    // Nothing was left out for being outside the vocabulary.
    expect(fromConcept?.omissions).toEqual([]);
    // And a relation filter narrows to the synthesis vocabulary by name.
    expect(
      collectNeighbors(workspace(), CONCEPT, 1, ["depends_on"])?.nodes.map(
        ({ id }) => id,
      ),
    ).toEqual([CONCEPT, OTHER_CONCEPT].sort());
  });

  it("trace_path crosses a concept between two files it groups", () => {
    const path = tracePath(workspace(), QUEUE_FILE, LEASE_FILE, 4);
    expect(path?.nodeIds).toEqual([QUEUE_FILE, CONCEPT, LEASE_FILE]);
    expect(path?.hops).toBe(2);
  });

  it("the node reader answers a concept with its summary marked inferred", () => {
    expect(getNodeContent(workspace(), CONCEPT)).toEqual({
      content: "A Postgres-backed queue that claims jobs with leases.",
      contentGrade: "inferred",
      id: CONCEPT,
      kind: "system",
      path: "apps/worker/src/lease.ts",
      repositoryId: REPOSITORY_ID,
      type: "concept",
    });
    // A file's content carries no grade field: it is not prose.
    expect(getNodeContent(workspace(), QUEUE_FILE)).not.toHaveProperty(
      "contentGrade",
    );
  });

  it("a concept is a node the write tools may anchor to", async () => {
    const store = new InMemoryMcpStore({ workspaces: [workspace()] });
    const principal = {
      scopes: ["mcp:read", "mcp:write"] as const,
      tokenId: "t",
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
    };
    expect(
      await store.assertLink(principal, {
        reason: "the queue configures the lease",
        relation: "configures",
        sourceNodeId: QUEUE_FILE,
        targetNodeId: CONCEPT,
      }),
    ).toMatchObject({ outcome: "added" });
    expect(
      await store.writeMemory(principal, {
        anchorNodeId: CONCEPT,
        entryKey: "queue-claim",
        name: "decisions",
        text: "Claims use SKIP LOCKED.",
      }),
    ).toMatchObject({ outcome: "added" });
  });
});
