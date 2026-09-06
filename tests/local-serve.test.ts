import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { scanRepository } from "../packages/core/src/index";
import { createLocalRepositorySource } from "../packages/cli/src/local-source";
import {
  MCP_EDGE_RELATIONS,
  buildLocalWorkspace,
  edgeOmissionReason,
} from "../packages/mcp/src/index";
import { ALL_MIGRATIONS, createTestDatabase } from "./helpers/database";

/**
 * `alrescha serve --local` (Phase 4 Wave C todo 17, OQ-030 ⑴).
 *
 * A local-ingest repository gets a graph on the server and never gets an
 * analysis: the worker's source factory needs a GitHub installation. Sending
 * bodies to the server to fix that would break hard rule ③, so the reading
 * moves to the machine that already holds them.
 *
 * The risk in that move is a **second implementation**: the server turns a
 * scan plan into nodes and edges in ~800 lines of SQL, and the local path
 * has to produce the same graph in TypeScript. This repository has already
 * had to repair four hand-copied vocabularies that fell behind, so the
 * projection is not trusted — it is compared, on real PostgreSQL, against
 * the SQL that is still the authority, for both layout fixtures.
 */

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const FIXTURES = [
  ["drifted-demo", resolve(repoRoot, "fixtures/drifted-demo")],
  ["next-fastapi", resolve(repoRoot, "fixtures/layout-variants/next-fastapi")],
] as const;
const USER = "78000000-0000-4000-8000-000000000001";

/** The edge as both readers deliver it, keyed by what names the nodes. */
interface EdgeKey {
  readonly family: string | null;
  readonly relation: string;
  readonly source: string;
  readonly target: string;
  readonly tier: string | null;
}

function sortedEdges(edges: readonly EdgeKey[]): string[] {
  return edges
    .map(
      (edge) =>
        `${edge.relation} ${edge.source} -> ${edge.target} [${edge.family ?? "-"}/${edge.tier ?? "-"}]`,
    )
    .sort();
}

const isVocabulary = (relation: string): boolean =>
  (MCP_EDGE_RELATIONS as readonly string[]).includes(relation);

