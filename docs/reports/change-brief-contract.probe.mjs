// RE-03 ⑶a — the change-brief contract, produced rather than written.
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
 * The proposed composition, computed here and NOT in the product source —
 * 03a is the contract, 03b is the implementation. Every value below is read
 * off the existing types; nothing is invented.
 */
function compose(workspace, selector, label) {
  const brief = prepareChange(workspace, selector);
  const repositories = workspace.repositories;
  // The same call `prepareChange` makes internally, kept here so the
  // contract can show what the brief drops on the floor today.
  const report = brief.target.nodeId
    ? impactOf(workspace, brief.target.nodeId, 2, "dependency-impact")
    : null;
  const holder =
    repositories.find((repo) =>
      repo.artifacts.some(({ id }) => id === brief.target.nodeId),
    ) ?? null;
  const basis = holder?.basis ?? null;
  const row = holder?.artifacts.find(({ id }) => id === brief.target.nodeId);

  // `impactOf` carries the evidence grade and the bound; `ChangeBrief` drops
  // both today. The contract keeps them, because "12 consumers" assembled
  // from resolved import edges and from one an agent asserted by hand are
  // not the same claim.
  const body = brief.target.card
    ? estimateTokens(JSON.stringify(brief.target.card))
    : 0;

  const composed = {
    basis:
      basis === null
        ? {
            available: false,
            reason:
              "no read basis accompanied this repository; commit and revision cannot be stated",
          }
        : {
            analyzedCommit: basis.analyzedCommit,
            available: true,
            dataRevision: basis.dataRevision,
            // Typed `null` at the source: there is no immutable generation
            // to name, so none is named.
            graphGeneration: basis.graphGeneration,
            indexedCommit: basis.indexedCommit,
            readConsistency: workspace.coverage?.readConsistency ?? "unproven",
            repositoryFullName: holder?.fullName ?? null,
            repositoryId: basis.repositoryId,
            stages: basis.stages,
          },
    budget: {
      approach:
        "one token per four UTF-16 characters of the serialised value; an approximation, not a provider's billed count",
      targetCardTokens: body,
      truncatedItems: [],
    },
    consumers:
      brief.consumers === null
        ? null
        : {
            // Read from the impact report, NOT from `dependencyImpact.complete`.
            // `complete` says only that the walk ran out of graph; it knows
            // nothing about a capped table or a dropped relation, so a brief
            // over a truncated read currently presents its consumer list as
            // the whole answer. `bound` is the field that accounts for all
            // three.
            bound: report?.bound ?? null,
            boundReasons: report?.boundReasons ?? [],
            confidence: report?.confidence ?? null,
            candidates: brief.consumers.candidates.map((candidate) => ({
              distance: candidate.distance,
              nodeId: candidate.nodeId,
              path: candidate.path,
              via: candidate.via.map((ref) => ({
                provenance: ref.provenance,
                relation: ref.relation,
                tier: ref.tier,
              })),
            })),
            relatedTests: brief.consumers.relatedTests,
            stoppedBy: brief.consumers.stoppedBy,
          },
    missing: brief.missing,
    omissions: brief.omissions,
    target:
      brief.target.nodeId === null
        ? {
            ambiguous: true,
            nodeId: null,
            path: brief.target.path,
          }
        : {
            ambiguous: false,
            freshness: brief.target.card?.summary.state ?? null,
            nodeId: brief.target.nodeId,
            path: brief.target.path,
            sourceDigest: row?.blobSha ?? null,
          },
  };
  return {
    current: brief,
    dropped: report
      ? {
          affectedRoutes: report.affectedRoutes,
          bound: report.bound,
          boundReasons: report.boundReasons,
          confidence: report.confidence,
        }
      : null,
    example: label,
    proposed: composed,
  };
}

/**
 * What an explicit opt-in on `get_artifact` would cost the catalogue, if the
 * pack's selection turns out not to name a target reliably.
 *
 * Measured against the **real** advertised catalogue, not a hand-written
 * approximation of it: the served `tools/list` payload, then the same
 * payload with one optional boolean added to `get_artifact`'s real schema.
 * OQ-059 is a token budget, so a proposal without a number is not a proposal.
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
  const without = estimateTokens(JSON.stringify(listed.tools));
  const widened = listed.tools.map((tool) =>
    tool.name === "get_artifact"
      ? {
          ...tool,
          inputSchema: {
            ...tool.inputSchema,
            properties: {
              ...tool.inputSchema.properties,
              include_change_brief: {
                type: "boolean",
              },
            },
          },
        }
      : tool,
  );
  const with_ = estimateTokens(JSON.stringify(widened));
  await client.close();
  return {
    catalogueRatchet: 3_150,
    delta: with_ - without,
    note: "served tools/list, then the same payload with one optional boolean added to get_artifact's real schema",
    toolCount: listed.tools.length,
    with: with_,
    without,
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
  optInCost: await catalogueCost(),
};

log(JSON.stringify(payload, null, 2));
