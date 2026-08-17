import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { localIngestPayloadSchema } from "@arr/core";

import { pushLocalProject } from "./push";

/** A string that exists only inside a source-file body — never in metadata. */
const BODY_SENTINEL = "RAW_BODY_SENTINEL_9f3d7c";

const roots: string[] = [];

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "arr-cli-push-"));
  roots.push(root);
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(
    join(root, "src", "engine.ts"),
    `export function computeAnswer(): string {\n  return "${BODY_SENTINEL}";\n}\n`,
    "utf8",
  );
  await writeFile(join(root, "TODO.md"), "- [ ] 파서 마무리\n", "utf8");
  await writeFile(join(root, "AGENTS.md"), "# 작업 규칙\n", "utf8");
  return root;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

interface RecordedRequest {
  readonly body: string | null;
  readonly method: string;
  readonly url: string;
}

function fakeServer(options?: {
  previous?: unknown;
  uploadStatus?: number;
}): { fetchImplementation: typeof fetch; requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = [];
  const fetchImplementation = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    requests.push({ body: (init?.body as string | undefined) ?? null, method, url });
    if (method === "GET") {
      return Response.json(
        options?.previous ?? { previous: { artifacts: [], commitSha: null } },
      );
    }
    if (options?.uploadStatus && options.uploadStatus !== 200) {
      return new Response("boom", { status: options.uploadStatus });
    }
    return Response.json({ touchedRows: 4 });
  }) as typeof fetch;
  return { fetchImplementation, requests };
}

const PUSH_DEFAULTS = {
  baseUrl: "https://arr.example.test",
  repositoryFullName: "local/demo",
  token: "sp_mcp_test-token",
};

describe("pushLocalProject", () => {
  it("uploads a schema-valid payload that carries no file body", async () => {
    const root = await fixture();
    const { fetchImplementation, requests } = fakeServer();

    const outcome = await pushLocalProject({
      ...PUSH_DEFAULTS,
      fetchImplementation,
      rootDir: root,
    });

    expect(outcome.status).toBe("uploaded");
    const upload = requests.find(({ method }) => method === "POST");
    expect(upload).toBeDefined();
    const body = upload!.body!;

    // The exact wire bytes parse against the strict metadata-only contract.
    const parsed = localIngestPayloadSchema.parse(JSON.parse(body));
    expect(parsed.plan.artifacts.length).toBeGreaterThanOrEqual(3);

    // Negative acceptance: the source body never leaves the machine…
    expect(body).not.toContain(BODY_SENTINEL);
    // …while genuine metadata does.
    expect(body).toContain("src/engine.ts");
    expect(body).toContain("computeAnswer");
    expect(body).toContain("파서 마무리");
  });

  it("short-circuits to unchanged when the server already has this commit", async () => {
    const root = await fixture();
    const first = fakeServer();
    const firstOutcome = await pushLocalProject({
      ...PUSH_DEFAULTS,
      fetchImplementation: first.fetchImplementation,
      rootDir: root,
    });
    expect(firstOutcome.status).toBe("uploaded");
    const uploadedCommit = (firstOutcome as { commitSha: string }).commitSha;

    const second = fakeServer({
      previous: { previous: { artifacts: [], commitSha: uploadedCommit } },
    });
    const secondOutcome = await pushLocalProject({
      ...PUSH_DEFAULTS,
      fetchImplementation: second.fetchImplementation,
      rootDir: root,
    });
    expect(secondOutcome).toEqual({
      commitSha: uploadedCommit,
      status: "unchanged",
    });
    // Nothing was uploaded the second time.
    expect(second.requests.filter(({ method }) => method === "POST")).toEqual([]);
  });

  it("reports offline when the server is unreachable, uploading nothing", async () => {
    const root = await fixture();
    const failing = (async () => {
      throw new Error("getaddrinfo ENOTFOUND arr.example.test");
    }) as unknown as typeof fetch;

    const outcome = await pushLocalProject({
      ...PUSH_DEFAULTS,
      fetchImplementation: failing,
      rootDir: root,
    });
    expect(outcome).toEqual({
      detail: "getaddrinfo ENOTFOUND arr.example.test",
      status: "offline",
    });
  });

  it("reports offline when only the upload leg fails", async () => {
    const root = await fixture();
    let calls = 0;
    const flaky = (async (_input: unknown, init?: RequestInit) => {
      calls += 1;
      if ((init?.method ?? "GET") === "GET") {
        return Response.json({ previous: { artifacts: [], commitSha: null } });
      }
      throw new Error("socket hang up");
    }) as typeof fetch;

    const outcome = await pushLocalProject({
      ...PUSH_DEFAULTS,
      fetchImplementation: flaky,
      rootDir: root,
    });
    expect(outcome).toEqual({ detail: "socket hang up", status: "offline" });
    expect(calls).toBe(2);
  });

  it("maps 401 to auth-failed", async () => {
    const root = await fixture();
    const unauthorized = (async () =>
      new Response("{}", { status: 401 })) as unknown as typeof fetch;
    const outcome = await pushLocalProject({
      ...PUSH_DEFAULTS,
      fetchImplementation: unauthorized,
      rootDir: root,
    });
    expect(outcome).toEqual({ status: "auth-failed" });
  });

  it("surfaces a failed upload as a server error with the body verbatim", async () => {
    const root = await fixture();
    const { fetchImplementation } = fakeServer({ uploadStatus: 500 });
    const outcome = await pushLocalProject({
      ...PUSH_DEFAULTS,
      fetchImplementation,
      rootDir: root,
    });
    expect(outcome).toEqual({
      detail: "boom",
      httpStatus: 500,
      status: "server-error",
    });
  });
});
