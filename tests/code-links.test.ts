import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  parsePythonLinks,
  parseTypeScriptLinks,
  resolveCodeLinks,
  scanRepository,
  type CodeLink,
} from "../packages/core/src/index";
import { createLocalRepositorySource } from "../packages/cli/src/local-source";
import {
  ALL_MIGRATIONS,
  asServiceRole,
  createTestDatabase,
} from "./helpers/database";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const DRIFTED_DEMO = resolve(repoRoot, "fixtures/drifted-demo");

/**
 * Phase 3 Wave B todo 3 — structural code links with tier honesty.
 *
 * `resolved` only for deterministic connections (module resolution, import
 * binding); `reference` for single-owner name matches; nothing for ambiguity.
 */

function linksOf(input: {
  files: Record<string, string>;
  pythonFiles?: readonly string[];
  exports?: Record<string, readonly string[]>;
}): CodeLink[] {
  const parsed = new Map(
    Object.entries(input.files).map(([path, source]) => [
      path,
      (input.pythonFiles ?? []).includes(path)
        ? parsePythonLinks(source)
        : parseTypeScriptLinks(path, source),
    ]),
  );
  const exportsByPath = new Map(
    Object.entries(input.exports ?? {}).map(([path, names]) => [
      path,
      new Set(names),
    ]),
  );
  const knownPaths = new Set([
    ...Object.keys(input.files),
    ...Object.keys(input.exports ?? {}),
  ]);
  return resolveCodeLinks({ exportsByPath, files: parsed, knownPaths });
}

describe("code link extraction (Wave B todo 3)", () => {
  it("resolves relative imports against the tree, index and NodeNext forms included", () => {
    const links = linksOf({
      exports: {
        "src/b.ts": ["helper"],
        "src/util/index.ts": ["default"],
      },
      files: {
        "src/a.ts": [
          `import { helper } from "./b";`,
          `import util from "./util";`,
          `import nodeNext from "./b.js";`,
          `import external from "react";`,
          `export const run = () => helper();`,
        ].join("\n"),
      },
    });

    const imports = links.filter((link) => link.kind === "imports");
    expect(imports.map((link) => link.targetPath).sort()).toEqual([
      "src/b.ts",
      "src/util/index.ts",
    ]);
    for (const link of imports) {
      expect(link.tier).toBe("resolved");
      expect(link.method).toBe("module-resolution");
    }
    // The external package produced nothing — no guessed edges.
    expect(links.some((link) => link.targetPath.includes("react"))).toBe(false);
  });

  it("binds calls through imports as resolved, namespace members included", () => {
    const links = linksOf({
      exports: { "src/b.ts": ["helper", "other"] },
      files: {
        "src/a.ts": [
          `import { helper } from "./b";`,
          `import * as ns from "./b";`,
          `export function main() {`,
          `  helper();`,
          `  ns.other();`,
          `}`,
        ].join("\n"),
      },
    });
    const calls = links.filter((link) => link.kind === "calls");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: "import-binding",
      sourcePath: "src/a.ts",
      targetPath: "src/b.ts",
      tier: "resolved",
    });
    expect(calls[0]?.symbols).toEqual(["helper", "other"]);
  });

  it("name-matches a bare call only when exactly one file exports it", () => {
    const files = {
      "src/a.ts": [
        `export function main() {`,
        `  shared();`,
        `  ambiguous();`,
        `  local();`,
        `}`,
        `function local() {}`,
      ].join("\n"),
    };
    const links = linksOf({
      exports: {
        "src/c.ts": ["shared", "ambiguous"],
        "src/d.ts": ["ambiguous"],
      },
      files,
    });
    const calls = links.filter((link) => link.kind === "calls");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: "name-match",
      targetPath: "src/c.ts",
      tier: "reference",
    });
    expect(calls[0]?.symbols).toEqual(["shared"]);
  });

  it("keeps python imports structural: reference tier, dots resolved", () => {
    const links = linksOf({
      exports: { "pkg/mod.py": ["thing"], "pkg/__init__.py": [] },
      files: {
        "pkg/main.py": [
          `import pkg.mod`,
          `from .mod import thing`,
          `from missing import nothing`,
        ].join("\n"),
      },
      pythonFiles: ["pkg/main.py"],
    });
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      kind: "imports",
      sourcePath: "pkg/main.py",
      targetPath: "pkg/mod.py",
      tier: "reference",
    });
  });

  it("the fixture repository yields its real test→source wiring", async () => {
    const { commitSha, source } =
      await createLocalRepositorySource(DRIFTED_DEMO);
    const startedAt = performance.now();
    const plan = await scanRepository({ commitSha, source });
    const elapsedMs = performance.now() - startedAt;

    const wiring = plan.codeLinks.filter(
      (link) =>
        link.sourcePath === "tests/session.test.ts" &&
        link.targetPath === "src/session.ts",
    );
    expect(wiring.map((link) => link.kind).sort()).toEqual([
      "calls",
      "imports",
    ]);
    expect(wiring.every((link) => link.tier === "resolved")).toBe(true);
    expect(wiring.find((link) => link.kind === "calls")?.symbols).toContain(
      "isSessionExpired",
    );

    // Regression guard: link extraction must not blow up scan time. The
    // fixture scans in well under a second today; 10s is the alarm line.
    expect(elapsedMs).toBeLessThan(10_000);
  });
});

