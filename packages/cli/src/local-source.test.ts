import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createLocalRepositorySource, gitBlobSha } from "./local-source";

const roots: string[] = [];

async function fixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "arr-cli-source-"));
  roots.push(root);
  for (const [path, content] of Object.entries(files)) {
    const absolute = join(root, ...path.split("/"));
    await mkdir(join(absolute, ".."), { recursive: true });
    await writeFile(absolute, content, "utf8");
  }
  return root;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe("createLocalRepositorySource", () => {
  it("hashes blobs exactly the way git does", () => {
    expect(gitBlobSha(new TextEncoder().encode("hello\n"))).toBe(
      "ce013625030ba8dba906f756967f9e9ca394464a",
    );
  });

  it("is deterministic: same content, same virtual commit", async () => {
    const root = await fixture({
      "AGENTS.md": "# 규칙\n",
      "src/index.ts": "export const answer = 42;\n",
    });
    const first = await createLocalRepositorySource(root);
    const second = await createLocalRepositorySource(root);
    expect(second.commitSha).toBe(first.commitSha);
    expect(second.treeSha).toBe(first.treeSha);
    expect(first.commitSha).toMatch(/^[0-9a-f]{40}$/);
  });

  it("changes the commit when any file body changes", async () => {
    const root = await fixture({ "src/index.ts": "export const a = 1;\n" });
    const before = await createLocalRepositorySource(root);
    await writeFile(join(root, "src", "index.ts"), "export const a = 2;\n");
    const after = await createLocalRepositorySource(root);
    expect(after.commitSha).not.toBe(before.commitSha);
  });

  it("excludes vcs internals and build outputs like a git tree would", async () => {
    const root = await fixture({
      ".git/config": "[core]\n",
      "node_modules/pkg/index.js": "module.exports = 1;\n",
      "src/index.ts": "export const a = 1;\n",
    });
    const { source } = await createLocalRepositorySource(root);
    const tree = await source.listTree("0".repeat(40));
    expect(tree.entries.map(({ path }) => path)).toEqual(["src/index.ts"]);
  });

  it.skipIf(process.platform === "win32")(
    "presents symlinks as mode 120000 so the scanner skips them",
    async () => {
      const root = await fixture({ "real.md": "# 문서\n" });
      await symlink(join(root, "real.md"), join(root, "link.md"));
      const { source } = await createLocalRepositorySource(root);
      const tree = await source.listTree("0".repeat(40));
      expect(
        tree.entries.find(({ path }) => path === "link.md")?.mode,
      ).toBe("120000");
    },
  );

  it("serves file bytes transiently for the scanner", async () => {
    const root = await fixture({ "spec/spec.md": "# 스펙\n" });
    const { source } = await createLocalRepositorySource(root);
    const bytes = await source.fetchContent("spec/spec.md", "0".repeat(40));
    expect(new TextDecoder().decode(bytes)).toBe("# 스펙\n");
  });
});
