import { createHmac } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  NULL_GIT_SHA,
  handleGitHubWebhook,
  isScannableCommitSha,
  normalizeGitHubWebhook,
  scanRepository,
  type GitHubWebhookStore,
  type RepositorySource,
} from "../packages/core/src/index";
import { scheduleBackfillScan } from "../apps/web/lib/github/backfill-scan";

import {
  ALL_MIGRATIONS,
  asServiceRole,
  createTestDatabase,
} from "./helpers/database";

/**
 * No scan at the null sha (2026-09-12).
 *
 * Six production `scan` jobs failed permanently between 2026-09-09 and
 * 2026-09-12, every one at `0000000000000000000000000000000000000000` —
 * Git's null object id, which GitHub sends as `after` in the push webhook
 * for a *deleted* branch or tag. Every check on the way to the queue asked
 * "forty hex characters?", and the null id answers yes. The worker then
 * asked GitHub for the tree of a commit that does not exist, three times.
 *
 * These pin each layer's refusal: the webhook handler acknowledges the
 * delivery without storing it, the queue function raises if asked anyway,
 * the backfill path refuses the null id as a head, and the scanner refuses
 * it before touching the repository host.
 */

const SECRET = "null-sha-guard-secret";
const REAL_SHA = "a1a38ce41bf43439e8ce05ecaab34480198ea115";
const USER = "99000000-0000-4000-8000-000000000001";
const INSTALLATION_ID = "01K90000000000000000000N01";
const REPOSITORY_ID = "01K90000000000000000000R01";

function signed(body: Record<string, unknown>) {
  const rawBody = JSON.stringify(body);
  return {
    rawBody,
    signature: `sha256=${createHmac("sha256", SECRET).update(rawBody, "utf8").digest("hex")}`,
  };
}

/** The payload GitHub documents for a deleted ref, minus the noise. */
function deletionPush() {
  return {
    after: NULL_GIT_SHA,
    before: REAL_SHA,
    commits: [],
    created: false,
    deleted: true,
    forced: false,
    head_commit: null,
    installation: { id: 777 },
    ref: "refs/heads/claude/containment-join",
    repository: { full_name: "alrescha/drifted-demo", id: 424242 },
  };
}

function fakeStore(): GitHubWebhookStore & {
  insertEvent: ReturnType<typeof vi.fn>;
  resolveRepository: ReturnType<typeof vi.fn>;
} {
  return {
    insertEvent: vi.fn().mockResolvedValue("inserted"),
    resolveRepository: vi
      .fn()
      .mockResolvedValue({ id: REPOSITORY_ID, workspaceId: "workspace" }),
    revokeInstallation: vi.fn().mockResolvedValue("unknown"),
  };
}

describe("the null sha is forty hex characters and no commit", () => {
  it("passes the format check and fails the scannable one", () => {
    expect(/^[0-9a-f]{40}$/.test(NULL_GIT_SHA)).toBe(true);
    expect(isScannableCommitSha(NULL_GIT_SHA)).toBe(false);
    expect(isScannableCommitSha(REAL_SHA)).toBe(true);
    expect(isScannableCommitSha("HEAD")).toBe(false);
  });
});

describe("webhook handler", () => {
  it("acknowledges a deletion push without storing it or queueing anything", async () => {
    const store = fakeStore();
    const { rawBody, signature } = signed(deletionPush());

    const result = await handleGitHubWebhook({
      deliveryId: "delivery-deleted-branch",
      event: "push",
      rawBody,
      secret: SECRET,
      signature,
      store,
    });

    // 2xx, so GitHub does not count the delivery as failed against the App;
    // nothing resolved or inserted, so no run and no scan/analyze pair.
    expect(result).toEqual({
      body: { ignored: true, reason: "ref_deleted" },
      status: 202,
    });
    expect(store.resolveRepository).not.toHaveBeenCalled();
    expect(store.insertEvent).not.toHaveBeenCalled();
  });

  it("still receives a creation push, whose null sha is on the other side", async () => {
    const store = fakeStore();
    const { rawBody, signature } = signed({
      ...deletionPush(),
      after: REAL_SHA,
      before: NULL_GIT_SHA,
      created: true,
      deleted: false,
      head_commit: { id: REAL_SHA },
    });

    const result = await handleGitHubWebhook({
      deliveryId: "delivery-created-branch",
      event: "push",
      rawBody,
      secret: SECRET,
      signature,
      store,
    });

    expect(result).toEqual({
      body: { duplicate: false, received: true },
      status: 200,
    });
    expect(store.insertEvent).toHaveBeenCalledWith(
      expect.objectContaining({ commitSha: REAL_SHA }),
    );
  });

  it("normalizes the deletion faithfully — the refusal is the handler's", () => {
    // The parser reports what GitHub sent; deciding not to act on it is the
    // job of the layer that would otherwise persist and enqueue.
    const event = normalizeGitHubWebhook(
      "push",
      "delivery-deleted-branch",
      JSON.stringify(deletionPush()),
    );
    expect(event?.commitSha).toBe(NULL_GIT_SHA);
  });
});

