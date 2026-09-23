// RE-03 — the change-brief contract, produced rather than written.
// Read-only: no network, model API, database or repository writes.
// Run from the target checkout:
//   node --import tsx docs/reports/change-brief-contract.probe.mjs
//
// Every JSON block in CHANGE_BRIEF_CONTRACT.md is this script's output. The
// point is that the contract cannot claim a field the current types do not
// carry: each example is composed from a real `prepareChange` result over a
// real fixture, and anything the store does not supply shows up as null with
// a stated reason instead of as a plausible-looking value.
import { log } from "node:console";
import { URL } from "node:url";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

import { prepareChange } from "../../packages/mcp/src/prepare-change.ts";
import { impactOf } from "../../packages/mcp/src/graph-tools.ts";
import {
  createHostedMcpEndpoint,
  InMemoryMcpStore,
} from "../../packages/mcp/src/index.ts";
import { estimateTokens } from "../../packages/mcp/src/repo-map.ts";

const WORKSPACE = "01K200000000000000000000W1";
const USER = "10000000-0000-4000-8000-000000000001";
const REPO_A = "01K200000000000000000000R1";
const REPO_B = "01K200000000000000000000R2";
const CODE = "01K200000000000000000000A1";
const TEST = "01K200000000000000000000A2";
const CODE_B = "01K200000000000000000000B1";
const BLOB = "a".repeat(40);
const OLDER = "b".repeat(40);
const COMMIT = "c".repeat(40);

function edge(relation, source, target, tier = "resolved") {
  return {
    confidence: 1,
    family: relation === "tests" ? "evidence" : "structure",
    id: `${source}-${relation}-${target}`,
    provenance: {
      method: relation === "imports" ? "import-binding" : null,
      reason: relation === "imports" ? null : "fixture",
      span: null,
    },
    relation,
    sourceNodeId: source,
    targetNodeId: target,
    tier,
  };
}

function artifact(id, path, summaryState) {
  return {
    blobSha: BLOB,
    content: "",
    headings: [],
    id,
    kind: "code_metadata",
    path,
    status: "active",
    summary: "",
    ...(summaryState ? { summaryState } : {}),
    symbols:
      path === "src/session.ts"
        ? ["isSessionExpired", "SESSION_TIMEOUT_MS"]
        : [],
    tags: [],
    title: path,
  };
}

const CURRENT = {
  grade: "inferred",
  sourceBlobSha: BLOB,
  state: "current",
  text: "Session expiry helpers.",
};
const STALE = {
  currentBlobSha: BLOB,
  sourceBlobSha: OLDER,
  state: "stale",
  text: "the description of an older version",
};

function repository(id, fullName, summaryState, withBasis) {
  return {
    artifacts: [
      artifact(CODE, "src/session.ts", summaryState),
      artifact(TEST, "tests/session.test.ts", undefined),
    ],
    ...(withBasis
      ? {
          basis: {
            analyzedCommit: COMMIT,
            dataRevision: 42,
            graphGeneration: null,
            indexedCommit: COMMIT,
            repositoryId: id,
            stages: { analysis: "current", structure: "ready" },
          },
        }
      : {}),
    contextPacks: [],
    defaultBranch: "main",
    edges: [edge("tests", TEST, CODE), edge("imports", TEST, CODE)],
    evidence: [],
    findings: [],
    fullName,
    id,
    indexEntries: [],
    overview: "contract fixture",
    receipts: [],
    requirements: [],
  };
}

/** ⑴ One repository, a current description, a test that imports the target. */
const healthy = {
  id: WORKSPACE,
  ownerUserId: USER,
  repositories: [repository(REPO_A, "2klips/alrescha-app", CURRENT, true)],
};

/** ⑵ Two repositories answer to `src/session.ts`. Nobody picks. */
const ambiguous = {
  id: WORKSPACE,
  ownerUserId: USER,
  repositories: [
    repository(REPO_A, "2klips/alrescha-app", CURRENT, true),
    {
      ...repository(REPO_B, "2klips/other-app", CURRENT, true),
      artifacts: [artifact(CODE_B, "src/session.ts", CURRENT)],
      edges: [],
    },
  ],
};

