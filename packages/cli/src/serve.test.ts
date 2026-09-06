import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { main } from "./alrescha";
import { serveLocalProject } from "./serve";

/**
 * `alrescha serve --local` (Phase 4 Wave C todo 17, OQ-030 ⑴).
 *
 * The projection is compared against the scan SQL in
 * `tests/local-serve.test.ts` and the protocol in
 * `packages/mcp/src/local-serve.test.ts`. What is checked here is the CLI's
 * own two obligations: that a directory on disk becomes a real graph without
 * a server or a token, and that **nothing human-facing is written to
 * stdout** — a client that spawned this process is reading stdout as
 * JSON-RPC, and one stray line corrupts the first message.
 */

/** A string that exists only inside a file body. */
const BODY_SENTINEL = "SERVE_BODY_SENTINEL_2a91f7";

const roots: string[] = [];

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "arr-cli-serve-"));
  roots.push(root);
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(
    join(root, "src", "engine.ts"),
    `export function computeAnswer(): string {\n  return "${BODY_SENTINEL}";\n}\n`,
    "utf8",
  );
  await writeFile(
    join(root, "src", "app.ts"),
    'import { computeAnswer } from "./engine";\n\nexport const answer = computeAnswer();\n',
    "utf8",
  );
  await writeFile(
    join(root, "README.md"),
    "# 데모\n\n`src/engine.ts`가 답을 계산한다.\n",
    "utf8",
  );
  await writeFile(
    join(root, "package.json"),
    '{\n  "name": "@demo/served",\n  "exports": { ".": "./src/app.ts" }\n}\n',
    "utf8",
  );
  return root;
}

/** A transport that goes nowhere: this suite never speaks the protocol. */
function silentTransport() {
  return {
    close: async () => {},
    send: async () => {},
    start: async () => {},
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

describe("serving a local project", () => {
  it("turns a directory into a graph with no server and no token", async () => {
    const root = await fixture();
    const outcome = await serveLocalProject({
      repositoryFullName: "local/served",
      rootDir: root,
      transport: silentTransport(),
    });
    try {
      expect(outcome.artifactCount).toBeGreaterThanOrEqual(4);
      // The import and the document's mention of the file are both real
      // relationships — a served graph with no edges would be a file list.
      expect(outcome.edgeCount).toBeGreaterThan(0);
      expect(outcome.commitSha).toMatch(/^[0-9a-f]{40}$/);

      const workspace = await outcome.handle.store.loadWorkspace(
        outcome.handle.principal,
      );
      const repository = workspace.repositories[0];
      expect(repository?.fullName).toBe("local/served");
      expect(repository?.edges.map((edge) => edge.relation)).toContain(
        "imports",
      );

      // Hard rule ③: bodies are read to build the graph and are not carried
      // in it. The served workspace is the whole answer surface.
      expect(JSON.stringify(workspace)).not.toContain(BODY_SENTINEL);
    } finally {
      await outcome.handle.close();
    }
  });

  /**
   * A scan is always full here. Nothing is stored between runs, so an
   * incremental pass would have nothing to be incremental against.
   */
  it("scans in full, so the graph does not depend on what changed", async () => {
    const root = await fixture();
    const outcome = await serveLocalProject({
      repositoryFullName: "local/served",
      rootDir: root,
      transport: silentTransport(),
    });
    try {
      expect(outcome.plan.linkScope).toBe("full");
      expect(outcome.plan.unchangedPaths).toEqual([]);
    } finally {
      await outcome.handle.close();
    }
  });
});

describe("the serve command line", () => {
  it("writes nothing to stdout, because stdout is the wire", async () => {
    const root = await fixture();
    const out = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    // `--local` is required, and refusing early is the branch that reaches a
    // terminal rather than a client.
    await expect(main(["serve"])).resolves.toBe(1);
    expect(out).not.toHaveBeenCalled();
    expect(err.mock.calls.flat().join(" ")).toMatch(/--local/);

    const outcome = await serveLocalProject({
      repositoryFullName: `local/${root}`,
      rootDir: root,
      transport: silentTransport(),
    });
    await outcome.handle.close();
    expect(out).not.toHaveBeenCalled();
  });

  it("refuses an unknown command with the usage that names both", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(main(["sync"])).resolves.toBe(1);
    const printed = err.mock.calls.flat().join(" ");
    expect(printed).toContain("alrescha push");
    expect(printed).toContain("alrescha serve --local");
  });
});