describe("queue functions", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let workspaceId: string;

  beforeAll(async () => {
    database = await createTestDatabase([...ALL_MIGRATIONS]);
    await database.query(
      "insert into auth.users (id, email) values ($1, 'null-sha@example.test')",
      [USER],
    );
    workspaceId =
      (await database.query<{ id: string }>("select id from public.workspaces"))
        .rows[0]?.id ?? "";
    await database.query(
      `insert into public.github_installations
        (id, workspace_id, github_installation_id, account_id, account_login)
       values ($1, $2, 777, 7777, 'alrescha')`,
      [INSTALLATION_ID, workspaceId],
    );
    await database.query(
      `insert into public.repositories
        (id, workspace_id, full_name, installation_id, github_repository_id, selected_at)
       values ($1, $2, 'alrescha/drifted-demo', $3, 424242, now())`,
      [REPOSITORY_ID, workspaceId, INSTALLATION_ID],
    );
  });

  afterAll(async () => {
    await database.close();
  });

  async function ingest(deliveryId: string, commitSha: string) {
    const rows = await asServiceRole(database, async (transaction) =>
      transaction.query<{ inserted: boolean }>(
        "select public.ingest_github_webhook_event($1,$2,$3,'push',null,null,$4,$5) as inserted",
        [workspaceId, REPOSITORY_ID, deliveryId, commitSha, "a".repeat(64)],
      ),
    );
    return rows.rows[0]?.inserted;
  }

  async function counts() {
    const rows = await database.query<{
      deliveries: number;
      jobs: number;
      runs: number;
    }>(
      `select
         (select count(*)::integer from public.github_webhook_deliveries) as deliveries,
         (select count(*)::integer from public.runs) as runs,
         (select count(*)::integer from public.jobs) as jobs`,
    );
    return rows.rows[0];
  }

  it("refuses a webhook delivery at the null sha before any row exists", async () => {
    await expect(ingest("delivery-null", NULL_GIT_SHA)).rejects.toThrow(
      /no scannable commit/,
    );

    // Not a delivery row, not a run, not a scan, not an analyze: the
    // previous shape produced all four and then failed the scan three times.
    expect(await counts()).toEqual({ deliveries: 0, jobs: 0, runs: 0 });
  });

  it("still turns a real commit into the scan and analyze pair", async () => {
    expect(await ingest("delivery-real", REAL_SHA)).toBe(true);

    expect(await counts()).toEqual({ deliveries: 1, jobs: 2, runs: 1 });
    const jobs = await database.query<{
      kind: string;
      payload: { commitSha: string };
    }>("select kind, payload from public.jobs order by kind");
    expect(
      jobs.rows.map(({ kind, payload }) => [kind, payload.commitSha]),
    ).toEqual([
      ["analyze", REAL_SHA],
      ["scan", REAL_SHA],
    ]);
  });
});

describe("backfill on connect", () => {
  it("treats the null sha as an unknown head and never reaches the queue", async () => {
    const rpc = vi.fn();
    const result = await scheduleBackfillScan({
      client: { rpc } as unknown as SupabaseClient,
      headCommitSha: NULL_GIT_SHA,
      repositoryId: REPOSITORY_ID,
      workspaceId: "workspace",
    });

    expect(result).toEqual({
      jobId: null,
      reason: "the repository's head commit is unknown",
      scheduled: false,
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("repository scanner", () => {
  it("refuses the null sha before asking the host for a tree", async () => {
    const source: RepositorySource = {
      fetchContent: vi.fn(),
      listTree: vi.fn(),
    };

    // The message names the cause; a job carrying this sha used to surface
    // only as `GitHub repository request failed: 404 (/repos/…/git/trees/0000…)`.
    await expect(
      scanRepository({ commitSha: NULL_GIT_SHA, source }),
    ).rejects.toThrow(/null sha/);
    expect(source.listTree).not.toHaveBeenCalled();
  });
});
