import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { scanRepository } from "../packages/core/src/index";
import { createLocalRepositorySource } from "../packages/cli/src/local-source";
import {
  buildWorkspaceMapModel,
  type WorkspaceMapRows,
} from "../apps/web/lib/map/workspace-map";
import { ALL_MIGRATIONS, createTestDatabase } from "./helpers/database";
import { githubShapedPlan } from "./helpers/github-shaped-plan";

/**
 * The density regression gate (Phase 4 Wave A′ todo 8).
 *
 * Phase 4 exists because the graph was a handful of documents joined to each
 * other: the render was fine and the data was thin. Everything since has been
 * adding real relationships, and a target with no instrument is a wish — so
 * this is the instrument, run against the database rather than the plan,
 * because half of what the galaxy is made of (the hierarchy, the routes) is
 * derived in SQL and never appears in a plan at all.
 *
 * **Where each threshold applies.** `BUILD_PLAN_PHASE4`'s numbers — average
 * degree ≥3, orphans ≤10% — were measured on *this repository*, so that is
 * where they are asserted. The two fixtures are 27 and 34 nodes; a 15-file
 * demo with three imports is sparse because it is small, not because an
 * extractor regressed, and pinning ≥3 there would mean lowering it to
 * something that gates nothing. They get their measured numbers pinned as
 * regression baselines instead, plus a census of which edge families their
 * content implies — which catches a broken extractor that a degree average
 * over 34 nodes would not (OQ-056).
 *
 * It is a gate, not a benchmark. Alongside density it asserts the four things
 * that would make a dense graph a lie:
 *
 * - **Two paths agree.** The CLI plan and the GitHub plan are byte-identical.
 * - **Nothing is promoted.** A deterministic scan produces no `verified`.
 * - **No bodies are stored.** A sentinel from a fixture file reaches no column.
 * - **No provenance is lost.** Every edge keeps its family, its reason or
 *   span, and *its own relation* — a stored relation the display did not know
 *   used to be relabelled `references` on the way to the screen (Codex remedy
 *   P0-D).
 */

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const DRIFTED_DEMO = resolve(repoRoot, "fixtures/drifted-demo");
const NEXT_FASTAPI = resolve(repoRoot, "fixtures/layout-variants/next-fastapi");
const USER = "72000000-0000-4000-8000-000000000001";

/**
 * Families that carry a *dependency*. A change's blast radius travels along
 * these and no others: a folder containing a file, a README naming it and a
 * statistical co-change are all real edges, and none of them means "editing
 * this breaks that" (Codex remedy P0-C).
 */
const IMPACT_FAMILIES = new Set(["structure", "evidence", "database", "route"]);

/** Every node kind and edge family the deterministic pass can produce. */
const NODE_KINDS = [
  "artifact",
  "db_object",
  "directory",
  "rationale",
  "route",
  "section",
];
const EDGE_FAMILIES = [
  "database",
  "doc",
  "evidence",
  "hierarchy",
  "route",
  "structure",
];

/** The expected keys a census does not have, so a failure names them. */
function missing(
  census: Record<string, number>,
  expected: readonly string[],
): string[] {
  return expected.filter((key) => (census[key] ?? 0) === 0);
}

interface Density {
  readonly averageDegree: number;
  readonly displayEdges: number;
  readonly edgesByFamily: Record<string, number>;
  readonly impactEdges: number;
  readonly nodes: number;
  readonly nodesByKind: Record<string, number>;
  readonly orphanShare: number;
  readonly orphans: number;
  readonly relationsRelabelled: number;
  readonly triangles: number;
}

