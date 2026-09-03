import {
  RECEIPT_TOOL,
  digestInTotoStatement,
  verifyInTotoStatement,
  type InTotoStatement,
} from "@alrescha/core/receipts";
import { describe, expect, it } from "vitest";

import {
  buildWorkspaceReceipts,
  type ReceiptRepositoryRow,
  type WorkspaceReceiptRow,
} from "./receipts-report";

const COMMIT = "b".repeat(40);
const NEWER_COMMIT = "c".repeat(40);

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
  subject: [
    { digest: { sha1: COMMIT }, name: "git:commit" },
    { digest: { sha256: "a".repeat(64) }, name: "spec/WORK_SPEC.md" },
  ],
};

const legacyStatement = {
  ...statement,
  predicate: { ...statement.predicate, tool: { name: "arr", version: "0.1.0" } },
};

const repositories: readonly ReceiptRepositoryRow[] = [
  { full_name: "2klips/alrescha-app", id: "repo-1", last_scanned_commit_sha: COMMIT },
];

function row(overrides: Partial<WorkspaceReceiptRow>): WorkspaceReceiptRow {
  return {
    commit_sha: COMMIT,
    created_at: "2026-09-02T14:01:00.000Z",
    digest: null,
    id: "receipt-1",
    repository_id: "repo-1",
    run_id: "run-1",
    status: "generated",
    summary: {
      findings: { open_total: 5, opened: ["a", "b"], resolved: ["c"] },
      statement,
    },
    ...overrides,
  };
}

describe("buildWorkspaceReceipts", () => {
  it("re-verifies a stored statement against its stored digest and keeps the row's facts", async () => {
    const digest = await digestInTotoStatement(statement);
    const [receipt] = await buildWorkspaceReceipts([row({ digest })], repositories);

    expect(receipt).toMatchObject({
      commitSha: COMMIT,
      digest,
      findings: { opened: 2, openTotal: 5, resolved: 1 },
      repository: "2klips/alrescha-app",
      runId: "run-1",
      stale: false,
      verification: { actualDigest: digest, state: "verified", toolName: "alrescha" },
    });
    expect(receipt?.statement?.predicate.coverage).toEqual({
      implVerified: 2,
      requirements: 4,
      testVerified: 1,
    });
  });

  it("reads a pre-rename receipt as verified and names its legacy issuer (OQ-022 ⑴)", async () => {
    const probe = await verifyInTotoStatement(legacyStatement, "0".repeat(64));
    const legacyDigest = (probe as { actualDigest: string }).actualDigest;
    const [receipt] = await buildWorkspaceReceipts(
      [row({ digest: legacyDigest, summary: { statement: legacyStatement } })],
      repositories,
    );

    expect(receipt?.verification).toEqual({
      actualDigest: legacyDigest,
      state: "verified",
      toolName: "arr",
    });
    expect(receipt?.statement?.predicate.tool.name).toBe("arr");
    // No findings snapshot on this row → no guessed delta.
    expect(receipt?.findings).toBeNull();
  });

  it("reports tampering when the stored digest no longer matches the statement", async () => {
    const digest = await digestInTotoStatement(statement);
    const [receipt] = await buildWorkspaceReceipts(
      [
        row({
          digest,
          summary: {
            statement: {
              ...statement,
              predicate: { ...statement.predicate, evidence: { inferred: 0, verified: 9 } },
            },
          },
        }),
      ],
      repositories,
    );
    expect(receipt?.verification).toMatchObject({
      expectedDigest: digest,
      state: "tampered",
    });
  });

  it("shows an unreadable or digest-less row as invalid instead of dropping it", async () => {
    const receipts = await buildWorkspaceReceipts(
      [
        row({ digest: "0".repeat(64), id: "garbled", summary: { statement: { predicate: {} } } }),
        row({ digest: null, id: "no-digest" }),
      ],
      repositories,
    );
    expect(receipts.map((receipt) => [receipt.id, receipt.verification.state])).toEqual([
      ["garbled", "invalid"],
      ["no-digest", "invalid"],
    ]);
    expect(receipts[0]?.statement).toBeNull();
    expect(receipts[1]?.statement).not.toBeNull();
  });

  it("marks a receipt stale once the repository has scanned a newer commit, and falls back to the repository id", async () => {
    const digest = await digestInTotoStatement(statement);
    const receipts = await buildWorkspaceReceipts(
      [row({ digest }), row({ digest, id: "orphan", repository_id: "repo-gone" })],
      [{ ...repositories[0]!, last_scanned_commit_sha: NEWER_COMMIT }],
    );
    expect(receipts[0]).toMatchObject({ headCommitSha: NEWER_COMMIT, stale: true });
    expect(receipts[1]).toMatchObject({
      headCommitSha: null,
      repository: "repo-gone",
      stale: false,
    });
  });
});
