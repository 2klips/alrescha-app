import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ALL_MIGRATIONS,
  asServiceRole,
  createTestDatabase,
} from "./helpers/database";

/**
 * Phase 3 Wave C todo 7 — the concept graph at the database.
 *
 * `apply_concept_graph` must converge (same slug → same node across runs),
 * replace the whole concept layer (vanished concepts leave), and discard —
 * never guess — anything outside the closed vocabulary or the known graph.
 * `enqueue_enrich_job` must see a stale concept layer as pending work and a
 * fresh one as nothing to do.
 */

const USER_A = "91111111-1111-4111-8111-111111111111";
const COMMIT = "a".repeat(40);

function planArtifact(path: string, blobSha: string) {
  return {
    classification: "code_metadata",
    digest: blobSha.repeat(2).slice(0, 64),
    exportedSymbols: [],
    kind: "code_metadata",
    path,
    rationales: [],
    sizeBytes: 64,
    sourceBlobSha: blobSha,
    sourceCommitSha: COMMIT,
    symbolEngine: null,
    todoItems: [],
  };
}

describe("concept graph (Wave C todo 7)", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let workspaceId: string;
  let repositoryId: string;

  beforeEach(async () => {
    database = await createTestDatabase([...ALL_MIGRATIONS]);
    await database.query(
      "insert into auth.users (id, email) values ($1, 'concepts@example.test')",
      [USER_A],
    );
    const workspaces = await database.query<{ id: string }>(
      "select id from public.workspaces",
    );
    workspaceId = workspaces.rows[0]?.id ?? "";
    const repository = await database.query<{ id: string }>(
      "select public.ensure_local_repository($1, 'local/concepts') as id",
      [workspaceId],
    );
    repositoryId = repository.rows[0]?.id ?? "";
    await database.query(
      "select public.apply_repository_scan($1, $2, $3::jsonb)",
      [
        workspaceId,
        repositoryId,
        JSON.stringify({
          artifacts: [
            planArtifact("src/login.ts", "1".repeat(40)),
            planArtifact("src/session.ts", "2".repeat(40)),
          ],
          codeLinks: [],
          commitSha: COMMIT,
          removedPaths: [],
          skipped: [],
          touchedRows: 2,
          treeSha: "b".repeat(40),
          unchangedPaths: [],
        }),
      ],
    );
  });

  afterEach(async () => {
    await database.close();
  });

  async function applyConcepts(
    items: readonly unknown[],
    digest = "d1",
  ): Promise<void> {
    await database.query(
      "select public.apply_concept_graph($1, $2, $3::jsonb, $4)",
      [workspaceId, repositoryId, JSON.stringify(items), digest],
    );
  }

  function authFlow(overrides: Record<string, unknown> = {}) {
    return {
      kind: "concept",
      links: [
        { relation: "uses", target: { path: "src/session.ts" } },
        { relation: "part_of", target: { slug: "platform" } },
      ],
      memberPaths: ["src/login.ts"],
      name: "Auth Flow",
      slug: "auth-flow",
      summary: "Login to session, in prose.",
      ...overrides,
    };
  }

  const platform = {
    kind: "system",
    links: [],
    memberPaths: ["src/session.ts"],
    name: "Platform",
    slug: "platform",
    summary: "The runtime everything runs on.",
  };

  it("upserts by slug — the same input converges on the same node", async () => {
    await applyConcepts([authFlow(), platform]);
    const first = await asServiceRole(database, (tx) =>
      tx.query<{ id: string; slug: string }>(
        "select id, slug from public.concepts order by slug",
      ),
    );
    expect(first.rows.map(({ slug }) => slug)).toEqual([
      "auth-flow",
      "platform",
    ]);

    await applyConcepts(
      [authFlow({ summary: "Refined prose." }), platform],
      "d2",
    );
    const second = await asServiceRole(database, (tx) =>
      tx.query<{ id: string; slug: string; source_digest: string }>(
        "select id, slug, source_digest from public.concepts order by slug",
      ),
    );
    // Same rows, updated in place — no duplicates, digest moved.
    expect(second.rows.map(({ id }) => id)).toEqual(
      first.rows.map(({ id }) => id),
    );
    expect(second.rows[0]?.source_digest).toBe("d2");

    const nodes = await asServiceRole(database, (tx) =>
      tx.query<{ count: number }>(
        "select count(*)::integer as count from public.graph_nodes where kind = 'concept'",
      ),
    );
    expect(nodes.rows[0]?.count).toBe(2);
  });

  it("links resolve to files and forward-declared concepts with inferred provenance", async () => {
    await applyConcepts([authFlow(), platform]);
    const edges = await asServiceRole(database, (tx) =>
      tx.query<{ provenance: { tier?: string }; relation: string }>(
        `select relation, provenance from public.edges
         where relation in ('uses', 'part_of') order by relation`,
      ),
    );
    expect(edges.rows.map(({ relation }) => relation)).toEqual([
      "part_of",
      "uses",
    ]);
    for (const edge of edges.rows) {
      expect(edge.provenance.tier).toBe("inferred");
    }
  });

  it("discards out-of-vocabulary verbs and unknown targets instead of guessing", async () => {
    await applyConcepts([
      authFlow({
        links: [
          { relation: "relates_to", target: { path: "src/session.ts" } },
          { relation: "uses", target: { path: "src/ghost.ts" } },
        ],
      }),
    ]);
    const edges = await asServiceRole(database, (tx) =>
      tx.query(
        "select 1 from public.edges where source_node_id in (select id from public.concepts)",
      ),
    );
    expect(edges.rows).toHaveLength(0);
  });

  it("replaces the layer: vanished concepts leave with their edges", async () => {
    await applyConcepts([authFlow(), platform]);
    await applyConcepts([platform], "d2");
    const remaining = await asServiceRole(database, (tx) =>
      tx.query<{ slug: string }>("select slug from public.concepts"),
    );
    expect(remaining.rows.map(({ slug }) => slug)).toEqual(["platform"]);
    const conceptNodes = await asServiceRole(database, (tx) =>
      tx.query<{ count: number }>(
        "select count(*)::integer as count from public.graph_nodes where kind = 'concept'",
      ),
    );
    expect(conceptNodes.rows[0]?.count).toBe(1);
  });

  it("enqueue sees a stale concept layer as pending work, a fresh one as none", async () => {
    // Cache every summary so the summary side is quiet.
    await database.query(
      "select public.apply_artifact_summaries($1, $2, $3::jsonb)",
      [
        workspaceId,
        repositoryId,
        JSON.stringify([
          {
            kind: "summary",
            model: "m",
            path: "src/login.ts",
            provider: "anthropic",
            summary: "Login prose.",
            summaryBlobSha: "1".repeat(40),
          },
          {
            kind: "summary",
            model: "m",
            path: "src/session.ts",
            provider: "anthropic",
            summary: "Session prose.",
            summaryBlobSha: "2".repeat(40),
          },
        ]),
      ],
    );

    // No concepts yet → the layer is stale → a job exists.
    const stale = await database.query<{ id: string | null }>(
      "select public.enqueue_enrich_job($1, $2, 'anthropic', 'credits') as id",
      [workspaceId, repositoryId],
    );
    expect(stale.rows[0]?.id).not.toBeNull();

    // Store the layer under the exact digest formula the enqueue uses.
    const digestRow = await asServiceRole(database, (tx) =>
      tx.query<{ digest: string }>(
        `select md5(string_agg(path || ':' || (metadata->>'summaryBlobSha'), E'\n' order by path collate "C")) as digest
         from public.artifacts
         where workspace_id = $1 and repository_id = $2
           and (metadata->>'summaryBlobSha') = source_blob_sha`,
        [workspaceId, repositoryId],
      ),
    );
    await applyConcepts([platform], digestRow.rows[0]?.digest ?? "");

    const fresh = await database.query<{ id: string | null }>(
      "select public.enqueue_enrich_job($1, $2, 'anthropic', 'credits') as id",
      [workspaceId, repositoryId],
    );
    expect(fresh.rows[0]?.id).toBeNull();
  });
});
