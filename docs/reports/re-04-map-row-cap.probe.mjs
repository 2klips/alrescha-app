// RE-04 map — what the map draws, and what reading it costs, when PostgREST
// stops every answer at its row cap. Measured on the pilot's own data, the
// same way before and after a change.
// Read-only: no network, model API, production database or repository writes.
//
//   node --import tsx docs/reports/re-04-map-row-cap.probe.mjs \
//     [--code <checkout>] [--dataset <commit>] [--max-rows 1000] \
//     [--latency 1000] [--runs 5] [--out <file>]
//
// The pilot workspace is this repository. The probe exports one fixed commit
// (default 488c0c4, the production web of 2026-09-24) with `git archive`,
// scans it, and projects the plan through the production SQL
// (`apply_repository_scan`) into PGlite with every migration. The map loader
// and the symbol layer are imported from `--code` (default: this checkout),
// so two checkouts can be measured on the same data; the emulator is always
// this checkout's (tests/helpers/postgrest-pglite.ts), read as the signed-in
// owner under row security, with PostgREST's db-max-rows (default 1,000,
// Supabase's default and `supabase/config.toml`'s).
//
// What it can say: what the map draws under the cap and with none — nodes,
// edges, the counts and HUD chips the screen shows — and per load the
// requests, rows and bytes by table, database time in PGlite, and the longest
// chain of requests that wait on one another (`--latency` ms added per
// request; the depth is the code's, and a latency well above the database
// time — the default 1,000 — keeps PGlite's own queueing out of it). The
// same for the largest symbol halo a file of the dataset has, and for the
// rows the inspector's module card is computed from (a checkout from before
// `readModuleCardInputs` read those inside its route: reported as null).
//
// Timings are relative, on one machine — not production latency. What it
// cannot say: network, the hosted database or its `max_rows`, and every
// table a scan does not write (requirements, evidence, findings, concepts,
// tokens and assertions are empty here, so their reads are one short page).
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { log } from "node:console";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { fileURLToPath, pathToFileURL, URL } from "node:url";
import { createClient } from "@supabase/supabase-js";

import {
  ALL_MIGRATIONS,
  createTestDatabase,
} from "../../tests/helpers/database.ts";
import { postgrestOverPglite } from "../../tests/helpers/postgrest-pglite.ts";

/** `--name value` pairs; a value may itself contain `--`. */
const options = {};
for (let at = 2; at < process.argv.length; at += 2) {
  const key = process.argv[at] ?? "";
  if (!key.startsWith("--")) throw new Error(`expected --option, got ${key}`);
  options[key.slice(2)] = process.argv[at + 1] ?? "";
}
const here = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const code = resolve(options.code || here);
const datasetCommit =
  options.dataset || "488c0c4f3da765ee90c2cdd7b72ec8020d77bc9e";
const maxRows = Number(options["max-rows"] || 1_000);
const latency = Number(options.latency || 1_000);
const runs = Number(options.runs || 5);

const load = (path) => import(pathToFileURL(join(code, path)).href);
const { scanRepository } = await load("packages/core/src/index.ts");
const { createLocalRepositorySource } = await load(
  "packages/cli/src/local-source.ts",
);
const { loadWorkspaceMap } = await load("apps/web/lib/map/workspace-map.ts");
const { readSymbolLayer } = await load("apps/web/lib/map/symbol-layer.ts");
const { readModuleCardInputs } = await load(
  "apps/web/lib/map/module-rows.ts",
).catch(() => ({ readModuleCardInputs: null }));

const USER = "78000000-0000-4000-8000-0000000000f5";
const NOW = Date.parse("2026-09-24T12:00:00.000Z");

function percentile(values, share) {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  const at = Math.min(sorted.length - 1, Math.ceil(share * sorted.length) - 1);
  return Math.round(sorted[Math.max(0, at)] * 10) / 10;
}

