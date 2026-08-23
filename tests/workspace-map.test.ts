import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { scanRepository } from "../packages/core/src/index";
import { createLocalRepositorySource } from "../packages/cli/src/local-source";
import {
  buildWorkspaceMapModel,
  MAP_CLUSTER_THRESHOLD,
  type MapEdgeRow,
  type MapGraphNodeRow,
  type WorkspaceMapRows,
} from "../apps/web/lib/map/workspace-map";
import {
  ALL_MIGRATIONS,
  asAuthenticatedUser,
  createTestDatabase,
} from "./helpers/database";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const DRIFTED_DEMO = resolve(repoRoot, "fixtures/drifted-demo");

const WORKSPACE = "workspace-map-test";
const SHA = "a".repeat(40);

function emptyRows(): WorkspaceMapRows {
  return {
    accessEvents: [],
    artifacts: [],
    edges: [],
    evidence: [],
    findings: [],
    graphNodes: [],
    rationales: [],
    repositories: [],
    requirements: [],
    tokens: [],
  };
}

/**
 * A small persisted graph exercising every mapping rule at once: an artifact
 * with an open finding, a test artifact, a spec document, a rationale note, a
 * requirement backed by execution evidence, and a contradicting edge.
 */
function fixtureRows(): WorkspaceMapRows {
  return {
    ...emptyRows(),
    accessEvents: [
      {
        id: "event-1",
        occurred_at: "2026-08-23T09:00:00.000Z",
        target_node_ids: ["node-code"],
        token_id: "token-live",
        tool: "search_index",
      },
      {
        id: "event-2",
        occurred_at: "2026-08-23T09:00:01.000Z",
        target_node_ids: ["node-unknown"],
        token_id: "token-live",
        tool: "query_brain",
      },
    ],
    artifacts: [
      { classification: "code_metadata", id: "node-code", path: "src/auth.ts" },
      {
        classification: "code_metadata",
        id: "node-test",
        path: "tests/auth.test.ts",
      },
      { classification: "spec", id: "node-spec", path: "spec/WORK_SPEC.md" },
    ],
    edges: [
      {
        confidence: 1,
        id: "edge-rationale",
        provenance: {
          sourceArtifactId: "node-code",
          span: { endLine: 12, path: "src/auth.ts", startLine: 12 },
        },
        relation: "references",
        source_node_id: "node-rationale",
        target_node_id: "node-code",
      },
      {
        confidence: 1,
        id: "edge-supports",
        provenance: { reason: "ci report parsed" },
        relation: "supports",
        source_node_id: "node-evidence",
        target_node_id: "node-requirement",
      },
      {
        confidence: 0.9,
        id: "edge-contradicts",
        provenance: { reason: "stale doc" },
        relation: "contradicts",
        source_node_id: "node-spec",
        target_node_id: "node-code",
      },
    ],
    evidence: [
      {
        id: "node-evidence",
        kind: "ci",
        source_artifact_id: "node-test",
        verdict: "supports",
      },
    ],
    findings: [
      { source_node_id: "node-code", status: "open" },
      { source_node_id: null, status: "open" },
    ],
    graphNodes: [
      { id: "node-code", kind: "artifact", label: "src/auth.ts" },
      { id: "node-test", kind: "artifact", label: "tests/auth.test.ts" },
      { id: "node-spec", kind: "artifact", label: "spec/WORK_SPEC.md" },
      {
        id: "node-rationale",
        kind: "rationale",
        label: "WHY: 세션은 서버가 소유한다",
      },
      { id: "node-requirement", kind: "requirement", label: "REQ" },
      { id: "node-evidence", kind: "evidence", label: "ci: auth suite" },
      { id: "node-finding", kind: "finding", label: "missing-test" },
    ],
    rationales: [
      {
        artifact_id: "node-code",
        id: "node-rationale",
        source_line: 12,
        source_path: "src/auth.ts",
      },
    ],
    repositories: [
      {
        full_name: "2klips/arr-app",
        id: "repo-1",
        last_scanned_commit_sha: SHA,
      },
    ],
    requirements: [
      {
        id: "node-requirement",
        source_artifact_id: "node-spec",
        source_span: { endLine: 4, path: "spec/WORK_SPEC.md", startLine: 2 },
        statement: "세션은 서버가 발급해야 한다",
      },
    ],
    tokens: [
      { id: "token-live", revoked_at: null },
      { id: "token-dead", revoked_at: "2026-08-20T00:00:00.000Z" },
    ],
  };
}