function tally(values: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

function countTriangles(
  neighbours: ReadonlyMap<string, ReadonlySet<string>>,
): number {
  const order = [...neighbours.keys()].sort();
  const rank = new Map(order.map((id, index) => [id, index]));
  let triangles = 0;
  for (const id of order) {
    const own = neighbours.get(id);
    if (!own) continue;
    const higher = [...own].filter(
      (other) => (rank.get(other) ?? -1) > (rank.get(id) ?? -1),
    );
    for (let i = 0; i < higher.length; i += 1) {
      for (let j = i + 1; j < higher.length; j += 1) {
        const a = higher[i];
        const b = higher[j];
        if (a === undefined || b === undefined) continue;
        if (neighbours.get(a)?.has(b)) triangles += 1;
      }
    }
  }
  return triangles;
}

describe("graph density gate", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let workspaceId: string;

  beforeEach(async () => {
    database = await createTestDatabase([...ALL_MIGRATIONS]);
    await database.query(
      "insert into auth.users (id, email) values ($1, 'density@example.test')",
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

  /** Every table the loader reads, straight from the database. */
  async function readRows(): Promise<WorkspaceMapRows> {
    const query = async <T>(sql: string): Promise<T[]> =>
      (await database.query<T>(sql, [workspaceId])).rows;
    return {
      accessEvents: [],
      artifacts: await query(
        "select id, classification, path, exported_symbols from public.artifacts where workspace_id = $1",
      ),
      assertions: [],
      coChanges: [],
      concepts: [],
      dbObjects: await query(
        "select id, name, kind, source_path, source_line from public.db_objects where workspace_id = $1",
      ),
      directories: await query(
        "select id, path, role from public.directories where workspace_id = $1",
      ),
      edges: await query(
        `select id, source_node_id, target_node_id, relation, family, confidence, provenance
         from public.edges where workspace_id = $1`,
      ),
      evidence: await query(
        "select id, kind, verdict, source_artifact_id from public.evidence where workspace_id = $1",
      ),
      findings: [],
      graphNodes: await query(
        "select id, kind, label from public.graph_nodes where workspace_id = $1",
      ),
      rationales: await query(
        "select id, artifact_id, source_path, source_line from public.rationales where workspace_id = $1",
      ),
      repositories: await query(
        "select id, full_name, last_scanned_commit_sha, layout_config from public.repositories where workspace_id = $1",
      ),
      requirements: await query(
        "select id, statement, source_artifact_id, source_span from public.requirements where workspace_id = $1",
      ),
      routes: await query(
        "select id, url, methods from public.routes where workspace_id = $1",
      ),
      sections: await query(
        "select id, token, heading, source_path from public.sections where workspace_id = $1",
      ),
      tokens: [],
    };
  }

  async function scanInto(fixture: string, fullName: string): Promise<void> {
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
  }

  async function measure(): Promise<Density> {
    const rows = await readRows();
    const model = buildWorkspaceMapModel(workspaceId, rows);
    const storedById = new Map(rows.edges.map((row) => [row.id, row]));

    const neighbours = new Map<string, Set<string>>();
    let relabelled = 0;
    let impactEdges = 0;
    for (const edge of model.graph.edges) {
      if (edge.source !== edge.target) {
        if (!neighbours.has(edge.source))
          neighbours.set(edge.source, new Set());
        if (!neighbours.has(edge.target))
          neighbours.set(edge.target, new Set());
        neighbours.get(edge.source)?.add(edge.target);
        neighbours.get(edge.target)?.add(edge.source);
      }
      const stored = storedById.get(edge.id);
      // Derived co-change edges have no stored row and are not a loss.
      if (stored && stored.relation !== edge.provenance.relation) {
        relabelled += 1;
      }
      if (edge.family && IMPACT_FAMILIES.has(edge.family)) impactEdges += 1;
    }

    // A directory's only edge is its containment, by design — counting one as
    // an orphan of the "contains excluded" graph would measure the rule, not
    // the data. Every other node is counted.
    let orphans = 0;
    let counted = 0;
    for (const node of model.graph.nodes) {
      if (node.type === "directory") continue;
      counted += 1;
      const connected = model.graph.edges.some(
        (edge) =>
          !edge.layoutOnly &&
          (edge.source === node.id || edge.target === node.id),
      );
      if (!connected) orphans += 1;
    }

    const nodes = model.graph.nodes.length;
    return {
      averageDegree: nodes === 0 ? 0 : (model.graph.edges.length * 2) / nodes,
      displayEdges: model.graph.edges.length,
      edgesByFamily: tally(
        rows.edges.map((row) => String(row.family ?? "none")),
      ),
      impactEdges,
      nodes,
      nodesByKind: tally(rows.graphNodes.map((row) => row.kind)),
      orphanShare: counted === 0 ? 0 : orphans / counted,
      orphans,
      relationsRelabelled: relabelled,
      triangles: countTriangles(neighbours),
    };
  }

  it("this repository meets the Phase 4 density target", async () => {
    await scanInto(repoRoot, "2klips/alrescha-app");
    const density = await measure();

    // Every node kind and every family the deterministic pass can produce is
    // present. A broken extractor drops one of these to zero long before it
    // moves an average over 1,200 nodes — and comparing the whole set at once
    // names the one that vanished.
    expect(missing(density.nodesByKind, NODE_KINDS)).toEqual([]);
    expect(missing(density.edgesByFamily, EDGE_FAMILIES)).toEqual([]);

    // The plan's target for Wave A′: ~1,260 nodes, ~4,000 edges, average
    // degree ~6.3, orphans ~7%. Measured on 2026-09-06: 1,253 / 5,213 / 8.32
    // / 4.2%, triangles 2,533.
    expect(density.nodes).toBeGreaterThanOrEqual(1_000);
    expect(density.averageDegree).toBeGreaterThanOrEqual(3);
    expect(density.orphanShare).toBeLessThanOrEqual(0.1);
    expect(density.triangles).toBeGreaterThan(0);

    // The blast radius travels along dependency families only, so it is a
    // strict subset of what the map draws (Codex remedy P0-C).
    expect(density.impactEdges).toBeGreaterThan(0);
    expect(density.impactEdges).toBeLessThan(density.displayEdges);
    // Scanning 760 files and applying 5,200 edges into PGlite takes about
    // twelve seconds; the default five would fail on speed, not on data.
  }, 90_000);

  it("holds the drifted-demo fixture at its measured baseline", async () => {
    await scanInto(DRIFTED_DEMO, "local/density-demo");
    const density = await measure();

    // Two ADR files, two ID-token headings, two section nodes.
    expect(density.nodesByKind["section"]).toBe(2);
    expect(density.nodesByKind["directory"]).toBeGreaterThan(0);
    // The families a 15-file TypeScript repository with ADRs and a test
    // implies. Each is an extractor; a zero here is a regression. It has no
    // SQL and no framework routes, so `database` and `route` are absent and
    // that absence is the truth about the fixture.
    expect(
      missing(density.edgesByFamily, [
        "doc",
        "evidence",
        "hierarchy",
        "structure",
      ]),
    ).toEqual([]);

    // Measured 2026-09-06: 27 nodes, 19 edges, degree 1.41, 12 of 17
    // non-directory nodes unconnected. Pinned so the numbers can improve and
    // cannot silently fall.
    expect(density.nodes).toBeGreaterThanOrEqual(27);
    expect(density.displayEdges).toBeGreaterThanOrEqual(19);
    expect(density.orphans).toBeLessThanOrEqual(12);
  });

  it("a typical repository with no ID-token headings passes the same gate", async () => {
    await scanInto(NEXT_FASTAPI, "local/density-typical");
    const density = await measure();

    // The point of the second fixture: sections are optional. A repository
    // that writes no `ADR-NNN` heading declares none and everything else
    // still works.
    expect(density.nodesByKind["section"]).toBeUndefined();
    expect(density.nodesByKind["route"]).toBeGreaterThan(0);
    expect(density.nodesByKind["db_object"]).toBe(2);
    expect(missing(density.edgesByFamily, EDGE_FAMILIES)).toEqual([]);

    // Measured 2026-09-06: 34 nodes, 47 edges, degree 2.76, 6 of 22
    // non-directory nodes unconnected, 3 triangles.
    expect(density.nodes).toBeGreaterThanOrEqual(34);
    expect(density.displayEdges).toBeGreaterThanOrEqual(47);
    expect(density.orphans).toBeLessThanOrEqual(6);
    expect(density.triangles).toBeGreaterThan(0);
  });

  it("keeps every stored relation, family and reason on the way to the screen", async () => {
    await scanInto(NEXT_FASTAPI, "local/density-provenance");
    const rows = await readRows();
    const model = buildWorkspaceMapModel(workspaceId, rows);

    // Nothing arrives family-less: `derive_edge_family` fills the column on
    // insert, so a null here means a writer bypassed the trigger.
    expect(rows.edges.filter((row) => !row.family)).toEqual([]);

    // Every edge explains itself with a reason or a span.
    const unexplained = rows.edges.filter((row) => {
      const provenance = row.provenance as Record<string, unknown> | null;
      const span = provenance?.["span"] as Record<string, unknown> | undefined;
      return (
        typeof provenance?.["reason"] !== "string" &&
        typeof span?.["path"] !== "string"
      );
    });
    expect(unexplained).toEqual([]);

    // And arrives on the screen saying what it stored. A relation outside the
    // display vocabulary used to become `references` here, which turns a
    // containment, a route and a table read into the same word.
    const relabelled = model.graph.edges
      .map((edge) => ({
        display: edge.provenance.relation,
        id: edge.id,
        stored: rows.edges.find((row) => row.id === edge.id)?.relation,
      }))
      .filter(
        ({ display, stored }) => stored !== undefined && stored !== display,
      );
    expect(relabelled).toEqual([]);
    expect(
      new Set(model.graph.edges.map((edge) => edge.provenance.relation)).size,
    ).toBeGreaterThan(3);

    // Two edges between the same pair with different relations stay two
    // edges: `(source, target)` is not an identity (Codex remedy P0-D).
    const pairs = new Set(
      model.graph.edges.map((edge) => `${edge.source}|${edge.target}`),
    );
    const triples = new Set(
      model.graph.edges.map(
        (edge) => `${edge.source}|${edge.target}|${edge.provenance.relation}`,
      ),
    );
    expect(triples.size).toBeGreaterThan(pairs.size);
    expect(triples.size).toBe(model.graph.edges.length);
  });

  it("promotes nothing to verified and stores no source body", async () => {
    await scanInto(DRIFTED_DEMO, "local/density-honesty");
    const rows = await readRows();
    const model = buildWorkspaceMapModel(workspaceId, rows);

    // ADR-001: a deterministic scan reads no execution evidence, so it can
    // grade nothing `verified` no matter how many edges it drew.
    expect(
      model.graph.nodes.filter((node) => node.grade === "verified"),
    ).toEqual([]);
    expect(
      model.graph.edges.filter((edge) => edge.grade === "verified"),
    ).toEqual([]);

    // WORK_SPEC §3-3, from the other end than `verify-scope-boundaries.ts`
    // checks it: a distinctive line of a fixture file reaches no column.
    const body = await readFile(
      resolve(DRIFTED_DEMO, "src/session.ts"),
      "utf8",
    );
    const sentinel = body
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 30);
    expect(sentinel).toBeTruthy();
    const stored = await database.query<{ hits: string }>(
      `select (
         (select count(*) from public.artifacts
          where workspace_id = $1 and metadata::text like $2)
       + (select count(*) from public.edges
          where workspace_id = $1 and provenance::text like $2)
       + (select count(*) from public.rationales
          where workspace_id = $1 and text like $2)
       + (select count(*) from public.sections
          where workspace_id = $1 and heading like $2)
       )::text as hits`,
      [workspaceId, `%${sentinel}%`],
    );
    expect(stored.rows[0]?.hits).toBe("0");
  });

  it("gives the CLI path and the GitHub path a byte-identical plan", async () => {
    for (const fixture of [DRIFTED_DEMO, NEXT_FASTAPI]) {
      const { commitSha, source } = await createLocalRepositorySource(fixture);
      const localPlan = await scanRepository({
        commitSha,
        mode: "full",
        source,
      });
      const githubPlan = await githubShapedPlan(fixture, commitSha, "full");
      expect(JSON.stringify(localPlan)).toBe(JSON.stringify(githubPlan));
      // Equality has to be about something: since todo 8 the plan carries
      // sections, and `next-fastapi` carries schema objects and routes.
      expect(localPlan.artifacts.length).toBeGreaterThan(5);
    }
  });
});