// 1. The dataset: one commit's tree, scanned and projected by the SQL.
const tree = mkdtempSync(join(tmpdir(), "re04-map-dataset-"));
execFileSync("git", [
  "-C",
  here,
  "archive",
  "--format=tar",
  "-o",
  join(tree, "tree.tar"),
  datasetCommit,
]);
// Relative, because a GNU tar reads `C:` in an absolute path as a host.
execFileSync("tar", ["-xf", "tree.tar"], { cwd: tree });
rmSync(join(tree, "tree.tar"));

const database = await createTestDatabase([...ALL_MIGRATIONS]);
await database.query(
  "insert into auth.users (id, email) values ($1, 'probe@example.test')",
  [USER],
);
const workspaceId = (await database.query("select id from public.workspaces"))
  .rows[0].id;
const repositoryId = (
  await database.query("select public.ensure_local_repository($1, $2) as id", [
    workspaceId,
    "2klips/alrescha-app",
  ])
).rows[0].id;
const { commitSha, source } = await createLocalRepositorySource(tree);
const plan = await scanRepository({ commitSha, mode: "full", source });
await database.query("select public.apply_repository_scan($1, $2, $3::jsonb)", [
  workspaceId,
  repositoryId,
  JSON.stringify(plan),
]);
rmSync(tree, { force: true, recursive: true });

const stored = async (sql) =>
  (await database.query(sql, [workspaceId])).rows[0]?.n ?? 0;
const dataset = {
  artifacts: await stored(
    "select count(*)::int as n from public.artifacts where workspace_id = $1",
  ),
  commit: datasetCommit,
  edgesByFamily: Object.fromEntries(
    (
      await database.query(
        `select family, count(*)::int as n from public.edges
         where workspace_id = $1 group by family order by family`,
        [workspaceId],
      )
    ).rows.map(({ family, n }) => [family, n]),
  ),
  nodes: await stored(
    "select count(*)::int as n from public.graph_nodes where workspace_id = $1 and kind not in ('symbol', 'finding')",
  ),
  symbols: await stored(
    "select count(*)::int as n from public.symbols where workspace_id = $1",
  ),
};

function session(cap, latencyMs) {
  const emulator = postgrestOverPglite(database, {
    ...(cap === null ? {} : { maxRows: cap }),
    ...(latencyMs ? { latencyMs } : {}),
    role: "authenticated",
    userId: USER,
  });
  const client = createClient(
    "https://abcdefghijklmnopqrst.supabase.co",
    "probe",
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: emulator.fetch },
    },
  );
  return { client, emulator };
}

/**
 * What the screen shows from a model, and the model's size as JSON — the
 * page serialises it, so this is what a bigger map costs the page, give or
 * take the framework's encoding.
 */
function drawn(model) {
  return {
    artifacts: model.counts.artifacts,
    coverage: model.hud.coverage,
    edges: model.graph.edges.length,
    modelBytes: Buffer.byteLength(JSON.stringify(model)),
    nodes: model.graph.nodes.length,
    openFindings: model.hud.openFindings,
    riskRanked: model.hud.risk?.ranked ?? null,
    unknownNodes: model.graph.nodes.filter(({ type }) => type === "unknown")
      .length,
  };
}

