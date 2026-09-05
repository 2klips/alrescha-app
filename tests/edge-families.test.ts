import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ALL_MIGRATIONS,
  NOTES_AND_EDGE_FAMILIES_MIGRATION,
  asServiceRole,
  createTestDatabase,
} from "./helpers/database";

/**
 * Edge families (Phase 4 Wave A todo 2, R5 §2.5).
 *
 * Read limits, force strengths, draw policy and MCP defaults are decided per
 * family, so `family` has to be right for every edge in the table — including
 * the ones written before the column existed and the ones written by code
 * that has never heard of it. Two mechanisms carry that: writers that know
 * state it outright, and a trigger derives it for everyone else from the
 * relation and the source node's kind.
 */

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const USER = "7d000000-0000-4000-8000-00000000000d";
const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);

/** A ULID the `graph_nodes_id_ulid` check accepts, keyed by a short suffix. */
function nodeId(suffix: string): string {
  return `01K3RQ${"0".repeat(26 - 6 - suffix.length)}${suffix}`;
}

function planArtifact(path: string, classification: string, kind: string) {
  return {
    classification,
    digest: `${path.length.toString(16).padStart(2, "0")}`.repeat(32),
    exportedSymbols: [],
    kind,
    path,
    rationales: [],
    sizeBytes: 64,
    sourceBlobSha: SHA_A,
    sourceCommitSha: SHA_A,
    symbolEngine: null,
    todoItems: [],
  };
}

function planDocLink(
  sourcePath: string,
  targetPath: string,
  tier = "resolved",
) {
  return {
    kind: "references",
    method: tier === "resolved" ? "path-exists" : "basename-owner",
    sourcePath,
    span: { endLine: 3, startLine: 3 },
    targetPath,
    tier,
  };
}

