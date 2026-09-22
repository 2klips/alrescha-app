// RE-02 companion to `research-2026-09-21.probe.mjs`, on the same synthetic
// fixture. Read-only: no network, model API, database or repository writes.
// Run from the target checkout:
//   node --import tsx docs/reports/research-2026-09-21.probe.re-02.mjs
//
// The original probe stays exactly as the research left it. It reproduces the
// OLD call shape on purpose — it ranks with `searchWorkspaceIndex` and then
// filters the page in JavaScript, which is what `hosted.ts` used to do — so
// its `filterAfterLimit.returnedAfterDomainFilter` still reads 0 after the
// fix. That number is the defect being described, not a live measurement of
// the current search path. This file calls the current path.
import { log } from "node:console";
import {
  SEARCH_INDEX_DEFAULT_LIMIT,
  searchWorkspaceIndex,
  searchWorkspaceIndexPage,
} from "../../packages/mcp/src/data-brain.ts";

const paths = [
  ...Array.from(
    { length: 20 },
    (_, i) => `apps/web/auth-${String(i).padStart(2, "0")}.ts`,
  ),
  ...Array.from({ length: 5 }, (_, i) => `packages/core/auth-${i}.ts`),
];
const workspace = {
  id: "synthetic-workspace",
  ownerUserId: "synthetic-user",
  repositories: [
    {
      id: "synthetic-repo",
      fullName: "fixture/diagnostic",
      defaultBranch: "main",
      artifacts: paths.map((path, i) => ({
        id: `n${i}`,
        kind: "code_metadata",
        path,
        title: "auth",
        content: "",
        symbols: [],
        tags: [],
        headings: [],
        status: "active",
      })),
      indexEntries: paths.map((path, i) => ({
        id: `i${i}`,
        nodeId: `n${i}`,
        type: "artifact",
        path,
        title: "auth",
        searchKey: "auth",
        neighborIds: [],
        headings: [],
        tags: [],
        symbols: [],
      })),
      requirements: [],
      evidence: [],
      findings: [],
      edges: [],
      receipts: [],
      contextPacks: [],
    },
  ],
};

const backend = searchWorkspaceIndexPage(workspace, {
  domain: "backend",
  query: "auth",
});
const defaultPage = searchWorkspaceIndexPage(workspace, { query: "auth" });
const wide = searchWorkspaceIndexPage(workspace, { limit: 100, query: "auth" });
const one = searchWorkspaceIndexPage(workspace, { limit: 1, query: "auth" });
const nonsense = searchWorkspaceIndexPage(workspace, { query: "!!!" });

log(
  JSON.stringify(
    {
      scope:
        "synthetic diagnostic on the fixed path; not a production latency or model-accuracy benchmark",
      domainBeforeLimit: {
        matchingBackendFiles: paths.filter((path) =>
          path.startsWith("packages/core/"),
        ).length,
        returned: backend.results.length,
        eligible: backend.eligible,
        omitted: backend.omitted,
      },
      limitAndOmission: {
        default: {
          limit: SEARCH_INDEX_DEFAULT_LIMIT,
          returned: defaultPage.results.length,
          eligible: defaultPage.eligible,
          omitted: defaultPage.omitted,
        },
        hundred: {
          returned: wide.results.length,
          eligible: wide.eligible,
          omitted: wide.omitted,
        },
        one: {
          returned: one.results.length,
          eligible: one.eligible,
          omitted: one.omitted,
        },
      },
      punctuationQuery: {
        query: "!!!",
        returned: nonsense.results.length,
        meaning: "no searchable term after normalisation, so no match",
      },
      compatibleWrapper: {
        returned: searchWorkspaceIndex(workspace, { query: "auth" }).length,
        note: "the array signature other callers use, still the default page",
      },
      coverage: defaultPage.coverage,
    },
    null,
    2,
  ),
);