describe("workspace map builder (Phase 3 Wave A todo 1)", () => {
  it("an empty workspace yields an empty model, never the demo fixture", () => {
    const model = buildWorkspaceMapModel(WORKSPACE, emptyRows());
    expect(model.graph.nodes).toEqual([]);
    expect(model.graph.edges).toEqual([]);
    expect(model.counts).toEqual({
      artifacts: 0,
      edges: 0,
      openFindings: 0,
      rationales: 0,
      requirements: 0,
    });
    expect(model.repoFullName).toBeNull();
    expect(model.lastScannedCommitSha).toBeNull();
    expect(model.isClustered).toBe(false);
  });

  it("maps persisted kinds onto the display vocabulary", () => {
    const model = buildWorkspaceMapModel(WORKSPACE, fixtureRows());
    const byId = new Map(model.graph.nodes.map((node) => [node.id, node]));

    expect(byId.get("node-code")?.type).toBe("code");
    expect(byId.get("node-test")?.type).toBe("test");
    expect(byId.get("node-spec")?.type).toBe("document");
    expect(byId.get("node-rationale")?.type).toBe("document");
    expect(byId.get("node-requirement")?.type).toBe("requirement");
    expect(byId.get("node-evidence")?.type).toBe("test");
    // Findings are counts on their source node, not nodes of their own.
    expect(byId.has("node-finding")).toBe(false);

    expect(byId.get("node-code")?.label).toBe("auth.ts");
    expect(byId.get("node-rationale")?.path).toBe("src/auth.ts:12");
    expect(byId.get("node-requirement")?.label).toBe(
      "세션은 서버가 발급해야 한다",
    );
  });

  it("grades honestly: broken from open findings, verified only from execution evidence", () => {
    const model = buildWorkspaceMapModel(WORKSPACE, fixtureRows());
    const byId = new Map(model.graph.nodes.map((node) => [node.id, node]));

    expect(byId.get("node-code")?.grade).toBe("broken");
    expect(byId.get("node-code")?.findingCount).toBe(1);
    expect(byId.get("node-requirement")?.grade).toBe("verified");
    expect(byId.get("node-evidence")?.grade).toBe("verified");
    // A scan-only artifact has no execution evidence → inferred, by design.
    expect(byId.get("node-spec")?.grade).toBe("inferred");
    expect(byId.get("node-test")?.grade).toBe("inferred");
  });

  it("maps stored edges with provenance and marks contradictions broken", () => {
    const model = buildWorkspaceMapModel(WORKSPACE, fixtureRows());
    const byId = new Map(model.graph.edges.map((edge) => [edge.id, edge]));

    const rationale = byId.get("edge-rationale");
    expect(rationale?.provenance.sourcePath).toBe("src/auth.ts");
    expect(rationale?.provenance.startLine).toBe(12);
    expect(rationale?.provenance.relation).toBe("references");
    expect(rationale?.grade).toBe("inferred");

    const supports = byId.get("edge-supports");
    expect(supports?.grade).toBe("verified");

    const contradicts = byId.get("edge-contradicts");
    expect(contradicts?.broken).toBe(true);
    expect(contradicts?.grade).toBe("broken");
  });

  it("counts what is stored and lists revoked tokens for the glow policy", () => {
    const model = buildWorkspaceMapModel(WORKSPACE, fixtureRows());
    expect(model.counts).toEqual({
      artifacts: 3,
      edges: 3,
      openFindings: 2,
      rationales: 1,
      requirements: 1,
    });
    expect(model.repoFullName).toBe("2klips/arr-app");
    expect(model.lastScannedCommitSha).toBe(SHA);
    expect(model.revokedTokenIds).toEqual(["token-dead"]);
  });

  it("seeds the feed with real events, naming the touched node when it exists", () => {
    const model = buildWorkspaceMapModel(WORKSPACE, fixtureRows());
    expect(model.feed).toHaveLength(2);
    expect(model.feed[0]).toMatchObject({
      targetPath: "src/auth.ts",
      tool: "search_index",
      workspaceId: WORKSPACE,
    });
    // A target that is not in the graph falls back to the tool name.
    expect(model.feed[1]?.targetPath).toBe("query_brain");
    expect(model.feed[0]?.occurredAt).toBe(
      new Date("2026-08-23T09:00:00.000Z").getTime(),
    );
  });

  it("keeps pilot-scale graphs unclustered and clusters past the threshold", () => {
    const smallModel = buildWorkspaceMapModel(WORKSPACE, fixtureRows());
    expect(smallModel.isClustered).toBe(false);

    const manyNodes: MapGraphNodeRow[] = Array.from(
      { length: MAP_CLUSTER_THRESHOLD + 1 },
      (_, index) => ({
        id: `node-${index}`,
        kind: "artifact",
        label: `file-${index}.ts`,
      }),
    );
    const largeModel = buildWorkspaceMapModel(WORKSPACE, {
      ...emptyRows(),
      artifacts: manyNodes.map((node) => ({
        classification: "code_metadata",
        id: node.id,
        path: node.label,
      })),
      graphNodes: manyNodes,
    });
    expect(largeModel.isClustered).toBe(true);
    expect(largeModel.graph.nodes.length).toBeLessThan(manyNodes.length);
  });

  it("drops edges whose endpoints are not visible nodes", () => {
    const danglingEdge: MapEdgeRow = {
      confidence: 1,
      id: "edge-dangling",
      provenance: { reason: "points at a finding node" },
      relation: "references",
      source_node_id: "node-code",
      target_node_id: "node-finding",
    };
    const rows = fixtureRows();
    const model = buildWorkspaceMapModel(WORKSPACE, {
      ...rows,
      edges: [...rows.edges, danglingEdge],
    });
    expect(
      model.graph.edges.find((edge) => edge.id === "edge-dangling"),
    ).toBeUndefined();
  });
});

