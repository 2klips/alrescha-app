import {
  RECEIPT_TOOL,
  digestInTotoStatement,
  verifyInTotoStatement,
  type InTotoStatement,
} from "@alrescha/core/receipts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { buildWorkspaceReceipts } from "../../lib/receipts/receipts-report";
import { ASSURANCE } from "../../lib/strings";
import { WorkspaceReceiptsBoard } from "./receipts-board";

const COMMIT = "b".repeat(40);
const statement: InTotoStatement = {
  _type: "https://in-toto.io/Statement/v1",
  predicate: {
    analyzedAt: "2026-09-02T14:00:00.000Z",
    commitSha: COMMIT,
    coverage: { implVerified: 2, requirements: 4, testVerified: 1 },
    evidence: { inferred: 1, verified: 3 },
    previousReceiptDigest: null,
    repository: "2klips/alrescha-app",
    runId: "run-1",
    tool: RECEIPT_TOOL,
  },
  predicateType: "https://arr-app-web.vercel.app/receipt/v1",
  subject: [{ digest: { sha1: COMMIT }, name: "git:commit" }],
};
const legacy = {
  ...statement,
  predicate: { ...statement.predicate, tool: { name: "arr", version: "0.1.0" } },
};
const repositories = [
  { full_name: "2klips/alrescha-app", id: "repo-1", last_scanned_commit_sha: COMMIT },
];

async function receipts() {
  const digest = await digestInTotoStatement(statement);
  const probe = await verifyInTotoStatement(legacy, "0".repeat(64));
  const legacyDigest = (probe as { actualDigest: string }).actualDigest;
  return buildWorkspaceReceipts(
    [
      {
        commit_sha: COMMIT,
        created_at: "2026-09-02T14:01:00.000Z",
        digest,
        id: "current",
        repository_id: "repo-1",
        run_id: "run-1",
        status: "generated",
        summary: { findings: { open_total: 5, opened: ["a"], resolved: [] }, statement },
      },
      {
        commit_sha: COMMIT,
        created_at: "2026-08-27T14:01:00.000Z",
        digest: legacyDigest,
        id: "legacy",
        repository_id: "repo-1",
        run_id: "run-0",
        status: "generated",
        summary: { statement: legacy },
      },
      {
        commit_sha: COMMIT,
        created_at: "2026-08-20T14:01:00.000Z",
        digest: "0".repeat(64),
        id: "garbled",
        repository_id: "repo-1",
        run_id: null,
        status: "generated",
        summary: { statement: { predicate: {} } },
      },
    ],
    repositories,
  );
}

function render(selectedId: string | null, list = receipts()) {
  return list.then((all) =>
    renderToStaticMarkup(
      createElement(WorkspaceReceiptsBoard, {
        basePath: "/app/receipts",
        commitsPath: "/app/commits",
        receipts: all,
        selectedId,
      }),
    ),
  );
}

describe("WorkspaceReceiptsBoard", () => {
  it("renders the empty state for a workspace without receipts", () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceReceiptsBoard, {
        basePath: "/app/receipts",
        commitsPath: "/app/commits",
        receipts: [],
        selectedId: null,
      }),
    );
    expect(html).toContain(ASSURANCE.receipts.live.empty.title);
    expect(html).not.toContain('data-testid="receipt-detail"');
  });

  it("lists every receipt as a link and marks the selected one", async () => {
    const html = await render("legacy");
    expect(html).toContain('href="/app/receipts?receipt=current"');
    expect(html).toContain('href="/app/receipts?receipt=legacy"');
    expect(html).toContain('href="/app/receipts?receipt=garbled"');
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
    expect(html).toContain(ASSURANCE.receipts.live.summary(3));
  });

  it("shows a server-computed verified verdict and the commit card link", async () => {
    const html = await render("current");
    expect(html).toContain('data-verification="verified"');
    expect(html).toContain('data-testid="receipt-verdict"');
    expect(html).toContain(ASSURANCE.receipts.verdict.counts(3, 1));
    expect(html).toContain(ASSURANCE.receipts.live.findingsDelta(1, 0, 5));
    expect(html).toContain('href="/app/commits?run=run-1"');
    expect(html).not.toContain('data-testid="receipt-legacy-issuer"');
  });

  it("verifies a pre-rename receipt and names the legacy issuer (OQ-022 ⑴)", async () => {
    const html = await render("legacy");
    expect(html).toContain('data-testid="receipt-detail" data-verification="verified"');
    expect(html).toContain('data-testid="receipt-legacy-issuer"');
    expect(html).toContain(ASSURANCE.receipts.live.legacyIssuer);
    expect(html).toContain("arr 0.1.0");
    expect(html).toContain(ASSURANCE.receipts.live.findingsMissing);
  });

  it("names the repository head commit in the stale banner, not the receipt's own", async () => {
    const digest = await digestInTotoStatement(statement);
    const head = "d".repeat(40);
    const list = await buildWorkspaceReceipts(
      [
        {
          commit_sha: COMMIT,
          created_at: "2026-09-02T14:01:00.000Z",
          digest,
          id: "older",
          repository_id: "repo-1",
          run_id: "run-1",
          status: "generated",
          summary: { statement },
        },
      ],
      [{ ...repositories[0]!, last_scanned_commit_sha: head }],
    );
    const html = await render("older", Promise.resolve(list));
    expect(html).toContain(ASSURANCE.receipts.live.staleBanner(head.slice(0, 7)));
    expect(html).not.toContain(ASSURANCE.receipts.live.staleBanner(COMMIT.slice(0, 7)));
  });

  it("keeps an unreadable receipt visible as invalid with its parse issues", async () => {
    const html = await render("garbled");
    expect(html).toContain('data-verification="invalid"');
    expect(html).toContain('data-testid="receipt-issues"');
    expect(html).toContain(ASSURANCE.receipts.live.unreadable);
    expect(html).toContain('data-testid="receipt-verdict-locked"');
    expect(html).not.toContain("/app/commits?run=");
  });
});
