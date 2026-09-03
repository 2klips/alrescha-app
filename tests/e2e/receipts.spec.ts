import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import {
  RECEIPT_TOOL,
  digestInTotoStatement,
  verifyInTotoStatement,
  type InTotoStatement,
} from "../../packages/core/src/assurance/receipts";
import { ASSURANCE } from "../../apps/web/lib/strings/assurance";
import { COMMITS } from "../../apps/web/lib/strings/commits";
import {
  createWorkspaceUser,
  deleteWorkspaceUser,
  signIn,
} from "./helpers/session";

/**
 * OQ-022 follow-up — `/app/receipts` shows the workspace's own receipts and
 * re-verifies them on the server. Seeded straight into the tables the worker
 * writes: one current-issuer receipt at the repository's last scanned commit
 * and one pre-rename (`arr`) receipt at an older commit, both with the digest
 * the analyze would have stored.
 */

const EVIDENCE = path.resolve(".omo/evidence/phase2c/live-receipts");
const CURRENT_COMMIT = "c".repeat(40);
const OLDER_COMMIT = "a".repeat(40);
/** A rail long enough to overflow its own scrollbox — the production shape. */
const DEEP_LINK_RECEIPTS = 30;

test.beforeAll(async () => {
  await mkdir(EVIDENCE, { recursive: true });
});

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/** A Crockford-safe 26-char id unique to this run (no I, L, O, U). */
function ulid(tag: string): string {
  return `01K3E2E${Date.now().toString(32)}${tag}`
    .toUpperCase()
    .replace(/[ILOU]/g, "X")
    .padEnd(26, "0")
    .slice(0, 26);
}

function statementFor(commitSha: string, runId: string): InTotoStatement {
  return {
    _type: "https://in-toto.io/Statement/v1",
    predicate: {
      analyzedAt: "2026-09-02T14:00:00.000Z",
      commitSha,
      coverage: { implVerified: 2, requirements: 4, testVerified: 1 },
      evidence: { inferred: 1, verified: 3 },
      previousReceiptDigest: null,
      repository: "2klips/alrescha-app",
      runId,
      tool: RECEIPT_TOOL,
    },
    predicateType: "https://arr-app-web.vercel.app/receipt/v1",
    subject: [
      { digest: { sha1: commitSha }, name: "git:commit" },
      { digest: { sha256: "b".repeat(64) }, name: "spec/WORK_SPEC.md" },
    ],
  };
}

async function seed(workspaceId: string) {
  const client = admin();
  const repositoryId = ulid("REP");
  const currentRun = ulid("RUN1");
  const legacyRun = ulid("RUN0");
  const currentReceipt = ulid("RCP1");
  const legacyReceipt = ulid("RCP0");

  const current = statementFor(CURRENT_COMMIT, currentRun);
  const legacyBase = statementFor(OLDER_COMMIT, legacyRun);
  const legacy = {
    ...legacyBase,
    predicate: {
      ...legacyBase.predicate,
      tool: { name: "arr", version: "0.1.0" },
    },
  };
  const probe = await verifyInTotoStatement(legacy, "0".repeat(64));
  const legacyDigest = (probe as { actualDigest: string }).actualDigest;

  const repo = await client.from("repositories").insert({
    default_branch: "main",
    full_name: "2klips/alrescha-app",
    id: repositoryId,
    last_scanned_commit_sha: CURRENT_COMMIT,
    workspace_id: workspaceId,
  });
  if (repo.error) throw new Error(repo.error.message);
  const runs = await client.from("runs").insert([
    {
      commit_sha: OLDER_COMMIT,
      created_at: "2026-08-27T14:00:00.000Z",
      id: legacyRun,
      repository_id: repositoryId,
      status: "succeeded",
      trigger_key: `push:${OLDER_COMMIT}`,
      trigger_kind: "push",
      workspace_id: workspaceId,
    },
    {
      commit_sha: CURRENT_COMMIT,
      created_at: "2026-09-02T14:00:00.000Z",
      id: currentRun,
      repository_id: repositoryId,
      status: "succeeded",
      trigger_key: `push:${CURRENT_COMMIT}`,
      trigger_kind: "push",
      workspace_id: workspaceId,
    },
  ]);
  if (runs.error) throw new Error(runs.error.message);
  const receipts = await client.from("receipts").insert([
    {
      commit_sha: OLDER_COMMIT,
      created_at: "2026-08-27T14:01:00.000Z",
      digest: legacyDigest,
      id: legacyReceipt,
      repository_id: repositoryId,
      run_id: legacyRun,
      status: "generated",
      summary: { statement: legacy },
      workspace_id: workspaceId,
    },
    {
      commit_sha: CURRENT_COMMIT,
      created_at: "2026-09-02T14:01:00.000Z",
      digest: await digestInTotoStatement(current),
      id: currentReceipt,
      repository_id: repositoryId,
      run_id: currentRun,
      status: "generated",
      summary: {
        findings: { open_total: 5, opened: ["a", "b"], resolved: ["c"] },
        statement: current,
      },
      workspace_id: workspaceId,
    },
  ]);
  if (receipts.error) throw new Error(receipts.error.message);
  return { currentReceipt, currentRun, legacyReceipt };
}

