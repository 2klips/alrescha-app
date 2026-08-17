import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { edgeSchema } from "../packages/core/src/data/schemas";
import { loadMigrations } from "../scripts/migrate";
import {
  AUTH_TENANCY_MIGRATION,
  EVIDENCE_GRAPH_MIGRATION,
  asAuthenticatedUser,
  createTestDatabase,
} from "./helpers/database";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const fixedUlid = (suffix: string) => `01J0000000000000000000000${suffix}`;
const REPOSITORY_A = fixedUlid("A");
const REPOSITORY_B = fixedUlid("B");
const ARTIFACT_A = fixedUlid("C");
const REQUIREMENT_A = fixedUlid("D");
const EVIDENCE_A = fixedUlid("E");

describe("typed evidence-graph domain and migrations", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let workspaceA: string;
  let workspaceB: string;

  beforeAll(async () => {
    database = await createTestDatabase([
      AUTH_TENANCY_MIGRATION,
      EVIDENCE_GRAPH_MIGRATION,
    ]);
    await database.query(
      "insert into auth.users (id, email) values ($1, 'domain-a@example.test'), ($2, 'domain-b@example.test')",
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

    await database.query(
      `insert into public.github_installations
        (id, workspace_id, github_installation_id, account_id, account_login)
       values ($1, $2, 101, 201, 'owner-a'), ($3, $4, 102, 202, 'owner-b')`,
      [fixedUlid("F"), workspaceA, fixedUlid("G"), workspaceB],
    );
    await database.query(
      `insert into public.repositories
        (id, workspace_id, full_name, installation_id, github_repository_id)
       values ($1, $2, 'owner-a/repo', $3, 301), ($4, $5, 'owner-b/repo', $6, 302)`,
      [
        REPOSITORY_A,
        workspaceA,
        fixedUlid("F"),
        REPOSITORY_B,
        workspaceB,
        fixedUlid("G"),
      ],
    );
    await database.query(
      `insert into public.graph_nodes (id, workspace_id, repository_id, kind, label)
       values ($1, $4, $5, 'artifact', 'spec.md'),
              ($2, $4, $5, 'requirement', 'Receipt required'),
              ($3, $4, $5, 'evidence', 'Implementation evidence')`,
      [ARTIFACT_A, REQUIREMENT_A, EVIDENCE_A, workspaceA, REPOSITORY_A],
    );
    await database.query(
      `insert into public.artifacts
        (id, workspace_id, repository_id, kind, path, digest, source_commit_sha)
       values ($1, $2, $3, 'spec', 'spec.md', $4, $5)`,
      [ARTIFACT_A, workspaceA, REPOSITORY_A, "a".repeat(64), "1".repeat(40)],
    );
    await database.query(
      `insert into public.requirements
        (id, workspace_id, repository_id, source_artifact_id, statement, source_span)
       values ($1, $2, $3, $4, 'Every release has a receipt', $5::jsonb)`,
      [
        REQUIREMENT_A,
        workspaceA,
        REPOSITORY_A,
        ARTIFACT_A,
        JSON.stringify({ endLine: 12, path: "spec.md", startLine: 12 }),
      ],
    );
    await database.query(
      `insert into public.evidence
        (id, workspace_id, repository_id, source_artifact_id, kind, verdict)
       values ($1, $2, $3, $4, 'implementation', 'supports')`,
      [EVIDENCE_A, workspaceA, REPOSITORY_A, ARTIFACT_A],
    );
    await database.query(
      `insert into public.edges
        (id, workspace_id, repository_id, source_node_id, target_node_id, relation, provenance, confidence)
       values ($1, $2, $3, $4, $5, 'implements', $6::jsonb, 0.95)`,
      [
        fixedUlid("H"),
        workspaceA,
        REPOSITORY_A,
        REQUIREMENT_A,
        EVIDENCE_A,
        JSON.stringify({
          sourceArtifactId: ARTIFACT_A,
          span: { endLine: 12, path: "spec.md", startLine: 12 },
        }),
      ],
    );
  });

  afterAll(async () => {
    await database.close();
  });

  it("loads ordered, immutable migration files through the migration runner", async () => {
    const migrations = await loadMigrations();

    expect(migrations.slice(0, 2).map(({ name }) => name)).toEqual([
      "202608100001_auth_tenancy.sql",
      "202608100002_evidence_graph_domain.sql",
    ]);
    expect(migrations.map(({ name }) => name)).toEqual(
      [...migrations.map(({ name }) => name)].sort((left, right) =>
        left.localeCompare(right),
      ),
    );
    expect(
      migrations.every(({ checksum }) => /^[0-9a-f]{64}$/.test(checksum)),
    ).toBe(true);
  });

  it("creates the full tenant-scoped schema with RLS, indexes, and foreign keys", async () => {
    const expectedTables = [
      "access_events",
      "artifacts",
      "credit_ledger",
      "edges",
      "evidence",
      "findings",
      "github_installations",
      "graph_nodes",
      "index_entries",
      "jobs",
      "mcp_tokens",
      "receipts",
      "repositories",
      "requirements",
      "runs",
    ];
    const tables = await database.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_name = any($1::text[])
       order by table_name`,
      [expectedTables],
    );
    const rls = await database.query<{ relname: string }>(
      `select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and relname = any($1::text[]) and relrowsecurity and relforcerowsecurity`,
      [expectedTables],
    );
    const constraints = await database.query<{ conname: string }>(
      `select conname from pg_constraint where conname in
       ('edges_source_node_tenant_fk', 'artifacts_graph_node_tenant_fk', 'access_events_token_tenant_fk')`,
    );
    const indexes = await database.query<{ indexname: string }>(
      `select indexname from pg_indexes where indexname in
       ('edges_workspace_repository_source_idx', 'jobs_claimable_idx', 'findings_open_workspace_repository_idx')`,
    );

    expect(tables.rows.map(({ table_name }) => table_name)).toEqual(
      expectedTables,
    );
    expect(rls.rows).toHaveLength(expectedTables.length);
    expect(constraints.rows).toHaveLength(3);
    expect(indexes.rows).toHaveLength(3);
  });

  it("builds a mini artifact → requirement → evidence graph", async () => {
    const graph = await database.query<{
      relation: string;
      source_kind: string;
      target_kind: string;
    }>(
      `select e.relation, source.kind as source_kind, target.kind as target_kind
       from public.edges e
       join public.graph_nodes source on source.id = e.source_node_id
       join public.graph_nodes target on target.id = e.target_node_id`,
    );

    expect(graph.rows).toEqual([
      {
        relation: "implements",
        source_kind: "requirement",
        target_kind: "evidence",
      },
    ]);
  });

  it("rejects edges without provenance at Zod and SQL layers", async () => {
    const invalidEdge = {
      confidence: 0.8,
      id: fixedUlid("J"),
      relation: "supports",
      repositoryId: REPOSITORY_A,
      sourceNodeId: REQUIREMENT_A,
      targetNodeId: EVIDENCE_A,
      workspaceId: workspaceA,
    };

    expect(edgeSchema.safeParse(invalidEdge).success).toBe(false);
    await expect(
      database.query(
        `insert into public.edges
          (id, workspace_id, repository_id, source_node_id, target_node_id, relation, confidence)
         values ($1, $2, $3, $4, $5, 'supports', 0.8)`,
        [fixedUlid("J"), workspaceA, REPOSITORY_A, REQUIREMENT_A, EVIDENCE_A],
      ),
    ).rejects.toThrow(/null value in column "provenance"/);
  });

  it("rejects cross-tenant graph foreign keys", async () => {
    await expect(
      database.query(
        `insert into public.graph_nodes (id, workspace_id, repository_id, kind, label)
         values ($1, $2, $3, 'artifact', 'cross tenant')`,
        [fixedUlid("K"), workspaceA, REPOSITORY_B],
      ),
    ).rejects.toThrow(/graph_nodes_repository_tenant_fk/);
  });

  it("keeps raw code and prompt text out of persistent domain tables", async () => {
    const forbiddenColumns = await database.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public'
         and ((table_name = 'artifacts' and column_name in ('body', 'content', 'raw_code'))
           or (table_name = 'access_events' and column_name in ('prompt', 'prompt_text')))`,
    );

    expect(forbiddenColumns.rows).toEqual([]);
  });

  it("isolates domain reads through RLS", async () => {
    const userAArtifacts = await asAuthenticatedUser(
      database,
      USER_A,
      (transaction) =>
        transaction.query<{ workspace_id: string }>(
          "select workspace_id from public.artifacts",
        ),
    );

    expect(userAArtifacts.rows).toEqual([{ workspace_id: workspaceA }]);
    expect(
      userAArtifacts.rows.some(
        ({ workspace_id }) => workspace_id === workspaceB,
      ),
    ).toBe(false);
  });
});
