import type postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PostgresAnalysisStore } from "../apps/worker/src/postgres-analysis-store";
import type { PersistedRequirement } from "../apps/worker/src/analysis-job";
import { ALL_MIGRATIONS, createTestDatabase } from "./helpers/database";
import { pgliteSql } from "./helpers/pglite-sql";

/**
 * OQ-023 ⑴ — requirements become graph rows. The real store runs against the
 * real migrations: the requirement node must exist before the row (FK), the
 * row points at its spec artifact (FK), re-analysis converges on the same
 * ids, and a requirement the documents stop stating is superseded — never
 * deleted, so judgments that reference it keep their target.
 */

const OWNER = "76666666-6666-4666-8666-666666666666";
const fixedUlid = (suffix: string) => `01J3000000000000000000000${suffix}`;

function requirement(
  id: string,
  statement: string,
  overrides: Partial<PersistedRequirement> = {},
): PersistedRequirement {
  return {
    id,
    label: statement.slice(0, 80),
    origin: "normative",
    sourceArtifactId: fixedUlid("A"),
    sourceSpan: { endLine: 3, path: "spec/auth.md", startLine: 3 },
    statement,
    ...overrides,
  };
}

describe("requirement persistence (OQ-023 ⑴)", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let store: PostgresAnalysisStore;
  let workspace: string;
  const repository = fixedUlid("B");
  const artifact = fixedUlid("A");
  const code = fixedUlid("C");
  const REQ_1 = `0${"A".repeat(25)}`;
  const REQ_2 = `0${"B".repeat(25)}`;

  function implementsEdge(requirementId: string, targetNodeId = code) {
    return {
      confidence: 0.6,
      provenance: {
        method: "symbol-owner" as const,
        reason:
          "requirement statement names the exported symbol isSessionExpired",
        sourceArtifactId: artifact,
        span: { endLine: 3, path: "spec/auth.md", startLine: 3 },
        symbol: "isSessionExpired",
        tier: "reference" as const,
      },
      requirementId,
      targetNodeId,
    };
  }

  async function implementsRows() {
    const result = await database.query<{
      confidence: string;
      grade: string | null;
      provenance: Record<string, unknown>;
      source_node_id: string;
      target_node_id: string;
    }>(
      `select source_node_id, target_node_id, confidence, provenance,
              provenance ->> 'tier' as grade
       from public.edges
       where workspace_id = $1 and relation = 'implements'
       order by source_node_id, target_node_id`,
      [workspace],
    );
    return result.rows;
  }

  beforeEach(async () => {
    database = await createTestDatabase([...ALL_MIGRATIONS]);
    store = new PostgresAnalysisStore(
      pgliteSql(database) as unknown as postgres.Sql,
    );
    await database.query(
      "insert into auth.users (id, email) values ($1, 'req-owner@example.test')",
      [OWNER],
    );
    const workspaces = await database.query<{ id: string }>(
      "select id from public.workspaces where owner_user_id = $1",
      [OWNER],
    );
    workspace = workspaces.rows[0]?.id ?? "";
    await database.query(
      "insert into public.repositories (id, workspace_id, full_name) values ($1, $2, 'owner/req-repo')",
      [repository, workspace],
    );
    // The scan's artifact node + row, as apply_repository_scan would leave them.
    await database.query(
      `insert into public.graph_nodes (id, workspace_id, repository_id, kind, label)
       values ($1, $2, $3, 'artifact', 'spec/auth.md')`,
      [artifact, workspace, repository],
    );
    await database.query(
      `insert into public.artifacts
        (id, workspace_id, repository_id, kind, classification, path, digest, source_commit_sha)
       values ($1, $2, $3, 'spec', 'spec', 'spec/auth.md', $4, $5)`,
      [artifact, workspace, repository, "c".repeat(64), "3".repeat(40)],
    );
    // The code file the requirement names, as the same scan stored it.
    await database.query(
      `insert into public.graph_nodes (id, workspace_id, repository_id, kind, label)
       values ($1, $2, $3, 'artifact', 'src/session.ts')`,
      [code, workspace, repository],
    );
    await database.query(
      `insert into public.artifacts
        (id, workspace_id, repository_id, kind, classification, path, digest, source_commit_sha)
       values ($1, $2, $3, 'code_metadata', 'code_metadata', 'src/session.ts', $4, $5)`,
      [code, workspace, repository, "d".repeat(64), "3".repeat(40)],
    );
  });

  afterEach(async () => {
    await database.close();
  });

  async function rows() {
    const result = await database.query<{
      id: string;
      kind: string | null;
      statement: string;
      status: string;
    }>(
      `select r.id, r.statement, r.status, n.kind
       from public.requirements r
       left join public.graph_nodes n on n.id = r.id
       where r.workspace_id = $1
       order by r.id`,
      [workspace],
    );
    return result.rows;
  }

  it("upserts node and row together, then converges on re-analysis", async () => {
    const first = await store.reconcileRequirements({
      implementsEdges: [],
      repositoryId: repository,
      requirements: [
        requirement(REQ_1, "세션은 만료되어야 한다"),
        requirement(REQ_2, "토큰은 회전되어야 한다"),
      ],
      workspaceId: workspace,
    });
    expect(first).toEqual({ active: 2, superseded: 0 });
    expect(await rows()).toEqual([
      {
        id: REQ_1,
        kind: "requirement",
        statement: "세션은 만료되어야 한다",
        status: "active",
      },
      {
        id: REQ_2,
        kind: "requirement",
        statement: "토큰은 회전되어야 한다",
        status: "active",
      },
    ]);

    // Same documents again: same ids, nothing duplicated, nothing superseded.
    const again = await store.reconcileRequirements({
      implementsEdges: [],
      repositoryId: repository,
      requirements: [
        requirement(REQ_1, "세션은 만료되어야 한다"),
        requirement(REQ_2, "토큰은 회전되어야 한다"),
      ],
      workspaceId: workspace,
    });
    expect(again).toEqual({ active: 2, superseded: 0 });
    expect((await rows()).length).toBe(2);
    const span = await database.query<{ source_span: Record<string, unknown> }>(
      "select source_span from public.requirements where id = $1",
      [REQ_1],
    );
    expect(span.rows[0]?.source_span).toMatchObject({
      origin: "normative",
      path: "spec/auth.md",
      startLine: 3,
    });
  });

  it("supersedes a requirement the documents no longer state, and revives it if it returns", async () => {
    await store.reconcileRequirements({
      implementsEdges: [],
      repositoryId: repository,
      requirements: [
        requirement(REQ_1, "세션은 만료되어야 한다"),
        requirement(REQ_2, "토큰은 회전되어야 한다"),
      ],
      workspaceId: workspace,
    });
    const dropped = await store.reconcileRequirements({
      implementsEdges: [],
      repositoryId: repository,
      requirements: [requirement(REQ_1, "세션은 만료되어야 한다")],
      workspaceId: workspace,
    });
    expect(dropped).toEqual({ active: 1, superseded: 1 });
    expect((await rows()).map(({ id, status }) => [id, status])).toEqual([
      [REQ_1, "active"],
      [REQ_2, "superseded"],
    ]);

    const revived = await store.reconcileRequirements({
      implementsEdges: [],
      repositoryId: repository,
      requirements: [
        requirement(REQ_1, "세션은 만료되어야 한다"),
        requirement(REQ_2, "토큰은 회전되어야 한다"),
      ],
      workspaceId: workspace,
    });
    expect(revived).toEqual({ active: 2, superseded: 0 });
    expect((await rows()).every(({ status }) => status === "active")).toBe(
      true,
    );
  });

  it("sweeps the requirement node left behind when its source artifact is removed", async () => {
    await store.reconcileRequirements({
      implementsEdges: [],
      repositoryId: repository,
      requirements: [
        requirement(REQ_1, "세션은 만료되어야 한다"),
        requirement(REQ_2, "토큰은 회전되어야 한다"),
      ],
      workspaceId: workspace,
    });
    // apply_repository_scan removing the spec: the artifact node goes, the
    // requirement rows cascade with it — but nothing references the
    // requirement nodes, so they would outlive their rows (seen in production
    // after the fixture exclusion: 99 rows, 113 nodes).
    await database.query("delete from public.graph_nodes where id = $1", [
      artifact,
    ]);
    expect(await rows()).toEqual([]);
    const orphans = () =>
      database.query<{ id: string }>(
        `select id from public.graph_nodes
         where workspace_id = $1 and kind = 'requirement' order by id`,
        [workspace],
      );
    expect((await orphans()).rows.map(({ id }) => id)).toEqual([REQ_1, REQ_2]);

    const swept = await store.reconcileRequirements({
      implementsEdges: [],
      repositoryId: repository,
      requirements: [],
      workspaceId: workspace,
    });
    expect(swept).toMatchObject({ active: 0, superseded: 0 });
    expect((await orphans()).rows).toEqual([]);
  });

  it("refuses a requirement whose source artifact is not in the repository", async () => {
    await expect(
      store.reconcileRequirements({
        implementsEdges: [],
        repositoryId: repository,
        requirements: [
          requirement(REQ_1, "출처 없는 요구사항", {
            sourceArtifactId: fixedUlid("Z"),
          }),
        ],
        workspaceId: workspace,
      }),
    ).rejects.toThrow(/foreign key|violates/);
    expect(await rows()).toEqual([]);
  });

  /**
   * Phase 4 Wave A todo 1 — the `implements` writer.
   *
   * Requirement nodes had no edges at all, so requirement coverage was not a
   * low number but an unmeasurable one (R5 §2.2 D6). These edges are
   * `reference` tier at 0.6: a requirement naming an exported symbol is
   * evidence of intent, never of execution (WORK_SPEC §3-1).
   */
  describe("implements edges", () => {
    it("writes the edge with its requirement, capped at reference tier", async () => {
      await store.reconcileRequirements({
        implementsEdges: [implementsEdge(REQ_1)],
        repositoryId: repository,
        requirements: [requirement(REQ_1, "세션은 만료되어야 한다")],
        workspaceId: workspace,
      });

      const edges = await implementsRows();
      expect(edges).toHaveLength(1);
      expect(edges[0]).toMatchObject({
        grade: "reference",
        source_node_id: REQ_1,
        target_node_id: code,
      });
      expect(Number(edges[0]?.confidence)).toBeLessThanOrEqual(0.6);
      // Provenance is not optional on any edge (WORK_SPEC §3-2).
      expect(edges[0]?.provenance).toMatchObject({
        method: "symbol-owner",
        reason: expect.stringMatching(/\S/),
        sourceArtifactId: artifact,
        span: { path: "spec/auth.md", startLine: 3 },
      });
      // Nothing on this path may produce execution evidence.
      const graded = await database.query<{ count: string }>(
        `select count(*) as count from public.evidence where workspace_id = $1`,
        [workspace],
      );
      expect(Number(graded.rows[0]?.count)).toBe(0);
    });

    it("converges on re-analysis instead of duplicating", async () => {
      for (const pass of [1, 2]) {
        await store.reconcileRequirements({
          implementsEdges: [implementsEdge(REQ_1)],
          repositoryId: repository,
          requirements: [
            requirement(REQ_1, `세션은 만료되어야 한다 (pass ${pass})`),
          ],
          workspaceId: workspace,
        });
      }

      expect(await implementsRows()).toHaveLength(1);
    });

    it("drops a link the analysis no longer derives", async () => {
      await store.reconcileRequirements({
        implementsEdges: [implementsEdge(REQ_1), implementsEdge(REQ_2)],
        repositoryId: repository,
        requirements: [
          requirement(REQ_1, "세션은 만료되어야 한다"),
          requirement(REQ_2, "토큰은 회전되어야 한다"),
        ],
        workspaceId: workspace,
      });
      expect(await implementsRows()).toHaveLength(2);

      // The second requirement stopped naming the symbol: its edge goes,
      // or it would keep counting toward coverage forever.
      await store.reconcileRequirements({
        implementsEdges: [implementsEdge(REQ_1)],
        repositoryId: repository,
        requirements: [
          requirement(REQ_1, "세션은 만료되어야 한다"),
          requirement(REQ_2, "토큰은 회전되어야 한다"),
        ],
        workspaceId: workspace,
      });

      expect(
        (await implementsRows()).map(({ source_node_id }) => source_node_id),
      ).toEqual([REQ_1]);
    });

    it("leaves implements edges that do not come from a requirement", async () => {
      // The concept layer writes `implements` from concept nodes; this
      // reconciliation owns only the requirement-sourced ones.
      const concept = fixedUlid("D");
      await database.query(
        `insert into public.graph_nodes (id, workspace_id, repository_id, kind, label)
         values ($1, $2, $3, 'concept', 'Session expiry')`,
        [concept, workspace, repository],
      );
      await database.query(
        `insert into public.edges
          (workspace_id, repository_id, source_node_id, target_node_id, relation, provenance, confidence)
         values ($1, $2, $3, $4, 'implements', $5::jsonb, 0.5)`,
        [
          workspace,
          repository,
          concept,
          code,
          JSON.stringify({ reason: "concept graph", tier: "inferred" }),
        ],
      );

      await store.reconcileRequirements({
        implementsEdges: [],
        repositoryId: repository,
        requirements: [requirement(REQ_1, "세션은 만료되어야 한다")],
        workspaceId: workspace,
      });

      expect(
        (await implementsRows()).map(({ source_node_id }) => source_node_id),
      ).toEqual([concept]);
    });
  });
});