function cost(requests) {
  const byTable = {};
  for (const request of requests) {
    byTable[request.name] ??= { bytes: 0, requests: 0, rows: 0 };
    byTable[request.name].bytes += request.bytes;
    byTable[request.name].requests += 1;
    byTable[request.name].rows += request.rows ?? 0;
  }
  return {
    bytes: requests.reduce((sum, request) => sum + request.bytes, 0),
    byTable: Object.fromEntries(
      Object.entries(byTable).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
    failed: requests.filter(({ status }) => status !== 200).length,
    largestPage: Math.max(0, ...requests.map(({ rows }) => rows ?? 0)),
    requests: requests.length,
    rows: requests.reduce((sum, request) => sum + (request.rows ?? 0), 0),
  };
}

/**
 * `runs` warm loads after one cold one, then the same through an emulator
 * that adds `latency` ms per request: concurrent requests wait together, so
 * the extra wall time over the latency is the longest chain of requests that
 * waited on one another.
 */
async function measure(label, read) {
  const { client, emulator } = session(maxRows, 0);
  const samples = [];
  for (let run = 0; run <= runs; run += 1) {
    const first = emulator.requests.length;
    const started = performance.now();
    const answer = await read(client);
    samples.push({
      answer,
      requests: emulator.requests.slice(first),
      wall: performance.now() - started,
    });
  }
  const [cold, ...warm] = samples;
  const last = samples.at(-1);
  const slow = session(maxRows, latency);
  const slowWalls = [];
  for (let run = 0; run < 3; run += 1) {
    const started = performance.now();
    await read(slow.client);
    if (run > 0) slowWalls.push(performance.now() - started);
  }
  const wallP50 = percentile(
    warm.map(({ wall }) => wall),
    0.5,
  );
  const slowWall = percentile(slowWalls, 0.5);
  return {
    answer: last.answer,
    cold: Math.round(cold.wall),
    cost: cost(last.requests),
    critical: {
      latencyMs: latency,
      sequentialRequests: Math.round((slowWall - wallP50) / latency),
      simulatedWallMs: slowWall,
    },
    dbMs: percentile(
      warm.map(({ requests }) =>
        requests.reduce((sum, request) => sum + request.ms, 0),
      ),
      0.5,
    ),
    label,
    wallMs: {
      p50: wallP50,
      p95: percentile(
        warm.map(({ wall }) => wall),
        0.95,
      ),
    },
  };
}

// 2. The map: under the cap, and with none.
const map = await measure("loadWorkspaceMap", (client) =>
  loadWorkspaceMap(client, USER, NOW),
);
const whole = await loadWorkspaceMap(session(null, 0).client, USER, NOW);

// 3. The largest symbol halo a file of the dataset has.
const crowded = (
  await database.query(
    `select artifact_id, count(*)::int as n from public.symbols
     where workspace_id = $1
     group by artifact_id order by n desc, artifact_id limit 1`,
    [workspaceId],
  )
).rows[0];
const halo = crowded
  ? await measure("readSymbolLayer", (client) =>
      readSymbolLayer(client, [crowded.artifact_id]),
    )
  : null;

// 4. The rows a selected file's module card is computed from.
const moduleRows = readModuleCardInputs
  ? await measure("readModuleCardInputs", (client) =>
      readModuleCardInputs(client, repositoryId),
    )
  : null;
const moduleStored = {
  edges: (
    await database.query(
      `select count(*)::int as n from public.edges
       where repository_id = $1 and relation in ('imports', 'calls')`,
      [repositoryId],
    )
  ).rows[0].n,
  files: (
    await database.query(
      "select count(*)::int as n from public.artifacts where repository_id = $1",
      [repositoryId],
    )
  ).rows[0].n,
};

await database.close();

const report = {
  code,
  dataset,
  halo: halo
    ? {
        cold: halo.cold,
        cost: halo.cost,
        critical: halo.critical,
        dbMs: halo.dbMs,
        edges: halo.answer.edges.length,
        storedSymbols: crowded.n,
        symbols: halo.answer.symbols.length,
        truncated: halo.answer.truncated,
        wallMs: halo.wallMs,
      }
    : null,
  map: {
    capped: drawn(map.answer),
    cold: map.cold,
    cost: map.cost,
    critical: map.critical,
    dbMs: map.dbMs,
    whole: drawn(whole),
    wallMs: map.wallMs,
  },
  maxRows,
  module: {
    read: moduleRows
      ? {
          cold: moduleRows.cold,
          cost: moduleRows.cost,
          critical: moduleRows.critical,
          dbMs: moduleRows.dbMs,
          edges: moduleRows.answer?.edges.length ?? null,
          files: moduleRows.answer?.artifacts.length ?? null,
          wallMs: moduleRows.wallMs,
        }
      : null,
    stored: moduleStored,
  },
  runs,
};

const json = JSON.stringify(report, null, 2);
if (options.out) writeFileSync(options.out, `${json}\n`);
log(json);
