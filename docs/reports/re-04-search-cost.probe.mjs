// RE-04 — search cost and search quality on the pilot's own data, measured
// the same way before and after a change.
// Read-only: no network, model API, production database or repository writes.
//
//   node --import tsx docs/reports/re-04-search-cost.probe.mjs \
//     [--code <checkout>] [--dataset <commit>] [--max-rows 1000] \
//     [--runs 15] [--out <file>]
//
// The pilot workspace is this repository. The probe exports one fixed commit
// (default 488c0c4, RE-04's base) with `git archive`, scans it, and projects
// the plan through the production SQL (`apply_repository_scan`) into PGlite
// with every migration. The store and the tools are imported from `--code`
// (default: this checkout), so two checkouts can be measured on the same
// data. Every request goes through tests/helpers/postgrest-pglite.ts with
// PostgREST's db-max-rows (default 1,000, Supabase's default).
//
// What it can say: requests, rows and bytes per tool call, database time in
// PGlite, CPU time in this process, the longest chain of requests that wait
// on one another (`--latency` ms added per request, an assumption; the depth
// is the code's), and how often search puts the file a question names near
// the top — for three corpora drawn from the tree itself (exported
// identifiers, file names, Korean document titles) and one drawn from the
// section headings the read carries. Two simulations say what a change would
// do before it is made: ranking with no connectivity, and indexing document
// headings (the SQL writes them empty today); they touch only this local
// database.
//
// Timings are relative, on one machine — not production latency. What it
// cannot say: network, the hosted database, and every table a scan does not
// write (summaries, concepts, findings, evidence, receipts and memory are
// empty here).
import { execFileSync } from "node:child_process";
import { log } from "node:console";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { fileURLToPath, pathToFileURL, URL } from "node:url";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
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
const runs = Number(options.runs || 15);

const load = (path) => import(pathToFileURL(join(code, path)).href);
const { parseMarkdownStructure, scanRepository } = await load(
  "packages/core/src/index.ts",
);
const { createLocalRepositorySource } = await load(
  "packages/cli/src/local-source.ts",
);
const mcp = await load("packages/mcp/src/index.ts");
const { SupabaseMcpStore } = await load("apps/web/lib/mcp/supabase-store.ts");

const USER = "78000000-0000-4000-8000-0000000000f4";
const HOSTED = "packages/mcp/src/hosted.ts";

function percentile(values, share) {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  const at = Math.min(sorted.length - 1, Math.ceil(share * sorted.length) - 1);
  return Math.round(sorted[Math.max(0, at)] * 10) / 10;
}

// 1. The dataset: one commit's tree, scanned and projected by the SQL.
const tree = mkdtempSync(join(tmpdir(), "re04-dataset-"));
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
const count = async (sql) =>
  (await database.query(sql, [workspaceId])).rows[0].n;
const stored = {
  artifacts: await count(
    "select count(*)::int as n from public.artifacts where workspace_id = $1",
  ),
  edges: await count(
    "select count(*)::int as n from public.edges where workspace_id = $1",
  ),
  graphNodes: await count(
    "select count(*)::int as n from public.graph_nodes where workspace_id = $1 and kind <> 'symbol'",
  ),
  indexEntries: await count(
    "select count(*)::int as n from public.index_entries where workspace_id = $1",
  ),
  sections: await count(
    "select count(*)::int as n from public.sections where workspace_id = $1",
  ),
  symbols: await count(
    "select count(*)::int as n from public.symbols where workspace_id = $1",
  ),
};

// 2. The store under test, behind the real endpoint and the real client.
const emulator = postgrestOverPglite(database, {
  maxRows,
  role: "service_role",
});
const principal = {
  scopes: ["mcp:read"],
  tokenId: "01M00000000000000000000PRB",
  userId: USER,
  workspaceId,
};
class ProbeStore extends SupabaseMcpStore {
  async authenticateAccessToken() {
    return principal;
  }
  async recordAccessEvent() {}
  async publishAccessEvent() {}
}
const store = new ProbeStore(
  createClient("https://abcdefghijklmnopqrst.supabase.co", "probe", {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: emulator.fetch },
  }),
);
const endpoint = mcp.createHostedMcpEndpoint({ store });
const client = new Client(
  { name: "re-04-cost-probe", version: "1.0.0" },
  {
    cachePartition: "re-04-cost-probe",
    versionNegotiation: { mode: { pin: "2026-07-28" } },
  },
);
await client.connect(
  new StreamableHTTPClientTransport(new URL("https://mcp.alrescha.test/mcp"), {
    authProvider: { token: async () => "probe" },
    fetch: endpoint.fetch,
  }),
);

