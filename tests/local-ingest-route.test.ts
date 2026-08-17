import { describe, expect, it } from "vitest";

import {
  handleLocalIngestPreviousState,
  handleLocalIngestUpload,
  type LocalIngestStore,
} from "../packages/core/src/index";

const VALID_TOKEN = "sp_mcp_valid";
const READONLY_TOKEN = "sp_mcp_readonly";

const EMPTY_PLAN = {
  artifacts: [],
  commitSha: "a".repeat(40),
  removedPaths: [],
  skipped: [],
  touchedRows: 0,
  treeSha: "b".repeat(40),
  unchangedPaths: [],
};

interface FakeCall {
  readonly method: string;
  readonly payload: unknown;
}

function fakeStore(): { calls: FakeCall[]; store: LocalIngestStore } {
  const calls: FakeCall[] = [];
  const store: LocalIngestStore = {
    async authenticateToken(secret) {
      if (secret === VALID_TOKEN) {
        return { scopes: ["mcp:read", "mcp:write"], workspaceId: "ws-1" };
      }
      if (secret === READONLY_TOKEN) {
        return { scopes: ["mcp:read"], workspaceId: "ws-1" };
      }
      return null;
    },
    async applyScanPlan(_workspaceId, _repositoryId, plan) {
      calls.push({ method: "applyScanPlan", payload: plan });
      return plan.touchedRows + 1;
    },
    async ensureRepository(_workspaceId, fullName) {
      calls.push({ method: "ensureRepository", payload: fullName });
      return "repo-1";
    },
    async findRepository(_workspaceId, fullName) {
      return fullName === "local/known" ? "repo-1" : null;
    },
    async loadPreviousScan() {
      return { artifacts: [], commitSha: "c".repeat(40) };
    },
  };
  return { calls, store };
}

function postRequest(body: unknown, token = VALID_TOKEN): Request {
  return new Request("https://arr.example.test/api/ingest/local", {
    body: JSON.stringify(body),
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
}

describe("local ingest route handlers", () => {
  it("rejects requests without a bearer token", async () => {
    const { store } = fakeStore();
    const response = await handleLocalIngestUpload(
      new Request("https://arr.example.test/api/ingest/local", {
        body: "{}",
        method: "POST",
      }),
      store,
    );
    expect(response.status).toBe(401);
  });

  it("rejects an unknown token", async () => {
    const { store } = fakeStore();
    const response = await handleLocalIngestUpload(
      postRequest({ plan: EMPTY_PLAN, repositoryFullName: "local/demo" }, "wrong"),
      store,
    );
    expect(response.status).toBe(401);
  });

  it("requires the write scope to upload", async () => {
    const { calls, store } = fakeStore();
    const response = await handleLocalIngestUpload(
      postRequest(
        { plan: EMPTY_PLAN, repositoryFullName: "local/demo" },
        READONLY_TOKEN,
      ),
      store,
    );
    expect(response.status).toBe(403);
    expect(calls).toEqual([]);
  });

  it("accepts a valid metadata payload and applies it", async () => {
    const { calls, store } = fakeStore();
    const response = await handleLocalIngestUpload(
      postRequest({ plan: EMPTY_PLAN, repositoryFullName: "local/demo" }),
      store,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      commitSha: EMPTY_PLAN.commitSha,
      repositoryId: "repo-1",
      touchedRows: 1,
    });
    expect(calls.map(({ method }) => method)).toEqual([
      "ensureRepository",
      "applyScanPlan",
    ]);
  });

  it.each([
    [
      "a top-level body field",
      { fileBodies: { "src/a.ts": "raw" }, plan: EMPTY_PLAN, repositoryFullName: "local/demo" },
    ],
    [
      "a plan-level body field",
      {
        plan: { ...EMPTY_PLAN, contents: ["raw source"] },
        repositoryFullName: "local/demo",
      },
    ],
    [
      "an artifact-level body field",
      {
        plan: {
          ...EMPTY_PLAN,
          artifacts: [
            {
              classification: "code_metadata",
              content: "export const raw = 1;",
              digest: "d".repeat(64),
              exportedSymbols: [],
              kind: "code_metadata",
              path: "src/a.ts",
              sizeBytes: 21,
              sourceBlobSha: "e".repeat(40),
              sourceCommitSha: "a".repeat(40),
              todoItems: [],
            },
          ],
          touchedRows: 1,
        },
        repositoryFullName: "local/demo",
      },
    ],
  ])(
    "rejects a payload smuggling %s — nothing is persisted",
    async (_label, body) => {
      const { calls, store } = fakeStore();
      const response = await handleLocalIngestUpload(postRequest(body), store);
      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe("invalid_payload");
      expect(calls).toEqual([]);
    },
  );

  it("rejects unparseable json", async () => {
    const { store } = fakeStore();
    const response = await handleLocalIngestUpload(
      new Request("https://arr.example.test/api/ingest/local", {
        body: "not-json",
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
        method: "POST",
      }),
      store,
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("invalid_json");
  });

  it("serves the previous state for a known repository", async () => {
    const { store } = fakeStore();
    const response = await handleLocalIngestPreviousState(
      new Request(
        "https://arr.example.test/api/ingest/local?repository=local/known",
        { headers: { authorization: `Bearer ${READONLY_TOKEN}` } },
      ),
      store,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      previous: { artifacts: [], commitSha: "c".repeat(40) },
    });
  });

  it("serves an empty previous state for an unknown repository", async () => {
    const { store } = fakeStore();
    const response = await handleLocalIngestPreviousState(
      new Request(
        "https://arr.example.test/api/ingest/local?repository=local/new",
        { headers: { authorization: `Bearer ${VALID_TOKEN}` } },
      ),
      store,
    );
    expect(await response.json()).toEqual({
      previous: { artifacts: [], commitSha: null },
    });
  });

  it("rejects a malformed repository name", async () => {
    const { store } = fakeStore();
    const response = await handleLocalIngestPreviousState(
      new Request(
        "https://arr.example.test/api/ingest/local?repository=not-a-repo",
        { headers: { authorization: `Bearer ${VALID_TOKEN}` } },
      ),
      store,
    );
    expect(response.status).toBe(400);
  });
});
