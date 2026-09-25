import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { PGlite } from "@electric-sql/pglite";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { moduleCardForPath } from "../apps/web/lib/map/inspect-card";
import { readModuleCardInputs } from "../apps/web/lib/map/module-rows";
import { readSymbolLayer } from "../apps/web/lib/map/symbol-layer";
import {
  loadWorkspaceMap,
  NODE_LIMIT,
  type WorkspaceMapModel,
} from "../apps/web/lib/map/workspace-map";
import { createLocalRepositorySource } from "../packages/cli/src/local-source";
import { scanRepository } from "../packages/core/src/index";
import { SYMBOL_LAYER_LIMITS } from "../packages/mcp/src/index";
import { ALL_MIGRATIONS, createTestDatabase } from "./helpers/database";
import {
  postgrestOverPglite,
  type PostgrestRequestRecord,
} from "./helpers/postgrest-pglite";

/**
 * RE-04 — the map past PostgREST's row cap.
 *
 * PostgREST answers with at most `max_rows` rows and says nothing about it;
 * Supabase's default, and this repository's `supabase/config.toml`, is 1,000.
 * `loadWorkspaceMap` asked for 2,000 nodes and up to 6,000 edges of a family
 * in one request each, so a server that stops at 1,000 handed it the first
 * thousand — the newest rows, ids being time-ordered, were the ones left
 * out — and the map drew them as the whole workspace. Production drew exactly
 * `data-layout-nodes=1000` on 2026-09-23 and 2026-09-24 against a pilot of
 * about 1,600 non-symbol nodes. That is circumstantial: the hosted setting
 * was not read.
 *
 * The data is the production SQL's own projection of `drifted-demo`
 * (`apply_repository_scan`), plus rows seeded past the cap in every table a
 * scan leaves empty, read by the real loader through the real client as the
 * signed-in owner, under row security. The emulated cap is 10 — the largest
 * read the loader leaves as one request holds 10 rows here — so a fixture
 * this size crosses it; the rule is the same at 1,000, and the last case runs
 * at 1,000 itself.
 */

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const DRIFTED_DEMO = resolve(repoRoot, "fixtures/drifted-demo");

/** The emulated `max_rows`. */
const CAP = 10;
/** Rows seeded into each table the scan leaves empty: three pages' worth. */
const SEEDED = CAP * 2 + 3;
/** `supabase/config.toml` `[api] max_rows`, and Supabase's default. */
const SERVER_CAP = 1_000;
const NOW = Date.parse("2026-09-24T12:00:00.000Z");

const OWNER = "78000000-0000-4000-8000-0000000000f1";
const COUPLED = "78000000-0000-4000-8000-0000000000f2";
const WIDE = "78000000-0000-4000-8000-0000000000f3";

let database: PGlite;
const workspaces = new Map<string, string>();

function sessionFor(userId: string, maxRows?: number) {
  const emulator = postgrestOverPglite(database, {
    ...(maxRows === undefined ? {} : { maxRows }),
    role: "authenticated",
    userId,
  });
  const client = createClient(
    "https://abcdefghijklmnopqrst.supabase.co",
    "key",
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: emulator.fetch },
    },
  );
  return { client, emulator };
}

async function count(sql: string, params: unknown[]): Promise<number> {
  const result = await database.query<{ n: number }>(sql, params);
  return result.rows[0]?.n ?? 0;
}

async function workspaceFor(userId: string): Promise<string> {
  await database.query("insert into auth.users (id, email) values ($1, $2)", [
    userId,
    `${userId}@example.test`,
  ]);
  const result = await database.query<{ id: string }>(
    "select id from public.workspaces where owner_user_id = $1",
    [userId],
  );
  const workspaceId = result.rows[0]?.id ?? "";
  workspaces.set(userId, workspaceId);
  return workspaceId;
}

async function repositoryIn(workspaceId: string, name: string) {
  const result = await database.query<{ id: string }>(
    "select public.ensure_local_repository($1, $2) as id",
    [workspaceId, name],
  );
  return result.rows[0]?.id ?? "";
}

async function scanDriftedDemo(workspaceId: string, repositoryId: string) {
  const { commitSha, source } = await createLocalRepositorySource(DRIFTED_DEMO);
  const plan = await scanRepository({ commitSha, mode: "full", source });
  await database.query(
    "select public.apply_repository_scan($1, $2, $3::jsonb)",
    [workspaceId, repositoryId, JSON.stringify(plan)],
  );
}