describe("edge families", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let workspaceId: string;
  let repositoryId: string;

  beforeEach(async () => {
    database = await createTestDatabase([...ALL_MIGRATIONS]);
    await database.query(
      "insert into auth.users (id, email) values ($1, 'families@example.test')",
      [USER],
    );
    const workspaces = await database.query<{ id: string }>(
      "select id from public.workspaces",
    );
    workspaceId = workspaces.rows[0]?.id ?? "";
    const repository = await database.query<{ id: string }>(
      "select public.ensure_local_repository($1, 'local/families') as id",
      [workspaceId],
    );
    repositoryId = repository.rows[0]?.id ?? "";
  });

  afterEach(async () => {
    await database.close();
  });

  async function apply(plan: Record<string, unknown>): Promise<void> {
    await database.query(
      "select public.apply_repository_scan($1, $2, $3::jsonb)",
      [
        workspaceId,
        repositoryId,
        JSON.stringify({
          artifacts: [],
          codeLinks: [],
          docLinks: [],
          removedPaths: [],
          skipped: [],
          touchedRows: 1,
          treeSha: SHA_B,
          unchangedPaths: [],
          ...plan,
        }),
      ],
    );
  }

  async function edges(): Promise<
    { family: string; relation: string; source: string; target: string }[]
  > {
    const rows = await asServiceRole(database, (tx) =>
      tx.query<{
        family: string;
        relation: string;
        source_path: string;
        target_path: string;
      }>(
        `select e.relation, e.family,
                coalesce(source_artifact.path, source_node.kind) as source_path,
                coalesce(target_artifact.path, target_node.kind) as target_path
         from public.edges e
         join public.graph_nodes source_node on source_node.id = e.source_node_id
         join public.graph_nodes target_node on target_node.id = e.target_node_id
         left join public.artifacts source_artifact on source_artifact.id = e.source_node_id
         left join public.artifacts target_artifact on target_artifact.id = e.target_node_id
         order by source_path, target_path, e.relation`,
      ),
    );
    return rows.rows.map((row) => ({
      family: row.family,
      relation: row.relation,
      source: row.source_path,
      target: row.target_path,
    }));
  }

  it("files a document's references under doc and a rationale's under structure", async () => {
    await apply({
      artifacts: [
        {
          ...planArtifact("spec/WORK_SPEC.md", "spec", "spec"),
          rationales: [
            {
              adrRef: null,
              kind: "why",
              line: 4,
              sourceKey: "rationale:src/session.ts:4",
              text: "sessions are server-owned",
            },
          ],
        },
        planArtifact("src/session.ts", "code_metadata", "code_metadata"),
      ],
      commitSha: SHA_A,
      docLinks: [planDocLink("spec/WORK_SPEC.md", "src/session.ts")],
    });

    // Same relation, two families: a document pointing at code is
    // documentation, a WHY comment pointing at its own file is structure.
    expect(await edges()).toEqual([
      {
        family: "structure",
        relation: "references",
        source: "rationale",
        target: "spec/WORK_SPEC.md",
      },
      {
        family: "doc",
        relation: "references",
        source: "spec/WORK_SPEC.md",
        target: "src/session.ts",
      },
    ]);
  });

  it("replaces a rescanned document's links and leaves the others alone", async () => {
    await apply({
      artifacts: [
        planArtifact("spec/a.md", "spec", "spec"),
        planArtifact("spec/b.md", "spec", "spec"),
        planArtifact("src/one.ts", "code_metadata", "code_metadata"),
        planArtifact("src/two.ts", "code_metadata", "code_metadata"),
      ],
      commitSha: SHA_A,
      docLinks: [
        planDocLink("spec/a.md", "src/one.ts"),
        planDocLink("spec/b.md", "src/two.ts"),
      ],
    });
    expect((await edges()).length).toBe(2);

    // `spec/a.md` changed and now points elsewhere; `spec/b.md` did not.
    await apply({
      artifacts: [
        {
          ...planArtifact("spec/a.md", "spec", "spec"),
          digest: "1".repeat(64),
        },
      ],
      commitSha: SHA_B,
      docLinks: [planDocLink("spec/a.md", "src/two.ts", "reference")],
      unchangedPaths: ["spec/b.md", "src/one.ts", "src/two.ts"],
    });

    expect(await edges()).toEqual([
      {
        family: "doc",
        relation: "references",
        source: "spec/a.md",
        target: "src/two.ts",
      },
      {
        family: "doc",
        relation: "references",
        source: "spec/b.md",
        target: "src/two.ts",
      },
    ]);
  });

  it("drops every document link a full relink no longer derives", async () => {
    await apply({
      artifacts: [
        planArtifact("spec/a.md", "spec", "spec"),
        planArtifact("src/one.ts", "code_metadata", "code_metadata"),
      ],
      commitSha: SHA_A,
      docLinks: [planDocLink("spec/a.md", "src/one.ts")],
    });

    await apply({
      artifacts: [],
      commitSha: SHA_A,
      docLinks: [],
      linkScope: "full",
      linkSchemaVersion: 3,
      unchangedPaths: ["spec/a.md", "src/one.ts"],
    });

    // A full relink speaks for every document, so a link it does not restate
    // is gone — the same rule the code links follow (R5 §2.2 D2).
    expect(await edges()).toEqual([]);
  });

  it("derives the family for a writer that does not set one", async () => {
    await apply({
      artifacts: [
        planArtifact("spec/a.md", "spec", "spec"),
        planArtifact("src/one.ts", "code_metadata", "code_metadata"),
      ],
      commitSha: SHA_A,
    });
    const artifacts = await database.query<{ id: string; path: string }>(
      "select id, path from public.artifacts order by path",
    );
    const specId = artifacts.rows.find(({ path }) => path === "spec/a.md")?.id;
    const codeId = artifacts.rows.find(({ path }) => path === "src/one.ts")?.id;

    const nodes: [string, string, string][] = [
      [nodeId("C"), "concept", "Session expiry"],
      [nodeId("R"), "requirement", "REQ-1"],
    ];
    for (const [id, kind, label] of nodes) {
      await database.query(
        `insert into public.graph_nodes (id, workspace_id, repository_id, kind, label)
         values ($1, $2, $3, $4, $5)`,
        [id, workspaceId, repositoryId, kind, label],
      );
    }

    // Three writers, none of them naming a family.
    const written: [string, string, string][] = [
      [nodeId("C"), codeId ?? "", "implements"],
      [nodeId("R"), codeId ?? "", "implements"],
      [specId ?? "", codeId ?? "", "references"],
    ];
    for (const [source, target, relation] of written) {
      await database.query(
        `insert into public.edges
          (workspace_id, repository_id, source_node_id, target_node_id, relation, provenance, confidence)
         values ($1, $2, $3, $4, $5, '{"reason":"test"}'::jsonb, 0.5)`,
        [workspaceId, repositoryId, source, target, relation],
      );
    }

    const rows = await database.query<{ family: string; kind: string }>(
      `select e.family, n.kind
       from public.edges e
       join public.graph_nodes n on n.id = e.source_node_id
       order by n.kind`,
    );
    // The concept layer's `implements` is synthesis; a requirement's is
    // assurance; a document's `references` is documentation.
    expect(rows.rows).toEqual([
      { family: "doc", kind: "artifact" },
      { family: "semantic", kind: "concept" },
      { family: "evidence", kind: "requirement" },
    ]);
  });

  it("backfills the rows that existed before the column did", async () => {
    // Run the repository up to the migration before this one, write the four
    // edge shapes production actually holds, then migrate.
    const earlier = ALL_MIGRATIONS.filter(
      (migration) => migration !== NOTES_AND_EDGE_FAMILIES_MIGRATION,
    );
    const older = await createTestDatabase([...earlier]);
    try {
      await older.query(
        "insert into auth.users (id, email) values ($1, 'backfill@example.test')",
        [USER],
      );
      const workspaces = await older.query<{ id: string }>(
        "select id from public.workspaces",
      );
      const workspace = workspaces.rows[0]?.id ?? "";
      const repository = await older.query<{ id: string }>(
        "select public.ensure_local_repository($1, 'local/backfill') as id",
        [workspace],
      );
      const repositoryIdBefore = repository.rows[0]?.id ?? "";

      const seeded: [string, string, string][] = [
        [nodeId("A1"), "artifact", "spec/a.md"],
        [nodeId("A2"), "artifact", "src/one.ts"],
        [nodeId("RA"), "rationale", "WHY: server-owned"],
        [nodeId("CN"), "concept", "Session expiry"],
        [nodeId("RQ"), "requirement", "REQ-1"],
      ];
      for (const [id, kind, label] of seeded) {
        await older.query(
          `insert into public.graph_nodes (id, workspace_id, repository_id, kind, label)
           values ($1, $2, $3, $4, $5)`,
          [id, workspace, repositoryIdBefore, kind, label],
        );
      }
      const before: [string, string, string][] = [
        [nodeId("A1"), nodeId("A2"), "imports"],
        [nodeId("A1"), nodeId("A2"), "references"],
        [nodeId("RA"), nodeId("A2"), "references"],
        [nodeId("CN"), nodeId("A2"), "implements"],
        [nodeId("RQ"), nodeId("A2"), "implements"],
        [nodeId("A2"), nodeId("A1"), "tests"],
      ];
      for (const [source, target, relation] of before) {
        await older.query(
          `insert into public.edges
            (workspace_id, repository_id, source_node_id, target_node_id, relation, provenance, confidence)
           values ($1, $2, $3, $4, $5, '{"reason":"legacy"}'::jsonb, 1.0)`,
          [workspace, repositoryIdBefore, source, target, relation],
        );
      }

      await older.exec(
        await readFile(
          resolve(repoRoot, NOTES_AND_EDGE_FAMILIES_MIGRATION),
          "utf8",
        ),
      );

      const rows = await older.query<{
        family: string;
        kind: string;
        relation: string;
      }>(
        `select e.relation, e.family, n.kind
         from public.edges e
         join public.graph_nodes n on n.id = e.source_node_id
         order by n.kind, e.relation`,
      );
      expect(rows.rows).toEqual([
        { family: "structure", kind: "artifact", relation: "imports" },
        { family: "doc", kind: "artifact", relation: "references" },
        { family: "evidence", kind: "artifact", relation: "tests" },
        { family: "semantic", kind: "concept", relation: "implements" },
        { family: "structure", kind: "rationale", relation: "references" },
        { family: "evidence", kind: "requirement", relation: "implements" },
      ]);
      // Nothing is left unfiled, and the column says so structurally.
      const nulls = await older.query<{ count: string }>(
        "select count(*) as count from public.edges where family is null",
      );
      expect(Number(nulls.rows[0]?.count)).toBe(0);
    } finally {
      await older.close();
    }
  });

  it("refuses a family outside the vocabulary", async () => {
    await apply({
      artifacts: [
        planArtifact("spec/a.md", "spec", "spec"),
        planArtifact("src/one.ts", "code_metadata", "code_metadata"),
      ],
      commitSha: SHA_A,
    });
    const artifacts = await database.query<{ id: string; path: string }>(
      "select id, path from public.artifacts order by path",
    );

    await expect(
      database.query(
        `insert into public.edges
          (workspace_id, repository_id, source_node_id, target_node_id, relation, family, provenance, confidence)
         values ($1, $2, $3, $4, 'references', 'galaxy', '{"reason":"test"}'::jsonb, 1.0)`,
        [
          workspaceId,
          repositoryId,
          artifacts.rows[0]?.id,
          artifacts.rows[1]?.id,
        ],
      ),
    ).rejects.toThrow(/edges_family/);
  });
});
