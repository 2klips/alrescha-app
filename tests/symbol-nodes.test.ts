import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  scanRepository,
  symbolStableKey,
  type RepositoryScanPlan,
} from "../packages/core/src/index";
import { createLocalRepositorySource } from "../packages/cli/src/local-source";
import { buildLocalWorkspace } from "../packages/mcp/src/index";
import {
  ALL_MIGRATIONS,
  asAuthenticatedUser,
  createTestDatabase,
} from "./helpers/database";

/**
 * Symbol nodes behind hierarchical loading (Phase 4 Wave F todo 26).
 *
 * The scan has read exported symbols since Phase 1 and stored them as a
 * JSON list on the file. This is what turning them into nodes has to keep
 * true: every exported symbol gets exactly one row and one node, identified
 * by where it is declared and what it is called; `declares` is one edge per
 * symbol from its file; `extends` is resolved to the exported symbol it
 * names — through a barrel, through a namespace import, in the same file,
 * and through a Python `from` import — and never to something that has no
 * node. And the layer stays out of the base graph: no row in `edges`, no
 * symbol id in a neighbour cache.
 */

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const FIXTURE = resolve(repoRoot, "fixtures/symbol-heritage");
const USER = "7a000000-0000-4000-8000-000000000026";

interface SymbolRow {
  artifact_id: string;
  container: string | null;
  end_line: number;
  engine: string | null;
  id: string;
  kind: string;
  name: string;
  path: string;
  stable_key: string;
  start_line: number;
}

interface SymbolEdgeRow {
  confidence: string;
  family: string;
  provenance: { method?: string; span?: { path?: string }; tier?: string };
  relation: string;
  source: string;
  target: string;
}

const symbolLabel = (path: string, name: string): string => `${path}#${name}`;