async function artifactsOf(workspaceId: string) {
  const result = await database.query<{ id: string; path: string }>(
    "select id, path from public.artifacts where workspace_id = $1 order by id",
    [workspaceId],
  );
  return result.rows;
}

/**
 * Every table the map reads and a scan leaves empty, filled past the cap:
 * rationale, requirement, evidence and concept nodes with their rows,
 * `implements` and `imports` edges, open and resolved findings, tokens with
 * every other one revoked, and agent assertions. Plus one finished scan so
 * the HUD's freshness read has a row to embed.
 */
async function seedPastTheCap(workspaceId: string, repositoryId: string) {
  const artifacts = await artifactsOf(workspaceId);
  const [anchor, target] = artifacts;
  if (!anchor || !target) throw new Error("drifted-demo stored no artifacts");
  const numbers = Array.from({ length: SEEDED }, (_, index) => index + 1);
  const scope = [workspaceId, repositoryId];

  async function nodes(kind: string, labels: string[]) {
    const result = await database.query<{ id: string }>(
      `insert into public.graph_nodes (workspace_id, repository_id, kind, label)
       select $1, $2, $3, label from unnest($4::text[]) as s(label)
       returning id`,
      [...scope, kind, labels],
    );
    return result.rows.map(({ id }) => id);
  }

  const rationales = await nodes(
    "rationale",
    numbers.map((n) => `WHY: seeded rationale ${n}`),
  );
  await database.query(
    `insert into public.rationales
       (id, workspace_id, repository_id, artifact_id, kind, text, source_path,
        source_line, source_key)
     select id, $1, $2, $3, 'why', 'seeded rationale ' || n, $4, n::int,
            'seed:' || id
     from unnest($5::text[]) with ordinality as s(id, n)`,
    [...scope, anchor.id, anchor.path, rationales],
  );

  const requirements = await nodes(
    "requirement",
    numbers.map((n) => `REQ seeded ${n}`),
  );
  await database.query(
    `insert into public.requirements
       (id, workspace_id, repository_id, source_artifact_id, statement,
        source_span, status)
     select id, $1, $2, $3, 'The seeded system MUST keep row ' || n,
            jsonb_build_object('path', $4::text, 'startLine', n, 'endLine', n),
            'active'
     from unnest($5::text[]) with ordinality as s(id, n)`,
    [...scope, anchor.id, anchor.path, requirements],
  );
  // Family left to the trigger, as every writer does.
  await database.query(
    `insert into public.edges
       (workspace_id, repository_id, source_node_id, target_node_id, relation,
        provenance, confidence)
     select $1, $2, id, $3, 'implements',
            '{"reason":"seeded implements edge"}'::jsonb, 0.6
     from unnest($4::text[]) as s(id)`,
    [...scope, target.id, requirements],
  );

  const evidence = await nodes(
    "evidence",
    numbers.map((n) => `ci: seeded suite ${n}`),
  );
  await database.query(
    `insert into public.evidence
       (id, workspace_id, repository_id, source_artifact_id, kind, verdict)
     select id, $1, $2, $3, 'ci', 'supports' from unnest($4::text[]) as s(id)`,
    [...scope, target.id, evidence],
  );

  const concepts = await nodes(
    "concept",
    numbers.map((n) => `Seeded concept ${n}`),
  );
  await database.query(
    `insert into public.concepts
       (id, workspace_id, repository_id, slug, name, kind, summary,
        source_digest, member_paths)
     select id, $1, $2, 'seeded-concept-' || n, 'Seeded concept ' || n,
            'concept', 'A concept seeded past the cap.', repeat('c', 64),
            array[$3::text]
     from unnest($4::text[]) with ordinality as s(id, n)`,
    [...scope, anchor.path, concepts],
  );

  // Open findings past the cap, spread over the artifacts, and three
  // resolved ones the map must not count but the risk read still sees.
  await database.query(
    `insert into public.findings
       (workspace_id, repository_id, title, source_node_id, target_node_id,
        kind, severity, status, provenance, confidence, evidence_grade,
        fingerprint, resolved_at)
     select $1, $2, 'Seeded finding ' || n,
            ($3::text[])[1 + n % cardinality($3::text[])],
            ($3::text[])[1 + (n + 1) % cardinality($3::text[])],
            'untested-code', 'low',
            case when n <= $4 then 'open' else 'resolved' end,
            '{"reason":"seeded finding"}'::jsonb, 0.5, 'inferred',
            'seed:' || n, case when n <= $4 then null else now() end
     from generate_series(1, $4 + 3) as n`,
    [...scope, artifacts.map(({ id }) => id), SEEDED],
  );

  const tokens = await database.query<{ id: string }>(
    `insert into public.mcp_tokens
       (workspace_id, token_hash, token_prefix, name, created_by, scopes,
        revoked_at)
     select $1, 'seed-hash-' || n, 'seedtk' || lpad(n::text, 3, '0'),
            'seeded token ' || n, $2, array['mcp:read'],
            case when n % 2 = 0 then now() else null end
     from generate_series(1, $3) as n
     returning id`,
    [workspaceId, OWNER, SEEDED],
  );
  await database.query(
    `insert into public.agent_assertions
       (workspace_id, repository_id, source_node_id, target_node_id, relation,
        reason, token_id, user_id)
     select $1, $2, id, $3, 'uses', 'seeded assertion ' || n, $4, $5
     from unnest($6::text[]) with ordinality as s(id, n)`,
    [...scope, target.id, tokens.rows[0]?.id ?? "", OWNER, rationales],
  );

  // Import edges between the scanned files: the structure family, and the
  // `calls`/`imports`/`tests` edges the risk map reads.
  await database.query(
    `insert into public.edges
       (workspace_id, repository_id, source_node_id, target_node_id, relation,
        provenance, confidence)
     select $1, $2, a.id, b.id, 'imports',
            '{"reason":"seeded import"}'::jsonb, 0.9
     from public.artifacts a join public.artifacts b on a.id < b.id
     where a.workspace_id = $1 and b.workspace_id = $1
     order by a.id, b.id
     limit $3
     on conflict do nothing`,
    [...scope, SEEDED],
  );

  // Module summaries the inspector's module card reads beside the files.
  await database.query(
    `insert into public.module_summaries
       (workspace_id, repository_id, module_key, name, member_paths,
        member_digest, summary, model, provider)
     select $1, $2, 'seeded-module-' || n, 'Seeded module ' || n,
            array[$3::text], repeat('d', 64), 'A module seeded past the cap.',
            'seed-model', 'seed'
     from generate_series(1, $4::int) as n`,
    [...scope, anchor.path, SEEDED],
  );

  const run = await database.query<{ id: string }>(
    `insert into public.runs
       (workspace_id, repository_id, trigger_kind, trigger_key, commit_sha,
        status, started_at, completed_at)
     select $1, $2, 'manual', 'seed:scan', last_scanned_commit_sha,
            'succeeded', $3::timestamptz - interval '5 minutes', $3::timestamptz
     from public.repositories where id = $2
     returning id`,
    [...scope, new Date(NOW - 90 * 60_000).toISOString()],
  );
  await database.query(
    `insert into public.jobs
       (workspace_id, repository_id, run_id, kind, status, idempotency_key,
        completed_at)
     values ($1, $2, $3, 'scan', 'succeeded', 'seed:scan', $4::timestamptz)`,
    [
      ...scope,
      run.rows[0]?.id ?? "",
      new Date(NOW - 90 * 60_000).toISOString(),
    ],
  );
}