describe("serving a local repository", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let workspaceId: string;

  beforeEach(async () => {
    database = await createTestDatabase([...ALL_MIGRATIONS]);
    await database.query(
      "insert into auth.users (id, email) values ($1, 'serve@example.test')",
      [USER],
    );
    const workspaces = await database.query<{ id: string }>(
      "select id from public.workspaces",
    );
    workspaceId = workspaces.rows[0]?.id ?? "";
  });

  afterEach(async () => {
    await database.close();
  });

  /**
   * Every node the SQL wrote, addressed the way the projection addresses it.
   * A rationale's label is its text, so its identity comes from the row that
   * states it rather than from the label.
   */
  async function nodeNames(): Promise<Map<string, string>> {
    const nodes = await database.query<{
      id: string;
      kind: string;
      label: string;
    }>(
      "select id, kind, label from public.graph_nodes where workspace_id = $1",
      [workspaceId],
    );
    const rationales = await database.query<{
      id: string;
      source_key: string;
    }>("select id, source_key from public.rationales where workspace_id = $1", [
      workspaceId,
    ]);
    const bySourceKey = new Map(
      rationales.rows.map((row) => [row.id, row.source_key]),
    );
    return new Map(
      nodes.rows.map((row) => [
        row.id,
        row.kind === "rationale"
          ? `rationale:${bySourceKey.get(row.id) ?? row.id}`
          : `${row.kind}:${row.label}`,
      ]),
    );
  }

  async function storedEdges(names: ReadonlyMap<string, string>) {
    const rows = await database.query<{
      family: string | null;
      provenance: { tier?: string } | null;
      relation: string;
      source_node_id: string;
      target_node_id: string;
    }>(
      `select relation, family, provenance, source_node_id, target_node_id
       from public.edges where workspace_id = $1`,
      [workspaceId],
    );
    return rows.rows.map((row) => ({
      family: row.family,
      relation: row.relation,
      source: names.get(row.source_node_id) ?? row.source_node_id,
      target: names.get(row.target_node_id) ?? row.target_node_id,
      tier: row.provenance?.tier ?? null,
    }));
  }

  async function applyPlan(fixture: string, fullName: string) {
    const repository = await database.query<{ id: string }>(
      "select public.ensure_local_repository($1, $2) as id",
      [workspaceId, fullName],
    );
    const { commitSha, source } = await createLocalRepositorySource(fixture);
    const plan = await scanRepository({ commitSha, mode: "full", source });
    await database.query(
      "select public.apply_repository_scan($1, $2, $3::jsonb)",
      [workspaceId, repository.rows[0]?.id ?? "", JSON.stringify(plan)],
    );
    return plan;
  }

  for (const [name, fixture] of FIXTURES) {
    /**
     * The whole point of the todo, stated as one comparison: whatever the
     * SQL derives from a plan, the projection derives from the same plan.
     */
    it(`derives the same graph as the scan SQL on ${name}`, async () => {
      const fullName = `local/${name}`;
      const plan = await applyPlan(fixture, fullName);
      const local = buildLocalWorkspace({
        plan,
        repositoryFullName: fullName,
      });
      const repository = local.repositories[0];
      if (!repository) throw new Error("the projection produced no repository");

      const names = await nodeNames();
      const stored = await storedEdges(names);

      // Not a tautology: a fixture with no edges would pass every assertion
      // below without deriving anything.
      expect(stored.length).toBeGreaterThan(10);

      expect(
        sortedEdges(
          repository.edges.map((edge) => ({
            family: edge.family,
            relation: edge.relation,
            source: edge.sourceNodeId,
            target: edge.targetNodeId,
            tier: edge.tier,
          })),
        ),
      ).toEqual(
        sortedEdges(stored.filter((edge) => isVocabulary(edge.relation))),
      );

      // And the absences agree too. `contains` is excluded from both readers
      // on purpose, so an agent hears the same reason on either transport.
      const omittedCounts = new Map<string, number>();
      for (const edge of stored) {
        if (isVocabulary(edge.relation)) continue;
        omittedCounts.set(
          edge.relation,
          (omittedCounts.get(edge.relation) ?? 0) + 1,
        );
      }
      expect(repository.edgeOmissions).toEqual(
        [...omittedCounts]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([relation, count]) => ({
            count,
            reason: edgeOmissionReason(relation),
            relation,
          })),
      );
      expect(omittedCounts.get("contains")).toBeGreaterThan(0);
    });

    it(`derives the same index, routes, objects and sections on ${name}`, async () => {
      const fullName = `local/${name}`;
      const plan = await applyPlan(fixture, fullName);
      const repository = buildLocalWorkspace({
        plan,
        repositoryFullName: fullName,
      }).repositories[0];
      if (!repository) throw new Error("the projection produced no repository");
      const names = await nodeNames();

      const index = await database.query<{
        entry_type: string;
        neighbor_ids: string[];
        path: string;
        search_key: string;
        symbols: string[];
        tags: string[];
        title: string;
      }>(
        `select entry_type, neighbor_ids, path, search_key, symbols, tags, title
         from public.index_entries where workspace_id = $1 order by path`,
        [workspaceId],
      );
      // Both sides sorted by the same comparator: `order by path` is a
      // database collation and `localeCompare` is not, and the difference is
      // not what this test is about.
      const byPath = <T extends { path: string }>(rows: readonly T[]): T[] =>
        [...rows].sort((left, right) => (left.path < right.path ? -1 : 1));
      expect(
        byPath(
          repository.indexEntries.map((entry) => ({
            neighbours: entry.neighborIds.slice().sort(),
            path: entry.path,
            searchKey: entry.searchKey,
            symbols: entry.symbols.slice().sort(),
            tags: entry.tags,
            title: entry.title,
            type: entry.type,
          })),
        ),
      ).toEqual(
        byPath(
          index.rows.map((row) => ({
            neighbours: row.neighbor_ids
              .map((id) => names.get(id) ?? id)
              .sort(),
            path: row.path,
            searchKey: row.search_key,
            symbols: row.symbols.slice().sort(),
            tags: row.tags,
            title: row.title,
            type: row.entry_type,
          })),
        ),
      );

      const routes = await database.query<{
        methods: string[];
        tier: string;
        url: string;
      }>(
        "select url, tier, methods from public.routes where workspace_id = $1 order by url",
        [workspaceId],
      );
      expect(
        repository.routes?.map((route) => ({
          methods: route.methods,
          tier: route.tier,
          url: route.url,
        })) ?? [],
      ).toEqual(
        routes.rows.map((row) => ({
          methods: row.methods.slice().sort(),
          tier: row.tier,
          url: row.url,
        })),
      );

      const objects = await database.query<{
        kind: string;
        name: string;
        source_line: number;
        source_path: string;
      }>(
        `select name, kind, source_path, source_line from public.db_objects
         where workspace_id = $1 order by name`,
        [workspaceId],
      );
      expect(
        repository.dbObjects?.map((object) => ({
          kind: object.kind,
          name: object.name,
          sourceLine: object.sourceLine,
          sourcePath: object.sourcePath,
        })) ?? [],
      ).toEqual(
        objects.rows.map((row) => ({
          kind: row.kind,
          name: row.name,
          sourceLine: Number(row.source_line),
          sourcePath: row.source_path,
        })),
      );

      const sections = await database.query<{
        heading: string;
        source_path: string;
        token: string;
      }>(
        `select token, heading, source_path from public.sections
         where workspace_id = $1 order by token`,
        [workspaceId],
      );
      expect(repository.sections ?? []).toEqual(
        sections.rows.map((row) => ({
          heading: row.heading,
          nodeId: `section:${row.token}`,
          sourcePath: row.source_path,
          token: row.token,
        })),
      );
    });
  }

  /**
   * A local scan has never run enrich, so every file's prose is `missing`.
   * That is the same word the hosted reader uses for a file nothing has
   * summarised — the point being that a card says "no description" rather
   * than inventing one from a path (S1).
   */
  it("reports every file's prose as missing rather than inventing it", async () => {
    const { commitSha, source } = await createLocalRepositorySource(
      FIXTURES[0][1],
    );
    const plan = await scanRepository({ commitSha, mode: "full", source });
    const repository = buildLocalWorkspace({
      plan,
      repositoryFullName: "local/demo",
    }).repositories[0];

    expect(repository?.artifacts.length).toBeGreaterThan(5);
    for (const artifact of repository?.artifacts ?? []) {
      expect(artifact.summaryState).toEqual({ state: "missing" });
      expect(artifact.content).toBe("");
      // The label falls back to the path — never to a body.
      expect(artifact.summary).toBe(artifact.path);
    }
    expect(repository?.basis?.stages).toEqual({
      analysis: "unavailable",
      structure: "ready",
    });
  });
});