const USER_A = "81111111-1111-4111-8111-111111111111";
const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const DIGEST = "0".repeat(64);

function planArtifact(path: string, commitSha: string) {
  return {
    classification: "code_metadata",
    digest: DIGEST,
    exportedSymbols: [],
    kind: "code_metadata",
    path,
    rationales: [],
    sizeBytes: 10,
    sourceBlobSha: commitSha,
    sourceCommitSha: commitSha,
    symbolEngine: "typescript-ast",
    todoItems: [],
  };
}

function planLink(sourcePath: string, targetPath: string, kind: string) {
  return {
    kind,
    method: "module-resolution",
    sourcePath,
    span: { endLine: 1, startLine: 1 },
    symbols: ["helper"],
    targetPath,
    tier: "resolved",
  };
}

describe("code link edges persist incrementally (Wave B todo 3)", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let workspaceId: string;
  let repositoryId: string;

  beforeEach(async () => {
    database = await createTestDatabase([...ALL_MIGRATIONS]);
    await database.query(
      "insert into auth.users (id, email) values ($1, 'links@example.test')",
      [USER_A],
    );
    const workspaces = await database.query<{ id: string }>(
      "select id from public.workspaces",
    );
    workspaceId = workspaces.rows[0]?.id ?? "";
    const repository = await database.query<{ id: string }>(
      "select public.ensure_local_repository($1, 'local/links') as id",
      [workspaceId],
    );
    repositoryId = repository.rows[0]?.id ?? "";
  });

  afterEach(async () => {
    await database.close();
  });

  async function apply(plan: unknown): Promise<void> {
    await database.query(
      "select public.apply_repository_scan($1, $2, $3::jsonb)",
      [workspaceId, repositoryId, JSON.stringify(plan)],
    );
  }

  async function edgeRows(): Promise<
    { relation: string; source: string; target: string; tier: string }[]
  > {
    const rows = await asServiceRole(database, (tx) =>
      tx.query<{
        provenance: { tier?: string };
        relation: string;
        source_path: string;
        target_path: string;
      }>(
        `select e.relation, e.provenance,
                source_artifact.path as source_path,
                target_artifact.path as target_path
         from public.edges e
         join public.artifacts source_artifact on source_artifact.id = e.source_node_id
         join public.artifacts target_artifact on target_artifact.id = e.target_node_id
         where e.relation in ('imports', 'calls')
         order by source_artifact.path, target_artifact.path, e.relation`,
      ),
    );
    return rows.rows.map((row) => ({
      relation: row.relation,
      source: row.source_path,
      target: row.target_path,
      tier: row.provenance.tier ?? "",
    }));
  }

  it("a rescanned file replaces its outgoing structure edges, others keep theirs", async () => {
    await apply({
      artifacts: [
        planArtifact("src/a.ts", SHA_A),
        planArtifact("src/b.ts", SHA_A),
        planArtifact("src/c.ts", SHA_A),
      ],
      codeLinks: [
        planLink("src/a.ts", "src/b.ts", "imports"),
        planLink("src/a.ts", "src/b.ts", "calls"),
        planLink("src/c.ts", "src/b.ts", "imports"),
      ],
      commitSha: SHA_A,
      removedPaths: [],
      skipped: [],
      touchedRows: 3,
      treeSha: SHA_B,
      unchangedPaths: [],
    });

    expect(await edgeRows()).toEqual([
      {
        relation: "calls",
        source: "src/a.ts",
        target: "src/b.ts",
        tier: "resolved",
      },
      {
        relation: "imports",
        source: "src/a.ts",
        target: "src/b.ts",
        tier: "resolved",
      },
      {
        relation: "imports",
        source: "src/c.ts",
        target: "src/b.ts",
        tier: "resolved",
      },
    ]);

    // Incremental rescan: only src/a.ts changed, now importing src/c.ts.
    await apply({
      artifacts: [
        { ...planArtifact("src/a.ts", SHA_B), digest: "1".repeat(64) },
      ],
      codeLinks: [planLink("src/a.ts", "src/c.ts", "imports")],
      commitSha: SHA_B,
      removedPaths: [],
      skipped: [],
      touchedRows: 1,
      treeSha: SHA_A,
      unchangedPaths: ["src/b.ts", "src/c.ts"],
    });

    expect(await edgeRows()).toEqual([
      {
        relation: "imports",
        source: "src/a.ts",
        target: "src/c.ts",
        tier: "resolved",
      },
      {
        relation: "imports",
        source: "src/c.ts",
        target: "src/b.ts",
        tier: "resolved",
      },
    ]);
  });

  it("a link whose target was never stored is skipped, not invented", async () => {
    await apply({
      artifacts: [planArtifact("src/a.ts", SHA_A)],
      codeLinks: [planLink("src/a.ts", "src/skipped.ts", "imports")],
      commitSha: SHA_A,
      removedPaths: [],
      skipped: [],
      touchedRows: 1,
      treeSha: SHA_B,
      unchangedPaths: [],
    });
    expect(await edgeRows()).toEqual([]);
  });
});