/** Co-change pairs past the cap among the scanned files, ties included. */
async function seedCoChanges(workspaceId: string, repositoryId: string) {
  await database.query(
    `insert into public.file_co_changes
       (workspace_id, repository_id, path_a, path_b, change_count,
        last_commit_sha)
     select $1, $2, path_a, path_b,
            case when n <= $3 then 3 + n % 4 else 2 end, repeat('b', 40)
     from (
       select a.path as path_a, b.path as path_b,
              row_number() over (order by a.path, b.path) as n
       from public.artifacts a join public.artifacts b on a.path < b.path
       where a.workspace_id = $1 and b.workspace_id = $1
     ) pairs
     where n <= $3 + 5`,
    [workspaceId, repositoryId, SEEDED],
  );
}

/**
 * More file nodes than the node budget, written by two transactions so the
 * `created_at` the budget used to order by is not one value throughout.
 */
async function seedWide(workspaceId: string, repositoryId: string) {
  for (const [from, to] of [
    [1, 1_100],
    [1_101, NODE_LIMIT + 100],
  ] as const) {
    await database.query(
      `insert into public.graph_nodes (workspace_id, repository_id, kind, label)
       select $1, $2, 'artifact',
              'src/wide/file-' || lpad(n::text, 4, '0') || '.ts'
       from generate_series($3::int, $4::int) as n`,
      [workspaceId, repositoryId, from, to],
    );
  }
  await database.query(
    `insert into public.artifacts
       (id, workspace_id, repository_id, kind, classification, path, digest,
        source_commit_sha)
     select id, workspace_id, repository_id, 'code_metadata', 'code_metadata',
            label, encode(sha256(convert_to(label, 'UTF8')), 'hex'),
            repeat('a', 40)
     from public.graph_nodes
     where workspace_id = $1 and kind = 'artifact'`,
    [workspaceId],
  );
}

