import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { scanRepository } from "../packages/core/src/index";
import { createLocalRepositorySource } from "../packages/cli/src/local-source";
import { graphNodeArea } from "../apps/web/lib/dashboard/graph-model";
import {
  buildWorkspaceMapHud,
  buildWorkspaceMapModel,
  DIRECTORY_LIMIT,
  HUD_RISK_TOP,
  EDGE_FAMILY_LIMITS,
  MAP_HIERARCHY_FOLD_THRESHOLD,
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
    assertions: [],
    coChanges: [],
    concepts: [],
    dbObjects: [],
    directories: [],
    sections: [],
    routes: [],
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
        full_name: "2klips/alrescha-app",
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
      concepts: 0,
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
    // A rationale is a WHY comment lifted out of a code file; typing it as a
    // document put all 86 of this repository's rationale nodes in the docs
    // band with the specs (R5 §2.2 D5, Phase 4 Wave A todo 1).
    expect(byId.get("node-rationale")?.type).toBe("rationale");
    expect(graphNodeArea(byId.get("node-rationale")!)).toBe(
      graphNodeArea(byId.get("node-code")!),
    );
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
    // Span provenance = deterministic extraction → resolved tier (todo 2).
    expect(rationale?.tier).toBe("resolved");

    const supports = byId.get("edge-supports");
    expect(supports?.grade).toBe("verified");
    expect(supports?.tier).toBe("inferred");

    const contradicts = byId.get("edge-contradicts");
    expect(contradicts?.broken).toBe(true);
    expect(contradicts?.grade).toBe("broken");
  });

  it("honors an explicit provenance tier over the derived one", () => {
    const rows = fixtureRows();
    const asserted: MapEdgeRow = {
      confidence: 0.8,
      id: "edge-asserted",
      provenance: { reason: "agent note", tier: "agent_asserted" },
      relation: "references",
      source_node_id: "node-rationale",
      target_node_id: "node-spec",
    };
    const model = buildWorkspaceMapModel(WORKSPACE, {
      ...rows,
      edges: [...rows.edges, asserted],
    });
    expect(
      model.graph.edges.find((edge) => edge.id === "edge-asserted")?.tier,
    ).toBe("agent_asserted");
  });

  it("counts what is stored and lists revoked tokens for the glow policy", () => {
    const model = buildWorkspaceMapModel(WORKSPACE, fixtureRows());
    expect(model.counts).toEqual({
      artifacts: 3,
      concepts: 0,
      edges: 3,
      openFindings: 2,
      rationales: 1,
      requirements: 1,
    });
    expect(model.repoFullName).toBe("2klips/alrescha-app");
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

  /**
   * Phase 4 Wave A todo 3 — what a large graph now does.
   *
   * The old rule collapsed anything past 600 nodes into fifteen
   * `type:grade` super-nodes joined in an arbitrary chain, so the more a
   * repository grew the less its map said (R5 §2.2 D4). Folding is now the
   * client's hierarchy assignment, and the server stops deciding it at 600.
   */
  function seededRows(count: number): WorkspaceMapRows {
    const graphNodes: MapGraphNodeRow[] = Array.from(
      { length: count },
      (_, index) => ({
        id: `node-${index}`,
        kind: "artifact",
        label: `src/file-${index}.ts`,
      }),
    );
    return {
      ...emptyRows(),
      artifacts: graphNodes.map((node) => ({
        classification: "code_metadata",
        id: node.id,
        path: node.label,
      })),
      graphNodes,
    };
  }

  it("keeps every node of a 2,001-node graph, classified and unclustered", () => {
    const model = buildWorkspaceMapModel(WORKSPACE, seededRows(2_001));

    // Nothing is collapsed and nothing is renamed: 2,001 in, 2,001 out.
    expect(model.isClustered).toBe(false);
    expect(model.graph.nodes).toHaveLength(2_001);
    expect(model.graph.nodes.every(({ clusterCount }) => !clusterCount)).toBe(
      true,
    );
    // Every node matched its artifact row, so none fell back to `unknown` —
    // the pagination alignment from todo 1 holds at the read cap.
    expect(model.graph.nodes.filter(({ type }) => type === "unknown")).toEqual(
      [],
    );
    expect(model.graph.nodes.every(({ type }) => type === "code")).toBe(true);
  });

  it("budgets every edge family and the directory hub separately", () => {
    // One shared 6,000-edge cap let whichever family sorted first fill it:
    // containment alone is ~890 edges on this repository and structure
    // ~1,700, so the cap silently decided which half of the graph was read
    // (R5 §2.5, OQ-038). Hubs are worth more per byte than files, so they do
    // not compete with them for the node budget either.
    expect(EDGE_FAMILY_LIMITS).toEqual({
      database: 3_000,
      doc: 6_000,
      evidence: 6_000,
      hierarchy: 6_000,
      route: 1_000,
      semantic: 3_000,
      statistical: 3_000,
      structure: 6_000,
    });
    expect(DIRECTORY_LIMIT).toBe(300);
  });

  it("ships no server-computed coordinates at all", () => {
    const model = buildWorkspaceMapModel(WORKSPACE, seededRows(400));

    // MT-6: the renderer simulates in a Worker and throws these away, so the
    // O(n²) layout the loader used to run was pure time-to-first-byte.
    expect(model.graph.nodes.every(({ x, y }) => x === 0 && y === 0)).toBe(
      true,
    );
  });

  it("reports hierarchy folding only past the fold threshold", () => {
    expect(buildWorkspaceMapModel(WORKSPACE, fixtureRows()).isClustered).toBe(
      false,
    );
    expect(
      buildWorkspaceMapModel(
        WORKSPACE,
        seededRows(MAP_HIERARCHY_FOLD_THRESHOLD),
      ).isClustered,
    ).toBe(false);
    expect(
      buildWorkspaceMapModel(
        WORKSPACE,
        seededRows(MAP_HIERARCHY_FOLD_THRESHOLD + 1),
      ).isClustered,
    ).toBe(true);
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

/**
 * Phase 4 Wave A todo 1 — findings reach code nodes.
 *
 * A finding is raised from a document span, so `source_node_id` is a
 * document for five of the seven rules. The map counted only that anchor,
 * which is why a repository whose risk lives in code showed empty rings
 * however many findings it had (R5 §2.2 D8).
 */
describe("finding anchors on the workspace map", () => {
  function anchoredRows(
    findings: readonly {
      source_node_id: string | null;
      status: string;
      target_node_id?: string | null;
    }[],
  ): WorkspaceMapRows {
    return {
      ...emptyRows(),
      artifacts: [
        { classification: "spec", id: "node-spec", path: "spec/auth.md" },
        {
          classification: "code_metadata",
          id: "node-code",
          path: "src/auth.ts",
        },
      ],
      findings: [...findings],
      graphNodes: [
        { id: "node-spec", kind: "artifact", label: "spec/auth.md" },
        { id: "node-code", kind: "artifact", label: "src/auth.ts" },
      ],
    };
  }

  it("rings the code node a document finding is about", () => {
    const model = buildWorkspaceMapModel(
      WORKSPACE,
      anchoredRows([
        {
          source_node_id: "node-spec",
          status: "open",
          target_node_id: "node-code",
        },
      ]),
    );
    const byId = new Map(model.graph.nodes.map((node) => [node.id, node]));

    expect(byId.get("node-spec")?.findingCount).toBe(1);
    expect(byId.get("node-code")?.findingCount).toBe(1);
    expect(byId.get("node-code")?.grade).toBe("broken");
    // One finding, two anchors — the repository total is still one.
    expect(model.counts.openFindings).toBe(1);
  });

  it("counts a self-anchored finding once", () => {
    // `untested-code` raises on the code file and is about the same file.
    const model = buildWorkspaceMapModel(
      WORKSPACE,
      anchoredRows([
        {
          source_node_id: "node-code",
          status: "open",
          target_node_id: "node-code",
        },
      ]),
    );

    expect(
      model.graph.nodes.find(({ id }) => id === "node-code")?.findingCount,
    ).toBe(1);
  });

  it("ignores anchors of findings that are no longer open", () => {
    const model = buildWorkspaceMapModel(
      WORKSPACE,
      anchoredRows([
        {
          source_node_id: "node-spec",
          status: "resolved",
          target_node_id: "node-code",
        },
      ]),
    );

    expect(
      model.graph.nodes.every(({ findingCount }) => findingCount === 0),
    ).toBe(true);
    expect(model.counts.openFindings).toBe(0);
  });
});

describe("a node whose artifact row did not come back", () => {
  it("is unknown rather than a document", () => {
    // The loader caps `artifacts` and `graph_nodes` at the same limit, so an
    // unordered artifacts page could return a different 2,000 rows than the
    // nodes page; the code nodes it missed silently became documents and
    // swelled the docs band (R4 §3.7). Both queries now share one order —
    // this states what the fallback says when it fires anyway.
    const model = buildWorkspaceMapModel(WORKSPACE, {
      ...emptyRows(),
      graphNodes: [
        { id: "node-orphan", kind: "artifact", label: "src/deep/module.ts" },
      ],
    });
    const [node] = model.graph.nodes;

    expect(node?.type).toBe("unknown");
    expect(graphNodeArea(node!)).not.toBe("docs");
  });
});

describe("implements edges never promote a node to verified", () => {
  it("keeps a linked code file inferred while an evidence source promotes", () => {
    const model = buildWorkspaceMapModel(WORKSPACE, {
      ...emptyRows(),
      artifacts: [
        { classification: "spec", id: "node-spec", path: "spec/auth.md" },
        {
          classification: "code_metadata",
          id: "node-code",
          path: "src/auth.ts",
        },
        {
          classification: "code_metadata",
          id: "node-covered",
          path: "src/session.ts",
        },
        {
          classification: "code_metadata",
          id: "node-test",
          path: "tests/session.test.ts",
        },
      ],
      edges: [
        {
          confidence: 0.6,
          id: "edge-implements",
          provenance: {
            method: "symbol-owner",
            reason: "requirement statement names the exported symbol",
            sourceArtifactId: "node-spec",
            span: { endLine: 3, path: "spec/auth.md", startLine: 3 },
            tier: "reference",
          },
          relation: "implements",
          source_node_id: "node-requirement",
          target_node_id: "node-code",
        },
        {
          confidence: 0.6,
          id: "edge-tests",
          provenance: { reason: "test-import", tier: "reference" },
          relation: "tests",
          source_node_id: "node-test",
          target_node_id: "node-covered",
        },
        {
          confidence: 1,
          id: "edge-ci",
          provenance: { reason: "ci report parsed" },
          relation: "supports",
          source_node_id: "node-evidence",
          target_node_id: "node-requirement",
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
      graphNodes: [
        { id: "node-spec", kind: "artifact", label: "spec/auth.md" },
        { id: "node-code", kind: "artifact", label: "src/auth.ts" },
        { id: "node-covered", kind: "artifact", label: "src/session.ts" },
        { id: "node-test", kind: "artifact", label: "tests/session.test.ts" },
        { id: "node-requirement", kind: "requirement", label: "REQ-AUTH-002" },
        { id: "node-evidence", kind: "evidence", label: "ci: auth suite" },
      ],
      requirements: [
        {
          id: "node-requirement",
          source_artifact_id: "node-spec",
          source_span: { endLine: 3, path: "spec/auth.md", startLine: 3 },
          statement: "토큰은 회전되어야 한다",
        },
      ],
    });
    const byId = new Map(model.graph.nodes.map((node) => [node.id, node]));

    // `implements` and `tests` are in SUPPORTING_RELATIONS, which promotes a
    // target only when the *source* is execution evidence. A requirement and
    // a test file are not (ADR-001, WORK_SPEC §3-1).
    expect(byId.get("node-code")?.grade).toBe("inferred");
    expect(byId.get("node-covered")?.grade).toBe("inferred");
    expect(byId.get("node-spec")?.grade).toBe("inferred");
    // The CI evidence row is the one thing that does promote its target.
    expect(byId.get("node-requirement")?.grade).toBe("verified");
    expect(
      model.graph.nodes.filter(({ grade }) => grade === "verified").length,
    ).toBe(2);
    // Edge grades follow the same rule: only the evidence-sourced edge.
    expect(
      model.graph.edges
        .filter(({ grade }) => grade === "verified")
        .map(({ id }) => id),
    ).toEqual(["edge-ci"]);
    expect(
      model.graph.edges.find(({ id }) => id === "edge-implements")?.tier,
    ).toBe("reference");
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
        family: string;
        id: string;
        provenance: unknown;
        relation: string;
        source_node_id: string;
        target_node_id: string;
      }>(
        "select id, source_node_id, target_node_id, relation, family, confidence, provenance from public.edges",
      );
      const directories = await tx.query<{
        id: string;
        path: string;
        role: string | null;
      }>("select id, path, role from public.directories order by path");
      const routes = await tx.query<{
        id: string;
        methods: string[];
        url: string;
      }>("select id, url, methods from public.routes order by url");
      const dbObjects = await tx.query<{
        id: string;
        kind: string;
        name: string;
        source_line: number;
        source_path: string;
      }>(
        `select id, name, kind, source_path, source_line
         from public.db_objects order by name`,
      );
      const sections = await tx.query<{
        heading: string;
        id: string;
        source_path: string;
        token: string;
      }>(
        `select id, token, heading, source_path
         from public.sections order by token`,
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
        dbObjects: dbObjects.rows,
        directories: directories.rows,
        sections: sections.rows,
        edges: edges.rows,
        routes: routes.rows,
        graphNodes: graphNodes.rows,
        rationales: rationales.rows,
        repositories: repositories.rows,
      };
    });

    expect(seenByA.graphNodes.length).toBeGreaterThan(5);
    expect(seenByA.repositories[0]?.last_scanned_commit_sha).toBe(commitSha);
    // The scan SQL derived the hierarchy from the paths it stored — the plan
    // never mentions a directory (Wave A todo 3, ADR-013).
    expect(seenByA.directories.map(({ path }) => path)).toContain("src");
    expect(
      seenByA.edges.filter(({ family }) => family === "hierarchy").length,
    ).toBeGreaterThan(0);

    // `drifted-demo` ships no SQL, so the owner's own `db_objects` read is
    // empty — and reaching it at all is what proves the new table's grants
    // and RLS policy exist for `authenticated` (Wave A′ todo 7).
    expect(seenByA.dbObjects).toEqual([]);
    // Its ADRs do declare ID-token headings, so the owner's `sections` read
    // proves the grant *and* returns rows (Wave A′ todo 8).
    expect(seenByA.sections.map(({ token }) => token)).toEqual([
      "ADR-001",
      "ADR-002",
    ]);

    const model = buildWorkspaceMapModel(workspaceA, {
      ...seenByA,
      accessEvents: [],
      assertions: [],
      coChanges: [],
      concepts: [],
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
    // A folder sits in the band of what it holds, and its containment edges
    // are layout input rather than lines to draw (OQ-037).
    const sourceDirectory = model.graph.nodes.find(
      ({ path, type }) => type === "directory" && path === "src",
    );
    const sourceFile = model.graph.nodes.find(
      ({ path }) => path === "src/audit.ts",
    );
    expect(sourceDirectory).toBeDefined();
    expect(sourceFile).toBeDefined();
    expect(graphNodeArea(sourceDirectory!)).toBe(graphNodeArea(sourceFile!));
    expect(graphNodeArea(sourceDirectory!)).toBe("backend");
    const containment = model.graph.edges.filter(
      ({ family }) => family === "hierarchy",
    );
    expect(containment.length).toBeGreaterThan(0);
    expect(containment.every(({ layoutOnly }) => layoutOnly === true)).toBe(
      true,
    );
    expect(
      model.graph.edges
        .filter(({ family }) => family !== "hierarchy")
        .every(({ layoutOnly }) => layoutOnly === undefined),
    ).toBe(true);

    // The other tenant sees an empty map, not a shared one.
    const seenByB = await asAuthenticatedUser(database, USER_B, (tx) =>
      tx.query("select id from public.graph_nodes"),
    );
    expect(seenByB.rows).toEqual([]);
    expect(workspaceB).not.toBe("");
  });
});

/**
 * Phase 4 Wave B todo 15 — the HUD chips from stored rows. What the browser
 * spec asserts against the screen is computed by this same builder from the
 * rows it seeded, so these pin the rules the chips stand on.
 */
describe("buildWorkspaceMapHud", () => {
  const NOW = Date.parse("2026-09-13T12:00:00.000Z");
  const repositories = [
    {
      created_at: "2026-09-13T10:00:00.000Z",
      full_name: "local/hud",
      id: "repo-hud",
      last_scanned_commit_sha: "b".repeat(40),
      selected_at: null,
    },
  ];
  const requirements = [
    {
      id: "req-1",
      source_artifact_id: "doc-1",
      source_span: null,
      statement: "A",
      status: "active",
    },
    {
      id: "req-2",
      source_artifact_id: "doc-1",
      source_span: null,
      statement: "B",
      status: "active",
    },
    {
      id: "req-old",
      source_artifact_id: "doc-1",
      source_span: null,
      statement: "C",
      status: "superseded",
    },
  ];

  it("counts open findings only", () => {
    const hud = buildWorkspaceMapHud(
      {
        findings: [
          { source_node_id: "n1", status: "open" },
          { source_node_id: "n2", status: "open" },
          { source_node_id: "n3", status: "resolved" },
          { source_node_id: "n4", status: "dismissed" },
        ],
        repositories: [],
        requirements: [],
      },
      NOW,
    );
    expect(hud.openFindings).toBe(2);
  });

  it("keeps the coverage basis three-way: no requirements ≠ no links ≠ measured", () => {
    const base = { findings: [], repositories: [], requirements: [] };
    expect(buildWorkspaceMapHud(base, NOW).coverage).toEqual({
      basis: "no-data",
      covered: 0,
      percent: null,
      total: 0,
    });
    expect(
      buildWorkspaceMapHud({ ...base, implementsEdges: [], requirements }, NOW)
        .coverage,
    ).toEqual({ basis: "no-links", covered: 0, percent: null, total: 2 });
    // Two edges from the same requirement count once; an edge from a
    // superseded requirement is not coverage of the active set.
    expect(
      buildWorkspaceMapHud(
        {
          ...base,
          implementsEdges: [
            { source_node_id: "req-1" },
            { source_node_id: "req-1" },
            { source_node_id: "req-old" },
          ],
          requirements,
        },
        NOW,
      ).coverage,
    ).toEqual({ basis: "measured", covered: 1, percent: 50, total: 2 });
  });

  it("reports the current commit and the age of its own completion", () => {
    const hud = buildWorkspaceMapHud(
      {
        findings: [],
        repositories,
        requirements: [],
        scanCompletions: [
          // A newer completion of a different commit must not lend its
          // time to the commit the header names.
          {
            commit_sha: "c".repeat(40),
            completed_at: "2026-09-13T11:59:00.000Z",
          },
          {
            commit_sha: "b".repeat(40),
            completed_at: "2026-09-13T11:30:00.000Z",
          },
          {
            commit_sha: "b".repeat(40),
            completed_at: "2026-09-13T09:00:00.000Z",
          },
        ],
      },
      NOW,
    );
    expect(hud.lastScan).toEqual({
      ageMinutes: 30,
      commitSha: "b".repeat(40),
      completedAt: "2026-09-13T11:30:00.000Z",
    });
  });

  it("says the age is unknown rather than guessing when no completion matches", () => {
    const hud = buildWorkspaceMapHud(
      {
        findings: [],
        repositories,
        requirements: [],
        scanCompletions: [
          {
            commit_sha: "c".repeat(40),
            completed_at: "2026-09-13T11:59:00.000Z",
          },
        ],
      },
      NOW,
    );
    expect(hud.lastScan).toEqual({
      ageMinutes: null,
      commitSha: "b".repeat(40),
      completedAt: null,
    });
    expect(
      buildWorkspaceMapHud(
        { findings: [], repositories: [], requirements: [] },
        NOW,
      ).lastScan,
    ).toEqual({ ageMinutes: null, commitSha: null, completedAt: null });
  });

  it("takes the top of the risk map in its own order and names unmeasured signals", () => {
    const entry = (
      path: string,
      score: number,
      level: "elevated" | "high" | "moderate",
    ) => ({
      factors: [{ detail: "x", kind: "fan-in" as const, weight: score }],
      grade: "inferred" as const,
      level,
      nodeId: `node-${path}`,
      path,
      score,
    });
    const hud = buildWorkspaceMapHud(
      {
        findings: [],
        repositories: [],
        requirements: [],
        riskMap: {
          entries: [
            entry("a.ts", 0.9, "high"),
            entry("b.ts", 0.7, "elevated"),
            entry("c.ts", 0.5, "moderate"),
            entry("d.ts", 0.2, "moderate"),
          ],
          unmeasured: [{ reason: "no coverage report", signal: "coverage" }],
        },
      },
      NOW,
    );
    expect(hud.risk).toEqual({
      ranked: 4,
      top: [
        { level: "high", nodeId: "node-a.ts", path: "a.ts", score: 0.9 },
        { level: "elevated", nodeId: "node-b.ts", path: "b.ts", score: 0.7 },
        { level: "moderate", nodeId: "node-c.ts", path: "c.ts", score: 0.5 },
      ],
      unmeasured: ["coverage"],
    });
    expect(HUD_RISK_TOP).toBe(3);
    // No risk map computed is null, not an empty list — the chip says so.
    expect(
      buildWorkspaceMapHud(
        { findings: [], repositories: [], requirements: [] },
        NOW,
      ).risk,
    ).toBeNull();
  });
});
