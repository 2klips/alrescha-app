import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  parseQueryReferences,
  parseSchemaFile,
  resolveSchemaLinks,
  scanRepository,
} from "../packages/core/src/index";
import { createLocalRepositorySource } from "../packages/cli/src/local-source";
import { ALL_MIGRATIONS, createTestDatabase } from "./helpers/database";
import { githubShapedPlan } from "./helpers/github-shaped-plan";

/**
 * Database objects (Phase 4 Wave A′ todo 7).
 *
 * A repository's tables are a hub it already has: every migration declares
 * them, every alter touches them, and the code that reads them names them in
 * a string. Two tiers, the same honesty as the code resolver: the SQL that
 * says `create table x` is `resolved`, and `.from("x")` is `reference` —
 * a string that matches a table name is not proof the call reaches it.
 */

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const NEXT_FASTAPI = resolve(repoRoot, "fixtures/layout-variants/next-fastapi");
const USER = "71000000-0000-4000-8000-000000000001";
const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);

describe("schema file parsing", () => {
  it("reads the objects a migration declares and the statements about them", () => {
    const { links, objects } = parseSchemaFile({
      path: "supabase/migrations/0001_init.sql",
      source: [
        "create table public.workspaces (",
        "  id text primary key",
        ");",
        "",
        'create table if not exists "repositories" (',
        "  id text primary key,",
        "  workspace_id text not null references public.workspaces(id)",
        ");",
        "",
        "create or replace view active_repositories as",
        "  select * from repositories;",
        "",
        "create or replace function public.touch_repository() returns void",
        "language sql as $$ select 1 $$;",
        "",
        "alter table public.repositories add column layout_config jsonb;",
      ].join("\n"),
    });

    // Schema qualification and quoting are not identity: `public."x"` and
    // `x` are the same object, so the name is stored bare and lower-cased.
    expect(objects).toEqual([
      {
        kind: "table",
        name: "workspaces",
        sourcePath: "supabase/migrations/0001_init.sql",
        span: { endLine: 1, startLine: 1 },
      },
      {
        kind: "table",
        name: "repositories",
        sourcePath: "supabase/migrations/0001_init.sql",
        span: { endLine: 5, startLine: 5 },
      },
      {
        kind: "view",
        name: "active_repositories",
        sourcePath: "supabase/migrations/0001_init.sql",
        span: { endLine: 10, startLine: 10 },
      },
      {
        kind: "function",
        name: "touch_repository",
        sourcePath: "supabase/migrations/0001_init.sql",
        span: { endLine: 13, startLine: 13 },
      },
    ]);

    expect(
      links.map(({ kind, targetObject }) => `${kind} ${targetObject}`),
    ).toEqual([
      "defines workspaces",
      "defines repositories",
      // The foreign key belongs to whichever table was last opened above
      // it — that is what a migration looks like, and a parser that tried
      // to be cleverer would need a SQL grammar the scan has no reason to
      // carry (ADR-014).
      "references workspaces",
      "defines active_repositories",
      "defines touch_repository",
      "modifies repositories",
    ]);
    const foreignKey = links.find(({ kind }) => kind === "references");
    expect(foreignKey).toEqual({
      kind: "references",
      method: "sql-structural",
      sourceObject: "repositories",
      sourcePath: "supabase/migrations/0001_init.sql",
      span: { endLine: 7, startLine: 7 },
      targetObject: "workspaces",
      tier: "resolved",
    });
  });

  it("does not point a table at itself", () => {
    const { links } = parseSchemaFile({
      path: "db/tree.sql",
      source: [
        "create table nodes (",
        "  id text primary key,",
        "  parent_id text references nodes(id)",
        ");",
      ].join("\n"),
    });
    expect(links.map(({ kind }) => kind)).toEqual(["defines"]);
  });

  it("declares an object once even when a migration re-creates it", () => {
    const { objects } = parseSchemaFile({
      path: "db/two.sql",
      source: [
        "create or replace function public.f() returns void as $$ $$;",
        "create or replace function public.f() returns int as $$ $$;",
      ].join("\n"),
    });
    expect(objects).toHaveLength(1);
  });
});