test("an empty workspace shows the empty state, not the demo chain", async ({
  context,
  page,
}) => {
  const user = await createWorkspaceUser("receipts-empty");
  try {
    await signIn(context, user);
    await page.goto("/app/receipts");
    await expect(page.getByRole("status")).toContainText(
      ASSURANCE.receipts.live.empty.title,
    );
    await expect(page.getByTestId("receipt-detail")).toHaveCount(0);
  } finally {
    await deleteWorkspaceUser(user.userId);
  }
});

test("stored receipts are listed, re-verified on the server and linked to their commit cards", async ({
  context,
  page,
}) => {
  const user = await createWorkspaceUser("receipts-live");
  try {
    const seeded = await seed(user.workspaceId);
    await signIn(context, user);

    await page.goto("/app/receipts");
    const rail = page.getByRole("navigation", {
      name: ASSURANCE.receipts.live.title,
    });
    await expect(rail.getByRole("link")).toHaveCount(2);
    await expect(page.getByTestId("receipt-verification-summary")).toHaveText(
      ASSURANCE.receipts.live.verificationSummary(2, 0, 0),
    );

    // Newest first: the current-issuer receipt, verified against its digest.
    const detail = page.getByTestId("receipt-detail");
    await expect(detail).toHaveAttribute("data-verification", "verified");
    await expect(detail).toContainText(ASSURANCE.receipts.verification.verified);
    await expect(page.getByTestId("receipt-verdict")).toContainText(
      ASSURANCE.receipts.verdict.counts(3, 1),
    );
    await expect(detail).toContainText(
      ASSURANCE.receipts.live.findingsDelta(2, 1, 5),
    );
    await expect(page.getByTestId("receipt-legacy-issuer")).toHaveCount(0);
    await expect(
      detail.getByRole("link", { name: ASSURANCE.receipts.live.commitAction }),
    ).toHaveAttribute("href", `/app/commits?run=${seeded.currentRun}`);
    await page.screenshot({
      fullPage: true,
      path: path.join(EVIDENCE, "receipts-current-verified.png"),
    });

    // The pre-rename receipt: verified all the same, labelled as legacy, and
    // stale because the repository has scanned a newer commit since.
    await rail
      .getByRole("link", { name: new RegExp(OLDER_COMMIT.slice(0, 7)) })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/app/receipts\\?receipt=${seeded.legacyReceipt}`),
    );
    await expect(detail).toHaveAttribute("data-verification", "verified");
    await expect(page.getByTestId("receipt-legacy-issuer")).toContainText(
      ASSURANCE.receipts.live.legacyIssuer,
    );
    await expect(page.getByTestId("receipt-issuer")).toHaveText("arr 0.1.0");
    // The banner names the commit the repository has since scanned — not
    // the receipt's own (the first production render showed the latter).
    await expect(detail.locator(".stale-banner")).toContainText(
      ASSURANCE.receipts.live.staleBanner(CURRENT_COMMIT.slice(0, 7)),
    );
    await page.screenshot({
      fullPage: true,
      path: path.join(EVIDENCE, "receipts-legacy-verified.png"),
    });

    // The commit card's "Receipt 보기" now lands on the live receipt.
    await page.goto(`/app/commits?run=${seeded.currentRun}`);
    await expect(
      page.getByRole("link", { name: COMMITS.detail.receiptAction }),
    ).toHaveAttribute("href", `/app/receipts?receipt=${seeded.currentReceipt}`);
  } finally {
    await deleteWorkspaceUser(user.userId);
  }
});

/**
 * A rail of stored receipts, no runs — enough of them that the list overflows
 * its scrollbox, which is the shape production reached at 32 receipts.
 */
async function seedManyReceipts(workspaceId: string) {
  const client = admin();
  const repositoryId = ulid("REPD");
  const repo = await client.from("repositories").insert({
    default_branch: "main",
    full_name: "2klips/alrescha-app",
    id: repositoryId,
    last_scanned_commit_sha: CURRENT_COMMIT,
    workspace_id: workspaceId,
  });
  if (repo.error) throw new Error(repo.error.message);

  const rows = await Promise.all(
    Array.from({ length: DEEP_LINK_RECEIPTS }, async (_unused, index) => {
      const commitSha = index.toString(16).padStart(2, "0").repeat(20);
      const statement = statementFor(commitSha, `run-${index}`);
      return {
        commit_sha: commitSha,
        created_at: new Date(Date.UTC(2026, 6, 1 + index, 12)).toISOString(),
        digest: await digestInTotoStatement(statement),
        id: ulid(`RD${String(index).padStart(2, "0")}`),
        repository_id: repositoryId,
        run_id: null,
        status: "generated",
        summary: { statement },
        workspace_id: workspaceId,
      };
    }),
  );
  const inserted = await client.from("receipts").insert(rows);
  if (inserted.error) throw new Error(inserted.error.message);
  // Newest first in the rail, so the earliest row is its last item.
  return { oldest: rows[0]!.id };
}

test("a deep link to an older receipt reveals it in the rail, detail intact", async ({
  context,
  page,
}) => {
  const user = await createWorkspaceUser("receipts-deep-link");
  try {
    const seeded = await seedManyReceipts(user.workspaceId);
    await signIn(context, user);

    await page.goto(`/app/receipts?receipt=${seeded.oldest}`);
    const rail = page.getByRole("navigation", {
      name: ASSURANCE.receipts.live.title,
    });
    await expect(rail.getByRole("link")).toHaveCount(DEEP_LINK_RECEIPTS);

    // The rail scrolled its own list to the selection: the newest receipt,
    // which the rail renders first, has been scrolled past.
    const selected = rail.locator('a[aria-current="true"]');
    await expect(selected).toHaveCount(1);
    await expect(selected).toBeInViewport();
    await expect(rail.getByRole("link").first()).not.toBeInViewport();

    // The page itself did not scroll, so the deep-linked detail is still read.
    await expect(page.getByTestId("receipt-detail")).toBeInViewport();
    await expect(page.getByTestId("receipt-verification-summary")).toHaveText(
      ASSURANCE.receipts.live.verificationSummary(DEEP_LINK_RECEIPTS, 0, 0),
    );
    await page.screenshot({
      fullPage: true,
      path: path.join(EVIDENCE, "receipts-deep-link-in-view.png"),
    });
  } finally {
    await deleteWorkspaceUser(user.userId);
  }
});