/**
 * One file with a symbol more than the halo's budget — the symbol layer
 * keeps 5,000 and says so. Returns the file's id.
 */
async function seedCrowdedFile(workspaceId: string): Promise<string> {
  const file = await database.query<{
    id: string;
    path: string;
    repository_id: string;
  }>(
    `select id, path, repository_id from public.artifacts
     where workspace_id = $1 order by id limit 1`,
    [workspaceId],
  );
  const crowded = file.rows[0];
  if (!crowded) throw new Error("the wide workspace stored no artifact");
  await database.query(
    `insert into public.graph_nodes (workspace_id, repository_id, kind, label)
     select $1, $2, 'symbol', 'crowded' || n
     from generate_series(1, $3::int) as n`,
    [workspaceId, crowded.repository_id, SYMBOL_LAYER_LIMITS.symbols + 1],
  );
  await database.query(
    `insert into public.symbols
       (id, workspace_id, repository_id, artifact_id, path, kind, name,
        start_line, end_line, start_column, end_column, engine, stable_key)
     select id, workspace_id, repository_id, $2, $3, 'function', label,
            n::int, n::int, 1, 10, 'typescript-ast', md5(id)
     from (
       select id, workspace_id, repository_id, label,
              row_number() over (order by id) as n
       from public.graph_nodes where workspace_id = $1 and kind = 'symbol'
     ) nodes`,
    [workspaceId, crowded.id, crowded.path],
  );
  return crowded.id;
}

let crowdedFile = "";
let ownerRepository = "";

beforeAll(async () => {
  database = await createTestDatabase([...ALL_MIGRATIONS]);

  const owner = await workspaceFor(OWNER);
  ownerRepository = await repositoryIn(owner, "local/drifted-demo");
  await scanDriftedDemo(owner, ownerRepository);
  await seedPastTheCap(owner, ownerRepository);

  const coupled = await workspaceFor(COUPLED);
  const coupledRepository = await repositoryIn(coupled, "local/coupled-demo");
  await scanDriftedDemo(coupled, coupledRepository);
  await seedCoChanges(coupled, coupledRepository);

  const wide = await workspaceFor(WIDE);
  await seedWide(wide, await repositoryIn(wide, "local/wide-demo"));
  crowdedFile = await seedCrowdedFile(wide);
});

afterAll(async () => {
  await database.close();
});

/** What a reader of the map notices first, before the whole model. */
function summary(model: WorkspaceMapModel) {
  return {
    counts: model.counts,
    coverage: model.hud.coverage,
    edges: model.graph.edges.length,
    lastScan: model.hud.lastScan,
    nodes: model.graph.nodes.length,
    revokedTokens: model.revokedTokenIds.length,
    riskRanked: model.hud.risk?.ranked ?? null,
    unknownNodes: model.graph.nodes.filter(({ type }) => type === "unknown")
      .length,
  };
}

/** Parameters that say where a page starts, not what the read is. */
function isPaging([name, value]: [string, string]): boolean {
  return (
    name === "limit" ||
    name === "offset" ||
    (name === "id" && /^(gt|lt)\./.test(value))
  );
}

