import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { fetchDefaultBranchHead } from "./api";
import { resolveConnectHead, scheduleBackfillAtHead } from "./backfill-scan";

/**
 * The head read that makes the backfill fire (Phase 4 Wave C todo 16).
 *
 * `scheduleBackfillScan` has been correct since 2026-09-06 and has never run
 * in production: `connectSelectedRepository` took the head as an argument
 * and neither route supplied one, so every connect answered `scheduled:
 * false` — honestly, and uselessly. These pin the read and the two ways it
 * can decline, so the connect stays one that never fails over its scan.
 */

const HEAD = "c".repeat(40);
const REQUEST = {
  branch: "main",
  fullName: "acme/app",
  token: "installation-secret",
};

describe("fetchDefaultBranchHead", () => {
  it("reads the branch head with the installation token and never leaks it into the URL", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ commit: { sha: HEAD } }), {
        status: 200,
      }),
    );

    const head = await fetchDefaultBranchHead(REQUEST, fetchImplementation);

    expect(head).toEqual({ sha: HEAD });
    const [url, request] = fetchImplementation.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "https://api.github.com/repos/acme/app/branches/main",
    );
    expect(String(url)).not.toContain("installation-secret");
    expect(new Headers(request?.headers).get("authorization")).toBe(
      "Bearer installation-secret",
    );
  });

  it("escapes a branch name GitHub would otherwise read as a path", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ commit: { sha: HEAD } }), {
        status: 200,
      }),
    );

    await fetchDefaultBranchHead(
      { ...REQUEST, branch: "release/2026.09" },
      fetchImplementation,
    );

    expect(String(fetchImplementation.mock.calls[0]?.[0])).toBe(
      "https://api.github.com/repos/acme/app/branches/release%2F2026.09",
    );
  });

  it("reports an empty repository (404) as a head it could not read, not a failure", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("", { status: 404 }));

    expect(await fetchDefaultBranchHead(REQUEST, fetchImplementation)).toEqual({
      error: "GitHub branch request failed: 404",
    });
  });

  it("refuses a sha that is not forty hex characters", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ commit: { sha: "HEAD" } }), {
        status: 200,
      }),
    );

    expect(await fetchDefaultBranchHead(REQUEST, fetchImplementation)).toEqual({
      error: "GitHub branch response is malformed.",
    });
  });

  it("turns a network failure into a reason rather than an exception", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("ECONNRESET"));

    expect(await fetchDefaultBranchHead(REQUEST, fetchImplementation)).toEqual({
      error: "GitHub branch request failed: ECONNRESET",
    });
  });
});

describe("resolveConnectHead", () => {
  const readHead = vi.fn(async () => ({ sha: HEAD }));

  it("uses a head the caller already knows without a GitHub call", async () => {
    readHead.mockClear();
    const head = await resolveConnectHead({
      defaultBranch: "main",
      fullName: "acme/app",
      providedHead: "d".repeat(40),
      readHead,
      token: "installation-secret",
    });

    expect(head).toEqual({ sha: "d".repeat(40) });
    expect(readHead).not.toHaveBeenCalled();
  });

  it("reads the default branch with the token the connect minted", async () => {
    readHead.mockClear();
    const head = await resolveConnectHead({
      defaultBranch: "trunk",
      fullName: "acme/app",
      providedHead: undefined,
      readHead,
      token: "installation-secret",
    });

    expect(head).toEqual({ sha: HEAD });
    expect(readHead).toHaveBeenCalledWith({
      branch: "trunk",
      fullName: "acme/app",
      token: "installation-secret",
    });
  });

  it("says so when no token was minted instead of calling GitHub unauthenticated", async () => {
    readHead.mockClear();
    const head = await resolveConnectHead({
      defaultBranch: "main",
      fullName: "acme/app",
      providedHead: null,
      readHead,
      token: null,
    });

    expect(head).toEqual({
      error: "no installation token was minted for the repository",
    });
    expect(readHead).not.toHaveBeenCalled();
  });
});

describe("scheduleBackfillAtHead", () => {
  it("queues the backfill at a known head", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "job-1", error: null });

    const result = await scheduleBackfillAtHead({
      client: { rpc } as unknown as SupabaseClient,
      head: { sha: HEAD },
      repositoryId: "repo-1",
      workspaceId: "ws-1",
    });

    expect(result).toEqual({
      jobId: "job-1",
      reason: "scheduled",
      scheduled: true,
    });
    expect(rpc).toHaveBeenCalledWith("enqueue_backfill_scan", {
      head_commit_sha: HEAD,
      target_repository_id: "repo-1",
      target_workspace_id: "ws-1",
    });
  });

  it("carries the read's reason when there is no head, and never reaches the queue", async () => {
    const rpc = vi.fn();

    const result = await scheduleBackfillAtHead({
      client: { rpc } as unknown as SupabaseClient,
      head: { error: "GitHub branch request failed: 404" },
      repositoryId: "repo-1",
      workspaceId: "ws-1",
    });

    expect(result).toEqual({
      jobId: null,
      reason:
        "the repository's head commit could not be read: GitHub branch request failed: 404",
      scheduled: false,
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});
