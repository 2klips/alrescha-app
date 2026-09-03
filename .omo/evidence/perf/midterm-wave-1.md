# Perf research — mid-term wave 1: selection

Source: performance research report of 2026-08-27 (adversarially verified,
39 findings confirmed / 0 refuted), artifact
`https://claude.ai/code/artifact/82fa6f21-64c7-4373-b43b-5b1949eba7e1`.
All 17 quick wins are shipped (`git log --grep QW` → `3e38ed4`, `4d09775`,
`f78b0d7`, `a49b2ff`, `3c9923a`).

This file is written **before** any code changes, as the wave's selection
record. Measurements land in the sibling `mt-*.md` files.

Measurement host for this whole wave (same machine as
`.omo/evidence/phase2a/task-9.md`, so its recorded numbers stay comparable):

| | |
| --- | --- |
| CPU | AMD Ryzen 7 9800X3D, 8C/16T |
| RAM | 61.6 GB |
| Node | v24.14.0 |
| OS | Windows 11 (10.0.26200) |
| pnpm | 9.0.0 |

---

## 1. The 12 mid-term items

Impact wording follows the repository rule *no efficiency numbers without
measurement*: the report quotes only numbers already recorded in this
repository, so every "impact" below is the report's **qualitative** claim
unless a measured figure is cited. Nothing here is an estimate dressed as a
measurement.

| ID | Item | Impact as stated by the report | Depends on / blocked by |
| --- | --- | --- | --- |
| MT-1 | GitHub installation-token TTL + narrow the `readSource` catch to 404 | Correctness first: an expired token read as "file deleted" mass-auto-resolves real findings. Also removes a retry storm. | GitHub App credentials + >1h uptime to observe in production. **Already shipped** — `ef15ff5`, `apps/worker/src/source-cache.ts`. |
| MT-2 | Bounded parallelism for enrich + concept synthesis | Cuts first-enrich wall time by the concurrency factor; multiplies with QW-3. | AI provider credentials for a real measurement; rate-limit headroom. |
| MT-3 | Two-phase scan content fetch with bounded concurrency | Cuts onboarding first-scan wall time, which is network-bound and today fully serial. | Must keep scan-plan bytes identical; GitHub secondary rate-limit headroom. |
| MT-4 | Graph engine dirty flag + per-frame invariant cache | Removes constant recomputation from large-graph frames; idle CPU/GPU to zero when settled. | None. Pure client code, existing p95 gate. |
| MT-5 | Decompose MCP `loadWorkspace` + short TTL cache | Removes a full knowledge-base download and reassembly from every agent tool call. The hottest path in the product. | Local Supabase (Docker) to measure; the TTL memo needs a guardrail reading on "stateless MCP". |
| MT-6 | Drop the server-side force layout, or cache it per scan | Unblocks `/app/map` TTFB, which today runs 48 all-pairs layout iterations per request. | Needs the app + a database to measure TTFB honestly. |
| MT-7 | Slim the map serialization; cap sr-only edge buttons | Cuts RSC payload bytes and DOM node count on the map. | The report's version also strips per-edge provenance — that touches the provenance guardrail. |
| MT-8 | Collapse the shared `/app` workspace-lookup waterfall; stream the shell | Removes 3+ serial round trips per page. | Needs a database for a request-count measurement. |
| MT-9 | Project `receipts.summary`; split counters into columns | Cuts `/app/stats` and `/app/progress` response bytes. | Column split needs a migration; measurement needs a database. |
| MT-10 | Stop rebuilding the MCP server and its schemas per request | Removes ~34 Zod→JSON-Schema conversions and 22 tool registrations from every request, `initialize` and `tools/list` included. | None. Pure CPU, measurable with a fake store. |
| MT-11 | In-process LRU for analyze document-body refetches | Cuts analyze wall time and GitHub API calls. | Sits next to the "never persist raw source bodies" rule; in-process reuse is allowed but the boundary needs care. GitHub credentials to measure. |
| MT-12 | Move the client-side receipt verification off three routes | Cuts first-load JS on `/findings`, `/lint`, `/receipts` by the zod + schema chunks. | Changes the demo's interactive "verify" gesture into a precomputed prop. |

## 2. Selection

Filters applied, in order:

**(a) no new credentials.** Drops MT-2 and MT-11 (AI provider / GitHub App)
for a *real* measurement. MT-1 is already shipped.

**(b) no spec guardrail is touched.** Drops MT-5 (its TTL memo needs a written
reading of *MCP 2026-07-28 stateless*, which is a spec question, not a code
question) and MT-7 (its payload saving comes largely from removing per-edge
provenance, and *every graph edge carries provenance* is guardrail #2).

**(c) measurable locally.** Drops MT-6, MT-8 and MT-9: each is honestly a
TTFB / round-trip / response-byte measurement against a real database, so the
number would come from a local Supabase stack standing in for production. That
is a weaker measurement than the three below, not an impossible one — they stay
first in line for wave 2.

### Chosen — three items

**MT-4 — graph engine dirty flag + frame invariant cache.**
Top-5 leverage item #4 in the report. Entirely client-side pure code with an
existing automated budget gate (`tests/graph-perf.test.ts`, recorded p95
0.385 ms against 16.7 ms). Three parts: cache `degreeMap` / radii / median per
`GraphData`; cache the collapse *structure* per `(data, assignment, expanded)`
and refresh only centroids per frame; skip a frame entirely when no input and
no simulation frame changed. Measured with the existing p95 suite plus a new
deterministic bench at 3,000 nodes, where collapse actually engages.

**MT-10 — stop rebuilding the MCP server and schemas per request.**
Sits under top-5 leverage item #5 (the MCP hot path). `createMcpHandler` calls
the server factory on every request, so 22 `registerTool` calls and 66
`z.object` literals are constructed per request — including for `initialize`
and `tools/list`. The schemas close over nothing request-scoped (only the
handlers close over `principal` and `store`), so hoisting is mechanical and
behaviour-preserving. No session state is introduced, so the stateless rule is
untouched. Measured with a micro-benchmark over `createServer()` against a
fake store: no credentials, no database, no network.

**MT-3 — two-phase scan content fetch with bounded concurrency.**
Top-5 leverage item #2, the half of it that QW-3 did not cover: the first scan
of a new repository fetches every changed blob in a strictly serial loop.
Classification and the blob-sha skip already complete before any fetch, so the
fetch set is decidable in one I/O-free pass. Guardrail-safe: bodies stay
transient, and the plan must come out byte-identical, which the existing
`tests/repository-scanner.test.ts` suite pins. Measured locally with a fake
`RepositorySource` at a fixed simulated per-request latency — the assumption is
stated with the number, and it measures exactly the serialization the item is
about.

### Order

MT-4 → MT-10 → MT-3. Independent of each other; ordered by falling confidence
in the measurement being reproducible on this machine.

### Explicitly not started in this wave

MT-2, MT-5, MT-6, MT-7, MT-8, MT-9, MT-11, MT-12 — reasons in the filters
above. MT-1 is already in main.