/** The requests of one load, grouped into the reads they page. */
function readsOf(
  requests: readonly PostgrestRequestRecord[],
): Map<string, PostgrestRequestRecord[]> {
  const reads = new Map<string, PostgrestRequestRecord[]>();
  for (const request of requests) {
    if (request.kind !== "table") continue;
    const key = [
      request.name,
      ...[...new URL(request.url).searchParams]
        .filter((entry) => !isPaging(entry))
        .map(([name, value]) => `${name}=${value}`)
        .sort(),
    ].join("&");
    reads.set(key, [...(reads.get(key) ?? []), request]);
  }
  return reads;
}

function rowsOf(pages: readonly PostgrestRequestRecord[]): number {
  return pages.reduce((sum, page) => sum + (page.rows ?? 0), 0);
}

describe("the map past PostgREST's row cap (RE-04)", () => {
  it("has more rows than the cap in every table it pages, and fewer in every read it does not", async () => {
    // Not a tautology: a fixture under the cap would pass everything below.
    const workspaceId = workspaces.get(OWNER);
    const stored = async (sql: string) => count(sql, [workspaceId]);
    const paged = {
      artifacts: await stored(
        "select count(*)::int as n from public.artifacts where workspace_id = $1",
      ),
      assertions: await stored(
        "select count(*)::int as n from public.agent_assertions where workspace_id = $1",
      ),
      concepts: await stored(
        "select count(*)::int as n from public.concepts where workspace_id = $1",
      ),
      evidence: await stored(
        "select count(*)::int as n from public.evidence where workspace_id = $1",
      ),
      hierarchyEdges: await stored(
        "select count(*)::int as n from public.edges where workspace_id = $1 and family = 'hierarchy'",
      ),
      implementsEdges: await stored(
        "select count(*)::int as n from public.edges where workspace_id = $1 and relation = 'implements'",
      ),
      nodes: await stored(
        "select count(*)::int as n from public.graph_nodes where workspace_id = $1 and kind <> 'symbol'",
      ),
      openFindings: await stored(
        "select count(*)::int as n from public.findings where workspace_id = $1 and status = 'open'",
      ),
      rationales: await stored(
        "select count(*)::int as n from public.rationales where workspace_id = $1",
      ),
      requirements: await stored(
        "select count(*)::int as n from public.requirements where workspace_id = $1",
      ),
      riskEdges: await stored(
        "select count(*)::int as n from public.edges where workspace_id = $1 and relation in ('calls', 'imports', 'tests')",
      ),
      structureEdges: await stored(
        "select count(*)::int as n from public.edges where workspace_id = $1 and family = 'structure'",
      ),
      tokens: await stored(
        "select count(*)::int as n from public.mcp_tokens where workspace_id = $1",
      ),
    };
    for (const [table, rows] of Object.entries(paged)) {
      expect({ rows: rows > CAP, table }).toEqual({ rows: true, table });
    }
    const single = {
      directories: await stored(
        "select count(*)::int as n from public.directories where workspace_id = $1",
      ),
      sections: await stored(
        "select count(*)::int as n from public.sections where workspace_id = $1",
      ),
    };
    for (const [table, rows] of Object.entries(single)) {
      expect({ rows: rows <= CAP, table }).toEqual({ rows: true, table });
    }
  });

  it("draws the map a capped server holds as it would with no cap", async () => {
    const capped = await loadWorkspaceMap(
      sessionFor(OWNER, CAP).client,
      OWNER,
      NOW,
    );
    const whole = await loadWorkspaceMap(sessionFor(OWNER).client, OWNER, NOW);
    // The uncapped map is the whole workspace, not merely another answer.
    expect(whole.graph.nodes).toHaveLength(
      await count(
        "select count(*)::int as n from public.graph_nodes where workspace_id = $1 and kind not in ('symbol', 'finding')",
        [workspaces.get(OWNER)],
      ),
    );
    expect(summary(capped)).toEqual(summary(whole));
    expect(capped).toEqual(whole);
  });

  it("asks past the cap wherever it can cut, stays one request where it cannot, and names the workspace on every page", async () => {
    const capped = sessionFor(OWNER, CAP);
    await loadWorkspaceMap(capped.client, OWNER, NOW);
    const whole = sessionFor(OWNER);
    await loadWorkspaceMap(whole.client, OWNER, NOW);
    const cappedReads = readsOf(capped.emulator.requests);
    const wholeReads = readsOf(whole.emulator.requests);
    expect([...cappedReads.keys()].sort()).toEqual(
      [...wholeReads.keys()].sort(),
    );

    for (const [read, pages] of cappedReads) {
      const unpaged = wholeReads.get(read) ?? [];
      // Every read returns under the cap what it returns with none.
      expect({ read, rows: rowsOf(pages) }).toEqual({
        read,
        rows: rowsOf(unpaged),
      });
      // With no cap every read is one request: paging costs nothing where
      // nothing is cut.
      expect({ read, requests: unpaged.length }).toEqual({ read, requests: 1 });
      // A read whose own budget is within the real cap is never cut by it,
      // and stays one request.
      const asked = new URL(pages[0]?.url ?? "").searchParams.get("limit");
      if (asked !== null && Number(asked) <= SERVER_CAP) {
        expect({ read, requests: pages.length }).toEqual({
          read,
          requests: 1,
        });
      }
      for (const page of pages) {
        expect(page.status).toBe(200);
        expect(page.rows ?? 0).toBeLessThanOrEqual(CAP);
        // The workspace lookup itself is by owner; every other page carries
        // the tenant predicate, not only the first.
        if (page.name !== "workspaces") {
          expect(new URL(page.url).searchParams.get("workspace_id")).toBe(
            `eq.${workspaces.get(OWNER)}`,
          );
        }
      }
    }
    // Paging did happen: the node read alone crossed the cap more than once.
    const nodePages = capped.emulator.requests.filter(
      ({ name }) => name === "graph_nodes",
    );
    expect(nodePages.length).toBeGreaterThan(2);
  });

  it("draws every co-change pair it reads, whatever the cap holds back", async () => {
    const coupling = (model: WorkspaceMapModel) =>
      model.graph.edges
        .filter(({ provenance }) => provenance.relation === "co_changed")
        .map(({ id, provenance }) => ({
          confidence: provenance.confidence,
          id,
        }));
    const capped = sessionFor(COUPLED, CAP);
    const cappedMap = await loadWorkspaceMap(capped.client, COUPLED, NOW);
    const whole = await loadWorkspaceMap(
      sessionFor(COUPLED).client,
      COUPLED,
      NOW,
    );
    expect(coupling(whole)).toHaveLength(SEEDED);
    expect(coupling(cappedMap)).toEqual(coupling(whole));
    // The budget still keeps the strongest pairs: the read runs in
    // change-count order, the pair key breaking ties so no page overlaps
    // the next.
    const pairs = capped.emulator.requests.filter(
      ({ name, url }) =>
        name === "file_co_changes" &&
        new URL(url).searchParams.get("change_count") === "gte.3",
    );
    expect(pairs.length).toBeGreaterThan(1);
    for (const page of pairs) {
      expect(new URL(page.url).searchParams.get("order")).toBe(
        "change_count.desc,repository_id.asc,path_a.asc,path_b.asc",
      );
    }
  });

  it("keeps the node budget at the real cap, every kept node with its artifact row", async () => {
    const { client, emulator } = sessionFor(WIDE, SERVER_CAP);
    const model = await loadWorkspaceMap(client, WIDE, NOW);
    // The whole budget, not the cap: one request drew exactly 1,000 here,
    // production's `data-layout-nodes=1000`.
    expect(model.graph.nodes).toHaveLength(NODE_LIMIT);
    // R4 §3.7: the artifacts read and the nodes read agree row for row, so
    // no kept file lost its classification to the other read's page.
    expect(model.graph.nodes.filter(({ type }) => type === "unknown")).toEqual(
      [],
    );
    expect(model.counts.artifacts).toBe(NODE_LIMIT);
    // The budget keeps the oldest nodes, as the created-at order did.
    const oldest = await database.query<{ id: string }>(
      `select id from public.graph_nodes
       where workspace_id = $1 and kind <> 'symbol'
       order by created_at, id limit $2`,
      [workspaces.get(WIDE), NODE_LIMIT],
    );
    expect(model.graph.nodes.map(({ id }) => id).sort()).toEqual(
      oldest.rows.map(({ id }) => id).sort(),
    );
    // Two pages of a thousand and no third: the budget ends the read.
    expect(
      emulator.requests
        .filter(({ name }) => name === "graph_nodes")
        .map(({ rows }) => rows),
    ).toEqual([SERVER_CAP, SERVER_CAP]);
    // The risk map's artifact read has no budget: it reads every file.
    expect(
      emulator.requests
        .filter(
          ({ name, url }) =>
            name === "artifacts" &&
            new URL(url).searchParams.get("select") === "id,kind,path",
        )
        .map(({ rows }) => rows),
    ).toEqual([SERVER_CAP, SERVER_CAP, 100]);
  });
});