describe("query literals in code", () => {
  it("reads the five conventions that put the name in the call", () => {
    const references = parseQueryReferences(
      [
        'const { data } = await client.from("todos").select("*");',
        "await client.rpc('apply_repository_scan', payload);",
        "class Session(Base):",
        '    __tablename__ = "sessions"',
        'users = Table("users", metadata)',
        "const rows = await prisma.repositories.findMany();",
      ].join("\n"),
    );
    expect(references).toEqual([
      { line: 1, name: "todos" },
      { line: 2, name: "apply_repository_scan" },
      { line: 4, name: "sessions" },
      { line: 5, name: "users" },
      { line: 6, name: "repositories" },
    ]);
  });

  /**
   * The documented blind spot. A name built at run time exists only while
   * the program runs, and the scan reads text — so it is not detected and
   * cannot be. Asserting the absence keeps a future "clever" heuristic from
   * quietly inventing a `queries` edge from a variable name.
   */
  it("does not detect a table name the code computes", () => {
    expect(
      parseQueryReferences(
        [
          "await client.from(tableName).select();",
          "await client.from(`${schema}.${table}`).select();",
          'await client.from(TABLES["todos"]).select();',
        ].join("\n"),
      ),
    ).toEqual([]);
  });
});

describe("link resolution", () => {
  const objects = [
    {
      kind: "table" as const,
      name: "todos",
      sourcePath: "db/schema.sql",
      span: { endLine: 1, startLine: 1 },
    },
  ];

  it("keeps only the objects this repository owns", () => {
    const resolved = resolveSchemaLinks({
      objects,
      queries: new Map([
        [
          "app/page.tsx",
          [
            { line: 4, name: "todos" },
            // Someone else's table: the graph says nothing rather than
            // inventing a node for a table it has never seen.
            { line: 9, name: "stripe_customers" },
          ],
        ],
      ]),
      schemaLinks: [
        {
          kind: "references" as const,
          method: "sql-structural" as const,
          sourceObject: "todos",
          sourcePath: "db/schema.sql",
          span: { endLine: 3, startLine: 3 },
          targetObject: "auth_users",
          tier: "resolved" as const,
        },
      ],
    });

    expect(resolved).toEqual([
      {
        kind: "queries",
        method: "table-literal",
        sourceObject: null,
        sourcePath: "app/page.tsx",
        span: { endLine: 4, startLine: 4 },
        targetObject: "todos",
        tier: "reference",
      },
    ]);
  });

  it("emits one edge per file and table, not one per call site", () => {
    const resolved = resolveSchemaLinks({
      objects,
      queries: new Map([
        [
          "lib/store.ts",
          [
            { line: 4, name: "todos" },
            { line: 40, name: "todos" },
            { line: 90, name: "todos" },
          ],
        ],
      ]),
      schemaLinks: [],
    });
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.span).toEqual({ endLine: 4, startLine: 4 });
  });
});