const hostedId = (
  await database.query(
    "select id from public.artifacts where workspace_id = $1 and path = $2",
    [workspaceId, HOSTED],
  )
).rows[0]?.id;
const CALLS = [
  [
    "search_index: export name",
    "search_index",
    { query: "createHostedMcpEndpoint" },
  ],
  ["search_index: word", "search_index", { query: "search" }],
  ["search_index: broad word", "search_index", { query: "symbol" }],
  ["search_index: Korean", "search_index", { query: "검색 정확성" }],
  ["get_artifact", "get_artifact", { path: HOSTED }],
  [
    "get_artifact + brief",
    "get_artifact",
    { include_change_brief: true, path: HOSTED },
  ],
  ["get_neighbors (file)", "get_neighbors", { node_id: hostedId }],
  ["impact_of (file)", "impact_of", { node_id: hostedId }],
];

const calls = [];
for (const [label, name, args] of CALLS) {
  const samples = [];
  for (let run = 0; run <= runs; run += 1) {
    const first = emulator.requests.length;
    const started = performance.now();
    const answer = await client.callTool({ arguments: args, name });
    const wall = performance.now() - started;
    const requests = emulator.requests.slice(first);
    samples.push({ answer, requests, wall });
  }
  const [cold, ...warm] = samples;
  const last = samples.at(-1);
  const byName = {};
  for (const request of last.requests) {
    const key = request.kind === "rpc" ? `rpc ${request.name}` : request.name;
    byName[key] ??= { bytes: 0, requests: 0, rows: 0 };
    byName[key].bytes += request.bytes;
    byName[key].requests += 1;
    byName[key].rows += request.rows ?? 0;
  }
  const structured = last.answer.structuredContent ?? {};
  calls.push({
    bytes: last.requests.reduce((sum, request) => sum + request.bytes, 0),
    byName: Object.fromEntries(
      Object.entries(byName).sort(
        ([, left], [, right]) => right.bytes - left.bytes,
      ),
    ),
    coldWallMs: Math.round(cold.wall),
    dbMs: {
      p50: percentile(
        warm.map(({ requests }) =>
          requests.reduce((sum, request) => sum + request.ms, 0),
        ),
        0.5,
      ),
      p95: percentile(
        warm.map(({ requests }) =>
          requests.reduce((sum, request) => sum + request.ms, 0),
        ),
        0.95,
      ),
    },
    failed: last.requests.filter(({ status }) => status !== 200).length,
    label,
    ok: last.answer.isError !== true,
    requests: last.requests.length,
    result:
      name === "search_index"
        ? {
            coverage: structured.coverage?.result ?? null,
            results: structured.results?.length ?? null,
            truncated: structured.truncated ?? null,
          }
        : null,
    wallMs: {
      p50: percentile(
        warm.map(({ wall }) => wall),
        0.5,
      ),
      p95: percentile(
        warm.map(({ wall }) => wall),
        0.95,
      ),
    },
  });
}
await client.close();

// 2b. Round trips on the critical path. The same calls through a second
// emulator that adds `--latency` ms to every request: concurrent requests
// wait together, so the extra wall time divided by the latency is the length
// of the longest chain of requests that had to wait for one another. The
// latency is an assumption; the depth is a property of the code.
const latency = Number(options.latency || 100);
const slow = postgrestOverPglite(database, {
  latencyMs: latency,
  maxRows,
  role: "service_role",
});
const slowStore = new ProbeStore(
  createClient("https://abcdefghijklmnopqrst.supabase.co", "probe", {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: slow.fetch },
  }),
);
const slowClient = new Client(
  { name: "re-04-cost-probe-slow", version: "1.0.0" },
  {
    cachePartition: "re-04-cost-probe-slow",
    versionNegotiation: { mode: { pin: "2026-07-28" } },
  },
);
await slowClient.connect(
  new StreamableHTTPClientTransport(new URL("https://mcp.alrescha.test/mcp"), {
    authProvider: { token: async () => "probe" },
    fetch: mcp.createHostedMcpEndpoint({ store: slowStore }).fetch,
  }),
);
for (const [index, [, name, args]] of CALLS.entries()) {
  const walls = [];
  for (let run = 0; run < 4; run += 1) {
    const started = performance.now();
    await slowClient.callTool({ arguments: args, name });
    if (run > 0) walls.push(performance.now() - started);
  }
  const wall = percentile(walls, 0.5);
  calls[index].critical = {
    latencyMs: latency,
    sequentialRequests: Math.round((wall - calls[index].wallMs.p50) / latency),
    simulatedWallMs: wall,
  };
}
await slowClient.close();

