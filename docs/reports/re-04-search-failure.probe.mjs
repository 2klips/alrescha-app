// RE-04 — what one `search_index` call asked the database for, reproduced.
// Read-only: no network, model API, database or repository writes.
// Run from the target checkout:
//   node --import tsx docs/reports/re-04-search-failure.probe.mjs
//
// The pilot workspace is this repository, so its symbol layer can be rebuilt
// here without reading production: a full local scan, the local projection
// the SQL is tested against, and the real `searchWorkspaceIndexPage`. For
// each query the probe follows `symbolHitsFor` in `hosted.ts` to the files it
// would have read symbols for, counts their symbols, and asks the real
// postgrest-js builder how long the request URL would be. Nothing is sent:
// a builder's URL exists before it is awaited.
import { log } from "node:console";
import { resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { createClient } from "@supabase/supabase-js";

import { scanRepository } from "../../packages/core/src/index.ts";
import { createLocalRepositorySource } from "../../packages/cli/src/local-source.ts";
import {
  buildLocalWorkspace,
  searchWorkspaceIndexPage,
} from "../../packages/mcp/src/index.ts";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
// Production ids are ULIDs; only their length matters to a URL.
const ULID = (n) => `01M${String(n).padStart(23, "0")}`;
const WORKSPACE = ULID(0);
// A Supabase project host is `<20-character ref>.supabase.co`.
const client = createClient("https://abcdefghijklmnopqrst.supabase.co", "k", {
  auth: { autoRefreshToken: false, persistSession: false },
});
const EDGE_COLUMNS =
  "id, source_node_id, target_node_id, relation, family, confidence, provenance";

const SYMBOL_COLUMNS =
  "id, repository_id, artifact_id, path, container, kind, name, start_line, end_line, engine, stable_key";
/** Ids per filter list after RE-04 (`apps/web/lib/supabase/id-batches.ts`). */
const BATCH = 60;

/** The edge request over `seedCount` symbols, unsent. */
function edgeRequestLength(seedCount, offset = 1) {
  const list = Array.from({ length: seedCount }, (_, at) =>
    ULID(offset + at),
  ).join(",");
  const builder = client
    .from("symbol_edges")
    .select(EDGE_COLUMNS)
    .eq("workspace_id", WORKSPACE)
    .or(`source_node_id.in.(${list}),target_node_id.in.(${list})`)
    .order("id", { ascending: true })
    .limit(20_001);
  return builder.url.toString().length;
}

/** After: the one `symbols` request a search makes for its hit files. */
function fileSymbolRequestLength(fileCount) {
  const files = Array.from({ length: Math.min(fileCount, BATCH) }, (_, at) =>
    ULID(90_000 + at),
  );
  const builder = client
    .from("symbols")
    .select(SYMBOL_COLUMNS)
    .eq("workspace_id", WORKSPACE)
    .in("artifact_id", files)
    .order("id", { ascending: true })
    .limit(5_001);
  return builder.url.toString().length;
}

const { commitSha, source } = await createLocalRepositorySource(root);
const plan = await scanRepository({ commitSha, mode: "full", source });
const workspace = buildLocalWorkspace({
  plan,
  repositoryFullName: "2klips/alrescha-app",
});
const repository = workspace.repositories[0];
const symbols = repository.symbols ?? [];
const symbolsByFile = new Map();
for (const symbol of symbols) {
  symbolsByFile.set(
    symbol.artifactNodeId,
    (symbolsByFile.get(symbol.artifactNodeId) ?? 0) + 1,
  );
}

const QUERIES = [
  // The form the symbol handoff asked the check to use: one export name.
  "createHostedMcpEndpoint",
  "searchWorkspaceIndexPage",
  "prepareChange",
  "SupabaseMcpStore",
  "impactOf",
  // Words a person would type.
  "search",
  "store",
  "symbol",
  "edge",
  "receipt",
  "auth",
  "검색",
];

const rows = QUERIES.map((query) => {
  const page = searchWorkspaceIndexPage(workspace, { query });
  // `symbolHitsFor`, to the point where it calls the store.
  const tokens = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}_]+/u)
    .filter((token) => token.length > 0);
  const byNode = new Set();
  for (const entry of repository.indexEntries) {
    if (
      entry.symbols.some((name) =>
        tokens.some((token) => name.toLowerCase().includes(token)),
      )
    ) {
      byNode.add(entry.nodeId);
    }
  }
  const fileIds = page.results
    .filter((hit) => hit.type === "artifact" && byNode.has(hit.nodeId))
    .map((hit) => hit.nodeId);
  const seeds = fileIds.reduce(
    (sum, id) => sum + (symbolsByFile.get(id) ?? 0),
    0,
  );
  return {
    query,
    hits: page.results.length,
    symbolFiles: fileIds.length,
    heaviestFile:
      fileIds
        .map((id) => [id.replace(/^artifact:/, ""), symbolsByFile.get(id) ?? 0])
        .sort((left, right) => right[1] - left[1])[0] ?? null,
    seeds,
    // Before (47b32d2): one edge request over every seed.
    edgeUrlChars: seeds === 0 ? 0 : edgeRequestLength(seeds),
    // After: the search asks for its hit files' symbols and no edge; the
    // neighbourhood and the map ask for edges sixty symbols at a time.
    after: {
      searchRequests: Math.ceil(fileIds.length / BATCH),
      searchUrlChars:
        fileIds.length === 0 ? 0 : fileSymbolRequestLength(fileIds.length),
      edgeBatches: Math.ceil(seeds / BATCH),
      edgeBatchUrlChars:
        seeds === 0 ? 0 : edgeRequestLength(Math.min(seeds, BATCH)),
    },
  };
});

log(
  JSON.stringify(
    {
      scan: {
        artifacts: repository.artifacts.length,
        commit: commitSha,
        filesWithSymbols: symbolsByFile.size,
        symbols: symbols.length,
      },
      postgrestJsWarnsAboveChars: 8_000,
      queries: rows,
    },
    null,
    1,
  ),
);