describe("database objects over the three-tier fixture", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let workspaceId: string;
  let repositoryId: string;

  beforeEach(async () => {
    database = await createTestDatabase([...ALL_MIGRATIONS]);
    await database.query(
      "insert into auth.users (id, email) values ($1, 'schema@example.test')",
      [USER],
    );
    const workspaces = await database.query<{ id: string }>(
      "select id from public.workspaces",
    );
    workspaceId = workspaces.rows[0]?.id ?? "";
    const repository = await database.query<{ id: string }>(
      "select public.ensure_local_repository($1, 'local/schema') as id",
      [workspaceId],
    );
    repositoryId = repository.rows[0]?.id ?? "";
  });

  afterEach(async () => {
    await database.close();
  });

  async function apply(plan: unknown): Promise<void> {
    await database.query(
      "select public.apply_repository_scan($1, $2, $3::jsonb)",
      [workspaceId, repositoryId, JSON.stringify(plan)],
    );
  }

  async function dbObjects(): Promise<
    { kind: string; name: string; source_line: number; source_path: string }[]
  > {
    const rows = await database.query<{
      kind: string;
      name: string;
      source_line: number;
      source_path: string;
    }>(
      `select name, kind, source_path, source_line from public.db_objects
       where workspace_id = $1 order by name`,
      [workspaceId],
    );
    return rows.rows;
  }

  async function schemaEdges(): Promise<string[]> {
    const rows = await database.query<{ line: string }>(
      `select
         coalesce(source_artifact.path, source_object.name)
           || ' -' || e.relation || '-> ' || target_object.name as line
       from public.edges e
       join public.db_objects target_object
         on target_object.id = e.target_node_id
       left join public.artifacts source_artifact
         on source_artifact.id = e.source_node_id
       left join public.db_objects source_object
         on source_object.id = e.source_node_id
       where e.workspace_id = $1 and e.family = 'database'
       order by line`,
      [workspaceId],
    );
    return rows.rows.map(({ line }) => line);
  }

  function artifact(path: string, classification: string) {
    return {
      classification,
      digest: path.length.toString(16).padStart(2, "0").repeat(32),
      exportedSymbols: [],
      kind: classification,
      path,
      rationales: [],
      sizeBytes: 64,
      sourceBlobSha: SHA_A,
      sourceCommitSha: SHA_A,
      symbolEngine: null,
      todoItems: [],
    };
  }

  it("stores the fixture's two tables and the migrations that declare them", async () => {
    const { commitSha, source } =
      await createLocalRepositorySource(NEXT_FASTAPI);
    const plan = await scanRepository({ commitSha, source });

    expect(plan.schemaObjects).toEqual([
      {
        kind: "table",
        name: "sessions",
        sourcePath: "db/migrations/0001_init.sql",
        span: { endLine: 2, startLine: 2 },
      },
      {
        kind: "table",
        name: "users",
        sourcePath: "db/schema.sql",
        span: { endLine: 2, startLine: 2 },
      },
    ]);
    // The fixture's TypeScript names no table in a literal, so there is no
    // `queries` edge to invent — an honest empty, not a missing feature.
    expect(plan.schemaLinks.filter(({ kind }) => kind === "queries")).toEqual(
      [],
    );

    await apply(plan);

    expect(await dbObjects()).toEqual([
      {
        kind: "table",
        name: "sessions",
        source_line: 2,
        source_path: "db/migrations/0001_init.sql",
      },
      {
        kind: "table",
        name: "users",
        source_line: 2,
        source_path: "db/schema.sql",
      },
    ]);
    expect(await schemaEdges()).toEqual([
      "db/migrations/0001_init.sql -defines-> sessions",
      "db/schema.sql -defines-> users",
    ]);
  });

  it("links a query literal at the reference tier and a foreign key at resolved", async () => {
    await apply({
      artifacts: [
        artifact("db/schema.sql", "schema"),
        artifact("lib/store.ts", "code_metadata"),
      ],
      codeLinks: [],
      commitSha: SHA_A,
      docLinks: [],
      removedPaths: [],
      routes: [],
      schemaLinks: [
        {
          kind: "defines",
          method: "sql-structural",
          sourceObject: null,
          sourcePath: "db/schema.sql",
          span: { endLine: 1, startLine: 1 },
          targetObject: "workspaces",
          tier: "resolved",
        },
        {
          kind: "defines",
          method: "sql-structural",
          sourceObject: null,
          sourcePath: "db/schema.sql",
          span: { endLine: 8, startLine: 8 },
          targetObject: "todos",
          tier: "resolved",
        },
        {
          kind: "references",
          method: "sql-structural",
          sourceObject: "todos",
          sourcePath: "db/schema.sql",
          span: { endLine: 11, startLine: 11 },
          targetObject: "workspaces",
          tier: "resolved",
        },
        {
          kind: "queries",
          method: "table-literal",
          sourceObject: null,
          sourcePath: "lib/store.ts",
          span: { endLine: 22, startLine: 22 },
          targetObject: "todos",
          tier: "reference",
        },
      ],
      schemaObjects: [
        {
          kind: "table",
          name: "workspaces",
          sourcePath: "db/schema.sql",
          span: { endLine: 1, startLine: 1 },
        },
        {
          kind: "table",
          name: "todos",
          sourcePath: "db/schema.sql",
          span: { endLine: 8, startLine: 8 },
        },
      ],
      skipped: [],
      touchedRows: 2,
      treeSha: SHA_B,
      unchangedPaths: [],
    });

    expect(await schemaEdges()).toEqual([
      "db/schema.sql -defines-> todos",
      "db/schema.sql -defines-> workspaces",
      "lib/store.ts -queries-> todos",
      "todos -references-> workspaces",
    ]);

    const graded = await database.query<{
      confidence: string;
      family: string;
      relation: string;
      span_path: string;
      tier: string;
    }>(
      `select
         e.relation, e.family, e.confidence::text as confidence,
         e.provenance->>'tier' as tier,
         e.provenance->'span'->>'path' as span_path
       from public.edges e
       where e.workspace_id = $1 and e.family = 'database'
       order by e.relation`,
      [workspaceId],
    );
    expect(graded.rows).toEqual([
      {
        confidence: "1.000",
        family: "database",
        relation: "defines",
        span_path: "db/schema.sql",
        tier: "resolved",
      },
      {
        confidence: "1.000",
        family: "database",
        relation: "defines",
        span_path: "db/schema.sql",
        tier: "resolved",
      },
      // A name match is not proof the call reaches that table.
      {
        confidence: "0.600",
        family: "database",
        relation: "queries",
        span_path: "lib/store.ts",
        tier: "reference",
      },
      // A foreign key departs from an object, not from a document, so
      // `derive_edge_family` files `references` under `database` rather than
      // under `doc` — schema, not prose.
      {
        confidence: "1.000",
        family: "database",
        relation: "references",
        span_path: "db/schema.sql",
        tier: "resolved",
      },
    ]);
  });

  it("sweeps an object a full relink no longer declares, and keeps one it never re-read", async () => {
    const base = {
      artifacts: [
        artifact("db/a.sql", "schema"),
        artifact("db/b.sql", "schema"),
      ],
      codeLinks: [],
      commitSha: SHA_A,
      docLinks: [],
      removedPaths: [],
      routes: [],
      schemaLinks: [
        {
          kind: "defines",
          method: "sql-structural",
          sourceObject: null,
          sourcePath: "db/a.sql",
          span: { endLine: 1, startLine: 1 },
          targetObject: "alpha",
          tier: "resolved",
        },
        {
          kind: "defines",
          method: "sql-structural",
          sourceObject: null,
          sourcePath: "db/b.sql",
          span: { endLine: 1, startLine: 1 },
          targetObject: "beta",
          tier: "resolved",
        },
      ],
      schemaObjects: [
        {
          kind: "table",
          name: "alpha",
          sourcePath: "db/a.sql",
          span: { endLine: 1, startLine: 1 },
        },
        {
          kind: "table",
          name: "beta",
          sourcePath: "db/b.sql",
          span: { endLine: 1, startLine: 1 },
        },
      ],
      skipped: [],
      touchedRows: 2,
      treeSha: SHA_B,
      unchangedPaths: [],
    };
    await apply({ ...base, linkScope: "full" });
    expect((await dbObjects()).map(({ name }) => name)).toEqual([
      "alpha",
      "beta",
    ]);

    // An incremental plan speaks only for `db/a.sql`. `beta` lives in a file
    // this scan never opened, so it survives — the sweep that deleted it
    // would empty the schema layer on every single-file push.
    await apply({
      ...base,
      artifacts: [artifact("db/a.sql", "schema")],
      linkScope: "incremental",
      schemaLinks: [],
      schemaObjects: [],
      unchangedPaths: ["db/b.sql"],
    });
    expect((await dbObjects()).map(({ name }) => name)).toEqual(["beta"]);

    // A full relink speaks for every file, so a name no plan states is gone
    // along with its graph node.
    await apply({
      ...base,
      linkScope: "full",
      schemaLinks: [],
      schemaObjects: [],
    });
    expect(await dbObjects()).toEqual([]);
    const nodes = await database.query<{ count: string }>(
      `select count(*)::text as count from public.graph_nodes
       where workspace_id = $1 and kind = 'db_object'`,
      [workspaceId],
    );
    expect(nodes.rows[0]?.count).toBe("0");
  });

  it("gives the CLI path and the GitHub path the same schema layer", async () => {
    const { commitSha, source } =
      await createLocalRepositorySource(NEXT_FASTAPI);
    const localPlan = await scanRepository({ commitSha, source });
    const githubPlan = await githubShapedPlan(NEXT_FASTAPI, commitSha);

    // Equality has to be about something: unlike directories and routes, an
    // object's name is in the file *body*, so it travels in the plan and the
    // two transports have to read it identically (ADR-013).
    expect(localPlan.schemaObjects.length).toBeGreaterThan(0);
    expect(localPlan.schemaObjects).toEqual(githubPlan.schemaObjects);
    expect(localPlan.schemaLinks).toEqual(githubPlan.schemaLinks);
  });
});