/**
 * The map's other read: a file's symbol halo (`/api/map/symbols`, todo 26).
 * It asks for up to 5,001 symbols and 20,001 edges so that the one past the
 * budget can say the budget was hit; a server that stops at 1,000 never sends
 * it, so the halo lost the rest and reported nothing.
 */
describe("the symbol halo past PostgREST's row cap (RE-04)", () => {
  it("draws a file's whole halo when the cap is smaller than the file", async () => {
    const heaviest = await database.query<{ artifact_id: string; n: number }>(
      `select artifact_id, count(*)::int as n from public.symbols
       where workspace_id = $1
       group by artifact_id order by n desc, artifact_id limit 1`,
      [workspaces.get(OWNER)],
    );
    const file = heaviest.rows[0];
    if (!file) throw new Error("drifted-demo declares no symbol");
    // Not a tautology: a one-symbol file fits under any cap.
    expect(file.n).toBeGreaterThan(1);
    const capped = await readSymbolLayer(sessionFor(OWNER, file.n - 1).client, [
      file.artifact_id,
    ]);
    const whole = await readSymbolLayer(sessionFor(OWNER).client, [
      file.artifact_id,
    ]);
    expect(whole.symbols).toHaveLength(file.n);
    expect(
      whole.edges.filter(({ relation }) => relation === "declares"),
    ).toHaveLength(file.n);
    expect(capped).toEqual(whole);
  });

  it("keeps the halo's budget at the real cap, and still says when it hits it", async () => {
    const layer = await readSymbolLayer(sessionFor(WIDE, SERVER_CAP).client, [
      crowdedFile,
    ]);
    expect(layer.symbols).toHaveLength(SYMBOL_LAYER_LIMITS.symbols);
    expect(layer.truncated).toEqual([
      { limit: SYMBOL_LAYER_LIMITS.symbols, table: "symbols" },
    ]);
    // In the halo's own order — the one its golden-angle layout places by.
    const lines = layer.symbols.map(({ startLine }) => startLine);
    expect(lines).toEqual([...lines].sort((left, right) => left - right));
  });
});