// 3. Where a search spends its CPU, on the workspace the store decodes.
const workspace = await store.loadWorkspace(principal);
const repository = workspace.repositories[0];
// Two variants of the same workspace. Measured against a checkout that
// ranks by edges (before 1928cd4), they are the comparison that chose the
// neighbour cache: no edges at all, and the cache standing in for them.
// Against a checkout that ranks by the cache they must equal the default
// ranking — the check that nothing a read carries decides the order.
const withoutEdges = {
  ...workspace,
  repositories: workspace.repositories.map((entry) => ({
    ...entry,
    edges: [],
  })),
};
const neighbourEdges = {
  ...workspace,
  repositories: workspace.repositories.map((entry) => ({
    ...entry,
    edges: entry.indexEntries.flatMap((index) =>
      index.neighborIds.map((target, at) => ({
        confidence: 1,
        family: "structure",
        id: `neighbour:${index.nodeId}:${at}`,
        provenance: {
          method: null,
          reason: "index neighbour cache",
          span: null,
        },
        relation: "references",
        sourceNodeId: index.nodeId,
        targetNodeId: target,
        tier: "resolved",
      })),
    ),
  })),
};
const cpu = [];
for (const [, name, args] of CALLS) {
  if (name !== "search_index") continue;
  const timed = (subject) => {
    const times = [];
    for (let run = 0; run < runs; run += 1) {
      const started = performance.now();
      mcp.searchWorkspaceIndexPage(subject, { query: args.query });
      times.push(performance.now() - started);
    }
    return { p50: percentile(times, 0.5), p95: percentile(times, 0.95) };
  };
  cpu.push({
    query: args.query,
    rankingMs: timed(workspace),
    neighbourGraphMs: timed(neighbourEdges),
    withoutEdgesMs: timed(withoutEdges),
  });
}

