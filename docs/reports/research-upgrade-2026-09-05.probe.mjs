/**
 * Read-only research probes; NOT a product regression suite or a live DB test.
 * Run from app: node --import tsx docs/reports/research-upgrade-2026-09-05.probe.mjs
 * Optional first argument: another repository checkout to inspect.
 * The REST stub deliberately models config.toml's 1,000-row response ceiling.
 * No network, database writes, model calls, or filesystem writes.
 */
import assert from "node:assert/strict";
import console from "node:console";
import { resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const sourceRoot = resolve(process.argv[2] ?? process.cwd());
const source = (path) => pathToFileURL(resolve(sourceRoot, path)).href;
const { impactOf, tracePath } = await import(
  source("packages/mcp/src/graph-tools.ts")
);
const { SupabaseMcpStore } = await import(
  source("apps/web/lib/mcp/supabase-store.ts")
);

const artifact = (id) => ({
  id,
  path: `${id}.ts`,
  content: "",
  summary: "",
  kind: "code_metadata",
  headings: [],
  symbols: [],
  tags: [],
  title: id,
  status: "active",
  blobSha: "",
});
const edge = (sourceNodeId, targetNodeId, relation) => ({
  sourceNodeId,
  targetNodeId,
  relation,
});
const workspace = (edges) => ({
  id: "w",
  ownerUserId: "u",
  repositories: [
    {
      id: "r",
      artifacts: ["A", "B", "C", "README"].map(artifact),
      requirements: [],
      evidence: [],
      findings: [],
      receipts: [],
      contextPacks: [],
      edges,
    },
  ],
});

const commonDependency = workspace([
  edge("A", "B", "imports"),
  edge("C", "B", "imports"),
]);
const sharedDocument = workspace([
  edge("README", "A", "references"),
  edge("README", "C", "references"),
]);
const dependencyImpact = impactOf(commonDependency, "A", 2);
const documentImpact = impactOf(sharedDocument, "A", 2);
const documentPath = tracePath(sharedDocument, "A", "C", 6);
assert.deepEqual(dependencyImpact.transitiveNodeIds, ["C"]);
assert.deepEqual(documentImpact.transitiveNodeIds, ["C"]);
assert.deepEqual(documentPath.nodeIds, ["A", "README", "C"]);

const apiRowCap = 1000;
const storedArtifacts = Array.from({ length: 1001 }, (_, index) => ({
  id: `file-${index}`,
  repository_id: "r",
  path: `src/file-${index}.ts`,
  kind: "code_metadata",
  source_blob_sha: "new-blob",
  metadata: { summary: "summary from old-blob", summaryBlobSha: "old-blob" },
}));
const tables = {
  repositories: [
    { id: "r", full_name: "fixture/repository", default_branch: "main" },
  ],
  graph_nodes: storedArtifacts.map(({ id, path }) => ({ id, label: path })),
  artifacts: storedArtifacts,
  edges: [
    {
      id: "e",
      repository_id: "r",
      source_node_id: "file-0",
      target_node_id: "file-1",
      relation: "imports",
      family: "code",
      confidence: 1,
      provenance: { tier: "resolved", reason: "fixture import resolution" },
    },
  ],
};
const queryLog = [];
const client = {
  from(table) {
    const operations = [];
    queryLog.push({ table, operations });
    const query = {
      select(...args) {
        operations.push(["select", ...args]);
        return query;
      },
      eq(...args) {
        operations.push(["eq", ...args]);
        return query;
      },
      is(...args) {
        operations.push(["is", ...args]);
        return query;
      },
      order(...args) {
        operations.push(["order", ...args]);
        return query;
      },
      range(...args) {
        operations.push(["range", ...args]);
        return query;
      },
      then(fulfilled, rejected) {
        const rows = tables[table] ?? [];
        const range = operations.find(([name]) => name === "range");
        const start = range?.[1] ?? 0;
        const end = Math.min(
          range?.[2] ?? start + apiRowCap - 1,
          start + apiRowCap - 1,
        );
        return Promise.resolve({
          data: rows.slice(start, end + 1),
          error: null,
        }).then(fulfilled, rejected);
      },
    };
    return query;
  },
};
const loaded = await new SupabaseMcpStore(client).loadWorkspace({
  workspaceId: "w",
  userId: "u",
});
const first = loaded.repositories[0].artifacts[0];
const loadedEdge = loaded.repositories[0].edges[0];
assert.equal(first.blobSha, "new-blob");
assert.equal(first.content, "summary from old-blob");
assert.equal(loaded.repositories[0].artifacts.length, 1000);
assert.equal(
  queryLog.some(({ operations }) =>
    operations.some(([name]) => name === "range"),
  ),
  false,
);
assert.equal(Object.hasOwn(loadedEdge, "provenance"), false);

console.log(
  JSON.stringify(
    {
      sourceRoot,
      scope:
        "Actual graph functions + actual loader with a synthetic, capped REST stub; not a live database",
      impact: {
        commonDependency: {
          edges: commonDependency.repositories[0].edges,
          impactOfA: dependencyImpact,
        },
        sharedDocument: {
          edges: sharedDocument.repositories[0].edges,
          impactOfA: documentImpact,
          pathAtoC: documentPath,
        },
        interpretation:
          "Undirected neighborhoods are valid discovery results, but are not causal blast radius.",
      },
      loader: {
        apiRowCap,
        storedArtifactCount: storedArtifacts.length,
        returnedArtifactCount: loaded.repositories[0].artifacts.length,
        queryCount: queryLog.length,
        paginationRequested: queryLog.some(({ operations }) =>
          operations.some(([name]) => name === "range"),
        ),
        freshBlobSha: first.blobSha,
        servedSummary: first.content,
        storedSummaryBlobSha: storedArtifacts[0].metadata.summaryBlobSha,
        exposedFreshness: Object.keys(first).filter((key) =>
          /fresh|stale|summaryBlob/i.test(key),
        ),
        storedEdgeFields: Object.keys(tables.edges[0]),
        returnedEdgeFields: Object.keys(loadedEdge),
      },
      result:
        "All baseline-observation assertions passed. These assert existing behavior, not desired behavior.",
    },
    null,
    2,
  ),
);
