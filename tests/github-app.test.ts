import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  GITHUB_PR_PROPOSAL_PERMISSION,
  GITHUB_READ_ONLY_PERMISSIONS,
  GITHUB_WEBHOOK_EVENTS,
  MAX_GITHUB_WEBHOOK_BODY_BYTES,
  assertMinimalGitHubPermissions,
  handleGitHubWebhook,
  prepareGitHubOnboarding,
  requestInstallationToken,
  selectGitHubRepository,
  type GitHubWebhookStore,
  type PersistedGitHubWebhookEvent,
} from "../packages/core/src/index";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  AUTH_TENANCY_MIGRATION,
  EVIDENCE_GRAPH_MIGRATION,
  GITHUB_APP_MIGRATION,
  createTestDatabase,
} from "./helpers/database";

const ROOT = resolve(import.meta.dirname, "..");
const RECORDINGS = resolve(ROOT, "fixtures/drifted-demo/recordings/github");
const USER_ID = "11111111-1111-4111-8111-111111111111";
const REPOSITORY_ID = "01J0000000000000000000000A";
const INSTALLATION_ID = "01J0000000000000000000000B";

interface RecordedWebhook {
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

async function json<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

describe("GitHub App connection and webhook ingestion", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let workspaceId: string;
  let webhookSecret: string;

  beforeAll(async () => {
    database = await createTestDatabase([
      AUTH_TENANCY_MIGRATION,
      EVIDENCE_GRAPH_MIGRATION,
      GITHUB_APP_MIGRATION,
    ]);
    await database.query(
      "insert into auth.users (id, email) values ($1, 'github@example.test')",
      [USER_ID],
    );
    const workspace = await database.query<{ id: string }>(
      "select id from public.workspaces",
    );
    workspaceId = workspace.rows[0]?.id ?? "";
    await database.query(
      `insert into public.github_installations
        (id, workspace_id, github_installation_id, account_id, account_login)
       values ($1, $2, 777, 1001, 'arr')`,
      [INSTALLATION_ID, workspaceId],
    );
    await database.query(
      `insert into public.repositories
        (id, workspace_id, full_name, installation_id, github_repository_id, selected_at)
       values ($1, $2, 'arr/drifted-demo', $3, 424242, now())`,
      [REPOSITORY_ID, workspaceId, INSTALLATION_ID],
    );
    const metadata = await json<{ webhookSecret: string }>(
      resolve(RECORDINGS, "recording-metadata.json"),
    );
    webhookSecret = metadata.webhookSecret;
  });

  afterAll(async () => {
    await database.close();
  });

  it("accepts only the exact read-only profile or separately enabled PR proposals", () => {
    expect(GITHUB_WEBHOOK_EVENTS).toContain("installation");
    expect(() =>
      assertMinimalGitHubPermissions(GITHUB_READ_ONLY_PERMISSIONS),
    ).not.toThrow();
    expect(() =>
      assertMinimalGitHubPermissions(
        { ...GITHUB_READ_ONLY_PERMISSIONS, ...GITHUB_PR_PROPOSAL_PERMISSION },
        true,
      ),
    ).not.toThrow();
    expect(() =>
      assertMinimalGitHubPermissions({
        ...GITHUB_READ_ONLY_PERMISSIONS,
        contents: "write",
      }),
    ).toThrow(/exceed/);
    expect(() =>
      assertMinimalGitHubPermissions({
        ...GITHUB_READ_ONLY_PERMISSIONS,
        administration: "read",
      }),
    ).toThrow(/exceed/);
  });

  it("requests an ephemeral installation token scoped to selected repositories", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          expires_at: "2026-08-10T13:00:00Z",
          token: "ghs_123456_stateless-token",
        }),
        { status: 201 },
      ),
    );
    const token = await requestInstallationToken({
      appJwt: "app.jwt.value",
      fetchImplementation,
      installationId: 777,
      repositoryIds: [424242],
    });
    const [, options] = fetchImplementation.mock.calls[0] ?? [];
    const requestBody = JSON.parse(String(options?.body)) as Record<
      string,
      unknown
    >;

    expect(token.token).toBe("ghs_123456_stateless-token");
    expect(requestBody).toEqual({
      permissions: GITHUB_READ_ONLY_PERMISSIONS,
      repository_ids: [424242],
    });
    expect(JSON.stringify(requestBody)).not.toContain("pull_requests");
  });

  it("completes mocked installation and repository selection with pending first scan", async () => {
    const savePendingInstallation = vi
      .fn()
      .mockResolvedValue({ installationId: INSTALLATION_ID });
    const prepared = await prepareGitHubOnboarding({
      getVerifiedInstallation: async () => ({
        accountId: 1001,
        accountLogin: "arr",
        githubInstallationId: 777,
        permissions: GITHUB_READ_ONLY_PERMISSIONS,
        repositories: [
          {
            defaultBranch: "main",
            fullName: "arr/drifted-demo",
            githubRepositoryId: 424242,
          },
        ],
      }),
      store: { savePendingInstallation },
      workspaceId,
    });
    const verifyCurrentAccess = vi.fn().mockResolvedValue(undefined);
    const selected = await selectGitHubRepository({
      installationId: prepared.installationId,
      repository: {
        defaultBranch: "main",
        fullName: "arr/drifted-demo",
        githubRepositoryId: 424242,
      },
      saveSelection: vi.fn().mockResolvedValue({ repositoryId: REPOSITORY_ID }),
      verifyCurrentAccess,
      workspaceId,
    });

    expect(prepared.repositoryCount).toBe(1);
    expect(selected).toEqual({
      repositoryId: REPOSITORY_ID,
      status: "pending_first_scan",
    });
    expect(verifyCurrentAccess).toHaveBeenCalledWith(424242);
  });

  it("verifies recorded signatures, normalizes completion events, and deduplicates deliveries", async () => {
    const store: GitHubWebhookStore = {
      async insertEvent(event: PersistedGitHubWebhookEvent) {
        try {
          await database.query(
            `insert into public.github_webhook_deliveries
              (workspace_id, repository_id, delivery_id, event, action, conclusion, commit_sha, payload_digest)
             values ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              event.workspaceId,
              event.repositoryId,
              event.deliveryId,
              event.event,
              event.action,
              event.conclusion,
              event.commitSha,
              event.payloadDigest,
            ],
          );
          return "inserted";
        } catch (error) {
          if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "23505"
          ) {
            return "duplicate";
          }
          throw error;
        }
      },
      async resolveRepository(input) {
        if (
          input.installationId !== 777 ||
          input.repositoryGitHubId !== 424242 ||
          input.repositoryFullName !== "arr/drifted-demo"
        ) {
          return null;
        }
        return { id: REPOSITORY_ID, workspaceId };
      },
      async revokeInstallation() {
        return "unknown";
      },
    };
    const recordings = await Promise.all(
      ["push.json", "check-run.json", "workflow-run.json"].map((name) =>
        json<RecordedWebhook>(resolve(RECORDINGS, "webhooks", name)),
      ),
    );

    for (const recording of recordings) {
      const result = await handleGitHubWebhook({
        deliveryId: recording.headers["x-github-delivery"] ?? null,
        event: recording.headers["x-github-event"] ?? null,
        rawBody: JSON.stringify(recording.body),
        secret: webhookSecret,
        signature: recording.headers["x-hub-signature-256"] ?? null,
        store,
      });
      expect(result).toEqual({
        body: { duplicate: false, received: true },
        status: 200,
      });
    }

    const duplicateRecording = recordings[0];
    expect(duplicateRecording).toBeDefined();
    const duplicate = await handleGitHubWebhook({
      deliveryId: duplicateRecording?.headers["x-github-delivery"] ?? null,
      event: duplicateRecording?.headers["x-github-event"] ?? null,
      rawBody: JSON.stringify(duplicateRecording?.body),
      secret: webhookSecret,
      signature: duplicateRecording?.headers["x-hub-signature-256"] ?? null,
      store,
    });
    const beforeInvalid = await database.query<{ count: number }>(
      "select count(*)::integer as count from public.github_webhook_deliveries",
    );
    const invalid = await handleGitHubWebhook({
      deliveryId: "invalid-delivery",
      event: "push",
      rawBody: JSON.stringify(duplicateRecording?.body),
      secret: webhookSecret,
      signature: "sha256=" + "0".repeat(64),
      store,
    });
    const afterInvalid = await database.query<{ count: number }>(
      "select count(*)::integer as count from public.github_webhook_deliveries",
    );
    const events = await database.query<{ commit_sha: string; event: string }>(
      "select event, commit_sha from public.github_webhook_deliveries order by event",
    );

    expect(duplicate).toEqual({
      body: { duplicate: true, received: true },
      status: 200,
    });
    expect(invalid).toEqual({
      body: { error: "invalid_signature" },
      status: 401,
    });
    expect(beforeInvalid.rows[0]?.count).toBe(3);
    expect(afterInvalid.rows[0]?.count).toBe(3);
    expect(events.rows.map(({ event }) => event)).toEqual([
      "check_run",
      "push",
      "workflow_run",
    ]);
    expect(
      events.rows.every(({ commit_sha }) => commit_sha === "1".repeat(40)),
    ).toBe(true);
  });

  it("degrades safely when GitHub deletes an installation", async () => {
    const rawBody = JSON.stringify({
      action: "deleted",
      installation: { id: 777 },
    });
    const revokeInstallation = vi.fn().mockResolvedValue("revoked");
    const result = await handleGitHubWebhook({
      deliveryId: "installation-revoked-delivery",
      event: "installation",
      rawBody,
      secret: webhookSecret,
      signature: `sha256=${createHmac("sha256", webhookSecret).update(rawBody).digest("hex")}`,
      store: {
        insertEvent: vi.fn(),
        resolveRepository: vi.fn(),
        revokeInstallation,
      },
    });

    expect(result).toEqual({
      body: { duplicate: false, revoked: true },
      status: 200,
    });
    expect(revokeInstallation).toHaveBeenCalledWith({
      deliveryId: "installation-revoked-delivery",
      githubInstallationId: 777,
      reason: "deleted",
    });
  });

  it("rejects oversized webhook bodies before touching storage", async () => {
    const store: GitHubWebhookStore = {
      insertEvent: vi.fn(),
      resolveRepository: vi.fn(),
      revokeInstallation: vi.fn(),
    };
    const result = await handleGitHubWebhook({
      deliveryId: "oversized",
      event: "push",
      rawBody: "x".repeat(MAX_GITHUB_WEBHOOK_BODY_BYTES + 1),
      secret: webhookSecret,
      signature: null,
      store,
    });

    expect(result).toEqual({
      body: { error: "payload_too_large" },
      status: 413,
    });
    expect(store.resolveRepository).not.toHaveBeenCalled();
    expect(store.revokeInstallation).not.toHaveBeenCalled();
  });
});