// 4. Quality: does search put the file a query names near the top?
const idByPath = new Map(
  repository.artifacts.map(({ id, path }) => [path, id]),
);
const every = (items, wanted) => {
  const step = Math.max(1, Math.floor(items.length / wanted));
  return items.filter((_, index) => index % step === 0).slice(0, wanted);
};
const barrel = (path) => /(^|\/)index\.[cm]?[jt]sx?$/.test(path);
const codeFiles = plan.artifacts.filter(
  ({ classification, path }) =>
    classification === "code_metadata" && !barrel(path),
);
const declared = new Map();
for (const artifact of codeFiles) {
  for (const { name } of artifact.exportedSymbols ?? []) {
    if (name === "default") continue;
    declared.set(name, [...(declared.get(name) ?? []), artifact.path]);
  }
}
const identifiers = every(
  [...declared]
    .filter(([name, paths]) => paths.length === 1 && name.length >= 6)
    .sort(([left], [right]) => left.localeCompare(right)),
  40,
).map(([query, paths]) => ({ expected: paths, query }));
const basenames = new Map();
for (const { path } of plan.artifacts) {
  const base = path
    .split("/")
    .at(-1)
    .replace(/\.[^.]+$/, "");
  if (base.length < 6) continue;
  basenames.set(base, [...(basenames.get(base) ?? []), path]);
}
const paths = every(
  [...basenames]
    .filter(([, list]) => list.length === 1)
    .sort(([left], [right]) => left.localeCompare(right)),
  40,
).map(([query, list]) => ({ expected: list, query }));
const hangul = /[\p{Script=Hangul}]/u;
const titles = [];
for (const { path } of plan.artifacts) {
  if (!/\.mdx?$/.test(path)) continue;
  const first = readFileSync(join(tree, path), "utf8")
    .split(/\r?\n/)
    .find((line) => line.startsWith("# "));
  if (!first || !hangul.test(first)) continue;
  titles.push({ path, title: first.slice(2) });
}
const korean = every(
  titles
    .map(({ path, title }) => {
      const words = title
        .split(/[\s·—:,()[\]`'"/|]+/)
        .filter((word) => hangul.test(word));
      return { path, query: words.slice(0, 2).join(" ") };
    })
    .filter(({ query }) => query.includes(" "))
    .sort((left, right) => left.path.localeCompare(right.path)),
  40,
).map(({ path, query }) => ({
  expected: titles
    .filter(({ title }) =>
      query.split(" ").every((word) => title.includes(word)),
    )
    .map((entry) => entry.path)
    .concat(path)
    .filter((value, index, all) => all.indexOf(value) === index),
  query,
}));

function quality(cases, subject = workspace) {
  const ranks = cases.map(({ expected, query }) => {
    const ids = new Set(
      expected.map((path) => idByPath.get(path)).filter(Boolean),
    );
    const page = mcp.searchWorkspaceIndexPage(subject, { limit: 100, query });
    const at = page.results.findIndex(({ nodeId }) => ids.has(nodeId));
    return {
      empty: page.results.length === 0,
      query,
      rank: at < 0 ? null : at + 1,
    };
  });
  const within = (limit) =>
    ranks.filter(({ rank }) => rank !== null && rank <= limit).length;
  return {
    cases: ranks.length,
    emptyResults: ranks.filter(({ empty }) => empty).length,
    hit1: within(1),
    hit5: within(5),
    hit20: within(20),
    mrr:
      Math.round(
        (ranks.reduce((sum, { rank }) => sum + (rank ? 1 / rank : 0), 0) /
          Math.max(1, ranks.length)) *
          1000,
      ) / 1000,
    missed: ranks.filter(({ rank }) => rank === null).map(({ query }) => query),
    ranks: ranks.map(({ query, rank }) => [query, rank]),
  };
}

/** How far the default page moves when the rerank is taken away. */
function overlap(queries, other = withoutEdges) {
  const measured = queries.map((query) => {
    const top = (subject) =>
      mcp
        .searchWorkspaceIndexPage(subject, { query })
        .results.map(({ nodeId }) => nodeId);
    const withRank = top(workspace);
    const without = top(other);
    const shared = withRank.filter((id) => without.includes(id)).length;
    const union = new Set([...withRank, ...without]).size;
    return {
      firstSame: withRank[0] === without[0],
      jaccard: union === 0 ? 1 : shared / union,
      orderSame: withRank.join() === without.join(),
      query,
    };
  });
  const mean =
    measured.reduce((sum, { jaccard }) => sum + jaccard, 0) /
    Math.max(1, measured.length);
  return {
    firstHitChanged: measured
      .filter(({ firstSame }) => !firstSame)
      .map(({ query }) => query),
    meanJaccard: Math.round(mean * 1000) / 1000,
    queries: measured.length,
    sameOrder: measured.filter(({ orderSame }) => orderSame).length,
    setChanged: measured
      .filter(({ jaccard }) => jaccard < 1)
      .map(({ query }) => query),
  };
}

// 5a. The sections the read already carries — the ADR/OQ/G/MT headings,
// which are mostly Korean here — as questions: two Hangul words of the
// heading, the token left out, answered by the document that declares it.
const sectionCases = every(
  (repository.sections ?? [])
    .map(({ heading, sourcePath, token }) => ({
      expected: [sourcePath],
      query: heading
        .replace(token, " ")
        .split(/[\s·—:,()[\]`'"/|]+/)
        .filter((word) => hangul.test(word))
        .slice(0, 2)
        .join(" "),
    }))
    .filter(({ query }) => query.includes(" "))
    .sort((left, right) => left.query.localeCompare(right.query)),
  40,
);
const sectionBaseline = quality(sectionCases);
// What search would find if a document's section headings were its index
// headings — what matching the carried sections at query time would do.
const sectionHeadings = new Map();
for (const section of repository.sections ?? []) {
  sectionHeadings.set(section.sourcePath, [
    ...(sectionHeadings.get(section.sourcePath) ?? []),
    section.heading,
  ]);
}
const withSections = {
  ...workspace,
  repositories: workspace.repositories.map((entry) => ({
    ...entry,
    indexEntries: entry.indexEntries.map((index) => ({
      ...index,
      headings: [...index.headings, ...(sectionHeadings.get(index.path) ?? [])],
    })),
  })),
};
const sectionSimulation = {
  identifiers: quality(identifiers, withSections),
  koreanTitles: quality(korean, withSections),
  paths: quality(paths, withSections),
  sections: quality(sectionCases, withSections),
};

// 5. A simulation, not the product: what search would find if the scan
// indexed document headings. The SQL writes `headings = '{}'` for every
// index entry today, so a document's own title is not searchable. Here the
// local database gets each Markdown file's H1 and H2 (the scanner's own
// parser), and the same questions are asked again.
for (const artifact of plan.artifacts) {
  if (!/.mdx?$/.test(artifact.path)) continue;
  const document = parseMarkdownStructure({
    path: artifact.path,
    source: readFileSync(join(tree, artifact.path), "utf8"),
  });
  const headings = document.headings
    .filter(({ depth }) => depth <= 2)
    .map(({ text }) => text.slice(0, 200))
    .slice(0, 40);
  if (headings.length === 0) continue;
  await database.query(
    "update public.index_entries set headings = $1::text[] where workspace_id = $2 and path = $3",
    [headings, workspaceId, artifact.path],
  );
}
const headed = await store.loadWorkspace(principal);
const withHeadings = {
  identifiers: quality(identifiers, headed),
  koreanTitles: quality(korean, headed),
  paths: quality(paths, headed),
};

const report = {
  code,
  sectionCorpus: {
    baseline: sectionBaseline,
    cases: sectionCases.length,
    korean: (repository.sections ?? []).filter(({ heading }) =>
      hangul.test(heading),
    ).length,
    stored: (repository.sections ?? []).length,
  },
  simulatedSectionMatch: sectionSimulation,
  simulatedHeadingIndex: {
    ...withHeadings,
    sections: quality(sectionCases, headed),
  },
  notes: [
    "Authentication is bypassed: production adds two sequential requests (token lookup, then the owner check) before every call.",
    "Timings are PGlite and this process on one machine; sizes and request counts are the portable numbers.",
    "Tables a scan does not write (summaries, concepts, findings, evidence, receipts, memory) are empty here.",
  ],
  dataset: { artifacts: plan.artifacts.length, commit: datasetCommit, stored },
  emulator: { maxRows, runs },
  calls,
  searchCpu: cpu,
  quality: {
    identifiers: quality(identifiers),
    koreanTitles: quality(korean),
    paths: quality(paths),
  },
  // The same corpus with no edges (see the variants above).
  qualityWithoutEdges: {
    identifiers: quality(identifiers, withoutEdges),
    koreanTitles: quality(korean, withoutEdges),
    paths: quality(paths, withoutEdges),
  },
  qualityNeighbourPpr: {
    identifiers: quality(identifiers, neighbourEdges),
    koreanTitles: quality(korean, neighbourEdges),
    paths: quality(paths, neighbourEdges),
  },
  neighbourOverlap: overlap(
    [
      ...CALLS.filter(([, name]) => name === "search_index").map(
        ([, , args]) => args.query,
      ),
      ...identifiers.map(({ query }) => query),
      ...paths.map(({ query }) => query),
    ],
    neighbourEdges,
  ),
  pprOverlap: overlap([
    ...CALLS.filter(([, name]) => name === "search_index").map(
      ([, , args]) => args.query,
    ),
    ...identifiers.map(({ query }) => query),
    ...paths.map(({ query }) => query),
  ]),
  corpus: { identifiers, koreanTitles: korean, paths },
  neighbourCacheEdges: neighbourEdges.repositories.reduce(
    (sum, entry) => sum + entry.edges.length,
    0,
  ),
  workspaceRead: {
    artifacts: repository.artifacts.length,
    coverage: workspace.coverage?.result ?? null,
    edges: repository.edges.length,
    indexEntries: repository.indexEntries.length,
    truncated: workspace.coverage?.truncated ?? [],
  },
};
await database.close();
rmSync(tree, { force: true, recursive: true });
if (options.out)
  writeFileSync(options.out, `${JSON.stringify(report, null, 1)}\n`);
log(JSON.stringify({ ...report, corpus: undefined }, null, 1));