describe("symbol nodes", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let workspaceId: string;
  let repositoryId: string;
  let plan: RepositoryScanPlan;

  beforeEach(async () => {
    database = await createTestDatabase([...ALL_MIGRATIONS]);
    await database.query(
      "insert into auth.users (id, email) values ($1, 'symbols@example.test')",
      [USER],
    );
    const workspaces = await database.query<{ id: string }>(
      "select id from public.workspaces",
    );
    workspaceId = workspaces.rows[0]?.id ?? "";
    const repository = await database.query<{ id: string }>(
      "select public.ensure_local_repository($1, $2) as id",
      [workspaceId, "local/symbol-heritage"],
    );
    repositoryId = repository.rows[0]?.id ?? "";
    const { commitSha, source } = await createLocalRepositorySource(FIXTURE);
    plan = await scanRepository({ commitSha, mode: "full", source });
  });

  afterEach(async () => {
    await database.close();
  });

  async function apply(input: RepositoryScanPlan): Promise<void> {
    await database.query(
      "select public.apply_repository_scan($1, $2, $3::jsonb)",
      [workspaceId, repositoryId, JSON.stringify(input)],
    );
  }

  async function symbolRows(): Promise<SymbolRow[]> {
    const rows = await database.query<SymbolRow>(
      `select id, artifact_id, path, container, kind, name, start_line, end_line,
              engine, stable_key
       from public.symbols where workspace_id = $1
       order by path, start_line, name`,
      [workspaceId],
    );
    return rows.rows;
  }

  /** Every symbol edge, with both ends named the way a reader would. */
  async function symbolEdges(): Promise<SymbolEdgeRow[]> {
    const rows = await database.query<SymbolEdgeRow>(
      `select e.relation, e.family, e.confidence, e.provenance,
              coalesce(source_file.path, source_symbol.path || '#' || source_symbol.name) as source,
              target_symbol.path || '#' || target_symbol.name as target
       from public.symbol_edges e
       left join public.artifacts source_file on source_file.id = e.source_node_id
       left join public.symbols source_symbol on source_symbol.id = e.source_node_id
       join public.symbols target_symbol on target_symbol.id = e.target_node_id
       where e.workspace_id = $1
       order by e.relation, 5, 6`,
      [workspaceId],
    );
    return rows.rows;
  }

  async function symbolNodeCount(): Promise<number> {
    const rows = await database.query<{ count: string }>(
      "select count(*) as count from public.graph_nodes where workspace_id = $1 and kind = 'symbol'",
      [workspaceId],
    );
    return Number(rows.rows[0]?.count ?? 0);
  }

  it("resolves `extends` to exported symbols through a barrel, a namespace import, the same file and a Python import", () => {
    const links = plan.symbolLinks.map(
      (link) =>
        `${symbolLabel(link.sourcePath, link.sourceName)} -> ${symbolLabel(link.targetPath, link.targetName)} [${link.method}/${link.tier}]`,
    );
    expect(links).toEqual(
      [
        // `from app.models import Model, User` — structural, so `reference`.
        "app/services.py#Admin -> app/models.py#User [module-resolution/reference]",
        "app/services.py#Service -> app/models.py#Model [module-resolution/reference]",
        // `class User(Model)` in the file that declares `Model`.
        "app/models.py#User -> app/models.py#Model [local-declaration/reference]",
        // `import { Base } from "./index"` walks the barrel to `base.ts`.
        "src/derived.ts#Derived -> src/base.ts#Base [barrel-resolution/resolved]",
        // `interface Circle extends Shape, base.Named`: the `export *` walk and
        // a member of the namespace binding.
        "src/derived.ts#Circle -> src/base.ts#Named [module-resolution/resolved]",
        "src/derived.ts#Circle -> src/base.ts#Shape [barrel-resolution/resolved]",
        "src/derived.ts#Local -> src/derived.ts#Derived [local-declaration/resolved]",
        "src/derived.ts#Twice -> src/base.ts#Base [barrel-resolution/resolved]",
      ].sort(),
    );
    // `implements Shape` is not `extends`, and a base that is not exported
    // (`FromHidden extends Hidden`) has no node to point at.
    expect(links.some((link) => link.includes("FromHidden"))).toBe(false);
  });

  it("stores one row and one node per exported symbol, keyed the way TypeScript keys it", async () => {
    await apply(plan);
    const rows = await symbolRows();

    const expected = plan.artifacts.flatMap((artifact) =>
      artifact.exportedSymbols.map(({ name }) =>
        symbolLabel(artifact.path, name),
      ),
    );
    expect(rows.map((row) => symbolLabel(row.path, row.name)).sort()).toEqual(
      [...new Set(expected)].sort(),
    );
    expect(rows).toHaveLength(16);
    expect(await symbolNodeCount()).toBe(rows.length);

    // The SQL and the TypeScript compute the same identity — this is the
    // equivalence the local projection stands on.
    for (const row of rows) {
      expect(row.stable_key).toBe(
        symbolStableKey({
          container: row.container,
          kind: row.kind,
          name: row.name,
          path: row.path,
        }),
      );
      expect(row.container).toBeNull();
      expect(row.end_line).toBeGreaterThanOrEqual(row.start_line);
    }
    // The engine travels with the row (ADR-014): the AST for TypeScript,
    // the structural reader for Python.
    expect(
      rows.find((row) => row.path === "src/base.ts" && row.name === "Base")
        ?.engine,
    ).toBe("typescript-ast");
    expect(
      rows.find((row) => row.path === "app/models.py" && row.name === "User")
        ?.engine,
    ).toBe("python-structural");
    // A symbol node is labelled by its name, and it is a `symbol`.
    const labels = await database.query<{ label: string }>(
      "select label from public.graph_nodes where workspace_id = $1 and kind = 'symbol' and id = $2",
      [workspaceId, rows.find((row) => row.name === "Derived")?.id ?? ""],
    );
    expect(labels.rows[0]?.label).toBe("Derived");
  });

  it("derives one `declares` per symbol and the resolved `extends`, with provenance", async () => {
    await apply(plan);
    const edges = await symbolEdges();

    const declares = edges.filter((edge) => edge.relation === "declares");
    expect(declares).toHaveLength(16);
    for (const edge of declares) {
      expect(edge.family).toBe("hierarchy");
      expect(Number(edge.confidence)).toBe(1);
      expect(edge.provenance.tier).toBe("resolved");
      expect(edge.provenance.span?.path).toBe(edge.source);
      expect(edge.target.startsWith(`${edge.source}#`)).toBe(true);
    }

    const extendsEdges = edges
      .filter((edge) => edge.relation === "extends")
      .map(
        (edge) =>
          `${edge.source} -> ${edge.target} [${edge.family}/${edge.provenance.tier}/${edge.confidence}]`,
      );
    expect(extendsEdges).toEqual([
      "app/models.py#User -> app/models.py#Model [structure/reference/0.600]",
      "app/services.py#Admin -> app/models.py#User [structure/reference/0.600]",
      "app/services.py#Service -> app/models.py#Model [structure/reference/0.600]",
      "src/derived.ts#Circle -> src/base.ts#Named [structure/resolved/1.000]",
      "src/derived.ts#Circle -> src/base.ts#Shape [structure/resolved/1.000]",
      "src/derived.ts#Derived -> src/base.ts#Base [structure/resolved/1.000]",
      "src/derived.ts#Local -> src/derived.ts#Derived [structure/resolved/1.000]",
      "src/derived.ts#Twice -> src/base.ts#Base [structure/resolved/1.000]",
    ]);
  });

  it("keeps the layer out of the base graph", async () => {
    await apply(plan);
    const inEdges = await database.query<{ count: string }>(
      "select count(*) as count from public.edges where workspace_id = $1 and relation in ('declares', 'extends')",
      [workspaceId],
    );
    expect(Number(inEdges.rows[0]?.count)).toBe(0);

    const symbolIds = new Set((await symbolRows()).map((row) => row.id));
    const neighbours = await database.query<{ neighbor_ids: string[] }>(
      "select neighbor_ids from public.index_entries where workspace_id = $1",
      [workspaceId],
    );
    for (const row of neighbours.rows) {
      expect(row.neighbor_ids.some((id) => symbolIds.has(id))).toBe(false);
    }
  });

  it("keeps node ids across a rescan and drops the symbol a file no longer exports", async () => {
    await apply(plan);
    const before = await symbolRows();
    const idByLabel = new Map(
      before.map((row) => [symbolLabel(row.path, row.name), row.id]),
    );

    // The same commit again: nothing is re-minted.
    await apply(plan);
    const again = await symbolRows();
    expect(again.map((row) => row.id).sort()).toEqual(
      before.map((row) => row.id).sort(),
    );
    expect(await symbolNodeCount()).toBe(16);

    // An incremental pass that re-reads `derived.ts` without `Twice`: its row,
    // node and `extends` go; every other symbol keeps its id.
    const derived = plan.artifacts.find(
      (artifact) => artifact.path === "src/derived.ts",
    );
    if (!derived) throw new Error("fixture lost src/derived.ts");
    await apply({
      ...plan,
      artifacts: [
        {
          ...derived,
          exportedSymbols: derived.exportedSymbols.filter(
            ({ name }) => name !== "Twice",
          ),
        },
      ],
      codeLinks: [],
      docLinks: [],
      linkScope: "incremental",
      removedPaths: [],
      sectionLinks: [],
      sections: [],
      symbolLinks: plan.symbolLinks.filter(
        (link) =>
          link.sourcePath === "src/derived.ts" && link.sourceName !== "Twice",
      ),
    });
    const after = await symbolRows();
    expect(after.map((row) => symbolLabel(row.path, row.name))).not.toContain(
      "src/derived.ts#Twice",
    );
    expect(after).toHaveLength(15);
    expect(await symbolNodeCount()).toBe(15);
    for (const row of after) {
      expect(row.id).toBe(idByLabel.get(symbolLabel(row.path, row.name)));
    }
    const edges = await symbolEdges();
    expect(edges.some((edge) => edge.source === "src/derived.ts#Twice")).toBe(
      false,
    );
    expect(edges.filter((edge) => edge.relation === "extends")).toHaveLength(7);
    expect(edges.filter((edge) => edge.relation === "declares")).toHaveLength(
      15,
    );
  });

  it("removes a deleted file's symbols and their nodes, leaving no orphan", async () => {
    await apply(plan);
    await apply({
      ...plan,
      artifacts: [],
      codeLinks: [],
      docLinks: [],
      linkScope: "incremental",
      removedPaths: ["src/derived.ts"],
      sectionLinks: [],
      sections: [],
      symbolLinks: [],
    });
    const rows = await symbolRows();
    expect(rows.some((row) => row.path === "src/derived.ts")).toBe(false);
    expect(rows).toHaveLength(11);
    expect(await symbolNodeCount()).toBe(11);
    const orphans = await database.query<{ count: string }>(
      `select count(*) as count from public.graph_nodes n
       where n.workspace_id = $1 and n.kind = 'symbol'
         and not exists (select 1 from public.symbols s where s.id = n.id)`,
      [workspaceId],
    );
    expect(Number(orphans.rows[0]?.count)).toBe(0);
    // The edges into the removed symbols went with them; the base file's
    // own symbols and their `declares` did not.
    const edges = await symbolEdges();
    expect(edges.some((edge) => edge.source.startsWith("src/derived.ts"))).toBe(
      false,
    );
    expect(edges.filter((edge) => edge.relation === "declares")).toHaveLength(
      11,
    );
  });

  it("holds a name, a kind, a span and an engine — and no column that could hold a body", async () => {
    const columns = await database.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'symbols'
       order by column_name`,
    );
    expect(columns.rows.map((row) => row.column_name)).toEqual([
      "artifact_id",
      "container",
      "created_at",
      "end_column",
      "end_line",
      "engine",
      "id",
      "kind",
      "name",
      "path",
      "repository_id",
      "stable_key",
      "start_column",
      "start_line",
      "updated_at",
      "workspace_id",
    ]);
  });

  it("projects the same layer locally as the SQL derives, `extends` included", async () => {
    await apply(plan);
    const repository = buildLocalWorkspace({
      plan,
      repositoryFullName: "local/symbol-heritage",
    }).repositories[0];
    if (!repository) throw new Error("the projection produced no repository");

    const rows = await symbolRows();
    expect(
      (repository.symbols ?? [])
        .map((symbol) => `${symbol.path}#${symbol.name}:${symbol.stableKey}`)
        .sort(),
    ).toEqual(
      rows.map((row) => `${row.path}#${row.name}:${row.stable_key}`).sort(),
    );

    const labelOf = new Map<string, string>();
    for (const symbol of repository.symbols ?? []) {
      labelOf.set(symbol.nodeId, symbolLabel(symbol.path, symbol.name));
      labelOf.set(symbol.artifactNodeId, symbol.path);
    }
    const local = (repository.symbolEdges ?? [])
      .map(
        (edge) =>
          `${edge.relation} ${labelOf.get(edge.sourceNodeId) ?? edge.sourceNodeId} -> ${labelOf.get(edge.targetNodeId) ?? edge.targetNodeId} [${edge.family}/${edge.tier}/${edge.confidence === null ? "null" : edge.confidence.toFixed(3)}]`,
      )
      .sort();
    const stored = (await symbolEdges())
      .map(
        (edge) =>
          `${edge.relation} ${edge.source} -> ${edge.target} [${edge.family}/${edge.provenance.tier}/${edge.confidence}]`,
      )
      .sort();
    expect(local).toEqual(stored);
    expect(local.filter((line) => line.startsWith("extends "))).toHaveLength(8);
  });

  it("is visible to the workspace owner through row security and to nobody else", async () => {
    await apply(plan);
    const OTHER = "7b000000-0000-4000-8000-000000000026";
    await database.query(
      "insert into auth.users (id, email) values ($1, 'other@example.test')",
      [OTHER],
    );

    // The map's `/api/map/symbols` reads these two tables as the signed-in
    // member; the policies, not the route, are what keep a tenant's layer
    // its own.
    const mine = await asAuthenticatedUser(database, USER, async (tx) => ({
      edges: await tx.query<{ id: string }>(
        "select id from public.symbol_edges",
      ),
      symbols: await tx.query<{ id: string }>("select id from public.symbols"),
    }));
    expect(mine.symbols.rows).toHaveLength(16);
    expect(mine.edges.rows).toHaveLength(24);

    const theirs = await asAuthenticatedUser(database, OTHER, async (tx) => ({
      edges: await tx.query<{ id: string }>(
        "select id from public.symbol_edges",
      ),
      symbols: await tx.query<{ id: string }>("select id from public.symbols"),
    }));
    expect(theirs.symbols.rows).toEqual([]);
    expect(theirs.edges.rows).toEqual([]);
  });
});