/**
 * The map's third read: the module card a selected file's inspector shows
 * (`/api/map/inspect`, todo 19). It reads the repository's files and their
 * import and call edges up to the map's own budgets (2,000 and 6,000), and
 * every module summary — on the pilot, 1,010 files and some 2,800 such
 * edges, each past the cap.
 */
describe("the inspector's module card past PostgREST's row cap (RE-04)", () => {
  it("computes a file's module from every row a capped server holds", async () => {
    const stored = {
      edges: await count(
        "select count(*)::int as n from public.edges where repository_id = $1 and relation in ('imports', 'calls')",
        [ownerRepository],
      ),
      files: await count(
        "select count(*)::int as n from public.artifacts where repository_id = $1",
        [ownerRepository],
      ),
      summaries: await count(
        "select count(*)::int as n from public.module_summaries where repository_id = $1",
        [ownerRepository],
      ),
    };
    for (const [table, rows] of Object.entries(stored)) {
      expect({ rows: rows > CAP, table }).toEqual({ rows: true, table });
    }
    const capped = await readModuleCardInputs(
      sessionFor(OWNER, CAP).client,
      ownerRepository,
    );
    const whole = await readModuleCardInputs(
      sessionFor(OWNER).client,
      ownerRepository,
    );
    expect(whole?.artifacts).toHaveLength(stored.files);
    expect(whole?.edges).toHaveLength(stored.edges);
    expect(whole?.summaries).toHaveLength(stored.summaries);
    expect(capped).toEqual(whole);
    // And so the card a file's inspector shows.
    const [file] = await artifactsOf(workspaces.get(OWNER) ?? "");
    if (!capped || !whole || !file) throw new Error("no module rows");
    expect(moduleCardForPath(capped, file.path)).toEqual(
      moduleCardForPath(whole, file.path),
    );
  });
});