const USER_A = "71111111-1111-4111-8111-111111111111";
const USER_B = "72222222-2222-4222-8222-222222222222";

describe("workspace map rows are tenant-scoped (Phase 3 Wave A todo 1)", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let workspaceA: string;
  let workspaceB: string;

  beforeEach(async () => {
    database = await createTestDatabase([...ALL_MIGRATIONS]);
    await database.query(
      "insert into auth.users (id, email) values ($1, 'map-a@example.test'), ($2, 'map-b@example.test')",
      [USER_A, USER_B],
    );
    const workspaces = await database.query<{
      id: string;
      owner_user_id: string;
    }>("select id, owner_user_id from public.workspaces");
    workspaceA =
      workspaces.rows.find(({ owner_user_id }) => owner_user_id === USER_A)
        ?.id ?? "";
    workspaceB =
      workspaces.rows.find(({ owner_user_id }) => owner_user_id === USER_B)
        ?.id ?? "";
  });

  afterEach(async () => {
    await database.close();
  });

  it("a real scan renders for its owner and stays invisible to another tenant", async () => {
    const repository = await database.query<{ id: string }>(
      "select public.ensure_local_repository($1, 'local/map-demo') as id",
      [workspaceA],
    );
    const repositoryId = repository.rows[0]?.id ?? "";
    const { commitSha, source } =
      await createLocalRepositorySource(DRIFTED_DEMO);
    const plan = await scanRepository({ commitSha, source });
    await database.query(
      "select public.apply_repository_scan($1, $2, $3::jsonb)",
      [workspaceA, repositoryId, JSON.stringify(plan)],
    );

    // Mirror the loader's queries as the signed-in owner.
    const seenByA = await asAuthenticatedUser(database, USER_A, async (tx) => {
      const graphNodes = await tx.query<{
        id: string;
        kind: string;
        label: string;
      }>("select id, kind, label from public.graph_nodes");
      const artifacts = await tx.query<{
        classification: string;
        id: string;
        path: string;
      }>("select id, classification, path from public.artifacts");
      const edges = await tx.query<{
        confidence: string;
        id: string;
        provenance: unknown;
        relation: string;
        source_node_id: string;
        target_node_id: string;
      }>(
        "select id, source_node_id, target_node_id, relation, confidence, provenance from public.edges",
      );
      const rationales = await tx.query<{
        artifact_id: string;
        id: string;
        source_line: number;
        source_path: string;
      }>(
        "select id, artifact_id, source_path, source_line from public.rationales",
      );
      const repositories = await tx.query<{
        full_name: string;
        id: string;
        last_scanned_commit_sha: string | null;
      }>(
        "select id, full_name, last_scanned_commit_sha from public.repositories",
      );
      return {
        artifacts: artifacts.rows,
        edges: edges.rows,
        graphNodes: graphNodes.rows,
        rationales: rationales.rows,
        repositories: repositories.rows,
      };
    });

    expect(seenByA.graphNodes.length).toBeGreaterThan(5);
    expect(seenByA.repositories[0]?.last_scanned_commit_sha).toBe(commitSha);

    const model = buildWorkspaceMapModel(workspaceA, {
      ...seenByA,
      accessEvents: [],
      evidence: [],
      findings: [],
      requirements: [],
      tokens: [],
    });
    expect(model.graph.nodes.length).toBe(seenByA.graphNodes.length);
    expect(model.repoFullName).toBe("local/map-demo");
    expect(model.lastScannedCommitSha).toBe(commitSha);
    // A scan alone proves nothing was executed — nothing may render verified.
    expect(model.graph.nodes.every((node) => node.grade === "inferred")).toBe(
      true,
    );

    // The other tenant sees an empty map, not a shared one.
    const seenByB = await asAuthenticatedUser(database, USER_B, (tx) =>
      tx.query("select id from public.graph_nodes"),
    );
    expect(seenByB.rows).toEqual([]);
    expect(workspaceB).not.toBe("");
  });
});
