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
  const REQ_1 = `0${"A".repeat(25)}`;
  const REQ_2 = `0${"B".repeat(25)}`;

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
      repositoryId: repository,
      requirements: [
        requirement(REQ_1, "세션은 만료되어야 한다"),
        requirement(REQ_2, "토큰은 회전되어야 한다"),
      ],
      workspaceId: workspace,
    });
    expect(first).toEqual({ active: 2, superseded: 0 });
    expect(await rows()).toEqual([
      { id: REQ_1, kind: "requirement", statement: "세션은 만료되어야 한다", status: "active" },
      { id: REQ_2, kind: "requirement", statement: "토큰은 회전되어야 한다", status: "active" },
    ]);

    // Same documents again: same ids, nothing duplicated, nothing superseded.
    const again = await store.reconcileRequirements({
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
      repositoryId: repository,
      requirements: [
        requirement(REQ_1, "세션은 만료되어야 한다"),
        requirement(REQ_2, "토큰은 회전되어야 한다"),
      ],
      workspaceId: workspace,
    });
    const dropped = await store.reconcileRequirements({
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
      repositoryId: repository,
      requirements: [
        requirement(REQ_1, "세션은 만료되어야 한다"),
        requirement(REQ_2, "토큰은 회전되어야 한다"),
      ],
      workspaceId: workspace,
    });
    expect(revived).toEqual({ active: 2, superseded: 0 });
    expect((await rows()).every(({ status }) => status === "active")).toBe(true);
  });

  it("refuses a requirement whose source artifact is not in the repository", async () => {
    await expect(
      store.reconcileRequirements({
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
});