/**
 * ⑶ The read stopped short: a capped edge table, a relation outside the
 * vocabulary, and prose written for an older blob. No basis row either — the
 * RPC is optional and a repository can arrive without one.
 */
const partial = {
  coverage: {
    readConsistency: "unproven",
    result: "partial",
    truncated: [{ limit: 2_000, table: "edges" }],
  },
  id: WORKSPACE,
  ownerUserId: USER,
  repositories: [
    {
      ...repository(REPO_A, "2klips/alrescha-app", STALE, false),
      edgeOmissions: [
        {
          count: 12,
          reason:
            "the directory hierarchy is excluded from graph answers until the tools can filter it (todo 22)",
          relation: "contains",
        },
      ],
    },
  ],
};

/**
 * The brief as `prepareChange` actually builds it (RE-03 ⑶b, R-01, R-02).
 *
 * In 03a this function composed a *proposed* shape by hand, because the
 * implementation did not exist yet. It exists now, so the examples come
 * from the implementation itself — a contract document whose examples were
 * written separately from the code would drift from it the first time
 * either changed. `impactOf` is called here only to show what the brief
 * reports from it; the brief itself calls it once.
 */
function compose(workspace, selector, label) {
  const brief = prepareChange(workspace, selector);
  const report = brief.target.nodeId
    ? impactOf(workspace, brief.target.nodeId, 2, "dependency-impact")
    : null;
  return {
    brief,
    example: label,
    // What impact_of answers that the brief still leaves out, so the gap is
    // stated rather than implied: `affectedRoutes` (contract §7 ⑵).
    notCarried: report ? { affectedRoutes: report.affectedRoutes } : null,
  };
}

/**
 * The served catalogue, as it stands.
 *
 * In 03a this measured a hypothetical: the catalogue with one optional
 * boolean added to `get_artifact` (3,131 → 3,141). 03b added exactly that
 * field, so widening the real schema again would measure nothing. What is
 * left to report is the current size against the ratchet; the before/after
 * history lives in the contract document.
 */
async function catalogueCost() {
  const store = new InMemoryMcpStore({
    workspaces: [{ id: WORKSPACE, ownerUserId: USER, repositories: [] }],
  });
  const issued = await store.issueAccessToken({
    actorUserId: USER,
    name: "RE-03 contract probe",
    scopes: ["mcp:read"],
    workspaceId: WORKSPACE,
  });
  const endpoint = createHostedMcpEndpoint({ store });
  const client = new Client(
    { name: "re-03-contract-probe", version: "1.0.0" },
    {
      cachePartition: issued.secret.slice(0, 12),
      versionNegotiation: { mode: { pin: "2026-07-28" } },
    },
  );
  await client.connect(
    new StreamableHTTPClientTransport(new URL("https://mcp.alrescha.test/mcp"), {
      authProvider: { token: async () => issued.secret },
      fetch: endpoint.fetch,
    }),
  );
  const listed = await client.listTools();
  const tokens = estimateTokens(JSON.stringify(listed.tools));
  const artifactTool = listed.tools.find(({ name }) => name === "get_artifact");
  await client.close();
  return {
    catalogueRatchet: 3_150,
    getArtifactHasOptIn: Object.keys(
      artifactTool?.inputSchema.properties ?? {},
    ).includes("include_change_brief"),
    tokens,
    toolCount: listed.tools.length,
  };
}

const payload = {
  scope:
    "synthetic contract fixtures; not a latency, accuracy or production measurement",
  examples: [
    compose(healthy, { path: "src/session.ts" }, "normal"),
    compose(ambiguous, { path: "src/session.ts" }, "ambiguous-target"),
    compose(partial, { path: "src/session.ts" }, "partial-result"),
  ],
  catalogue: await catalogueCost(),
};

log(JSON.stringify(payload, null, 2));
