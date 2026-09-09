import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  parsePythonLinks,
  parseTypeScriptLinks,
  resolveCodeLinks,
  scanRepository,
  type CodeLink,
  type PreviousScannedArtifact,
} from "../packages/core/src/index";
import { createLocalRepositorySource } from "../packages/cli/src/local-source";
import {
  ALL_MIGRATIONS,
  asServiceRole,
  createTestDatabase,
} from "./helpers/database";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const DRIFTED_DEMO = resolve(repoRoot, "fixtures/drifted-demo");
const MONOREPO_ALIASES = resolve(
  repoRoot,
  "fixtures/layout-variants/monorepo-aliases",
);
const NEXT_FASTAPI = resolve(repoRoot, "fixtures/layout-variants/next-fastapi");

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

  it("stays ambiguous when the calling file is itself among a symbol's exporters (QW-16 self-exclusion)", () => {
    // Three files' export metadata credits them with `shared` — including
    // the caller, src/a.ts, which the exportedSymbols scan can list without
    // a matching local declaration (e.g. a re-export the AST walk here
    // doesn't itself track as `localNames`). `shared` is never resolved
    // through an import binding, so this reaches the name-match pass, where
    // self must not count as an owner — but the two real *other* owners
    // (b, c) still make it ambiguous.
    //
    // This specifically guards the owner-cap: capping at 2 raw owners
    // before filtering self out could see only [a.ts, b.ts], filter self
    // out, and wrongly call the remaining [b.ts] a single-owner match.
    const links = linksOf({
      exports: {
        "src/a.ts": ["shared"],
        "src/b.ts": ["shared"],
        "src/c.ts": ["shared"],
      },
      files: {
        "src/a.ts": [`export function main() {`, `  shared();`, `}`].join("\n"),
      },
    });
    expect(links.filter((link) => link.kind === "calls")).toHaveLength(0);
  });

  it("still name-matches when the calling file exports the symbol but only one other file does", () => {
    // Self is one of the owners, but only one genuine *other* owner exists
    // — the cap must still resolve this to a single match, not overcount
    // self as ambiguity.
    const links = linksOf({
      exports: {
        "src/a.ts": ["shared"],
        "src/b.ts": ["shared"],
      },
      files: {
        "src/a.ts": [`export function main() {`, `  shared();`, `}`].join("\n"),
      },
    });
    const calls = links.filter((link) => link.kind === "calls");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: "name-match",
      targetPath: "src/b.ts",
      tier: "reference",
    });
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
      "tests",
    ]);
    expect(
      wiring
        .filter((link) => link.kind !== "tests")
        .every((link) => link.tier === "resolved"),
    ).toBe(true);
    expect(wiring.find((link) => link.kind === "calls")?.symbols).toContain(
      "isSessionExpired",
    );

    // The derived coverage relation is a *reference*: the file is exercised,
    // which is not a passing run. Recording it at `resolved` would let the
    // map read a test import as execution evidence (WORK_SPEC §3-1, OQ-036).
    const coverage = wiring.find((link) => link.kind === "tests");
    expect(coverage).toMatchObject({
      method: "test-import",
      tier: "reference",
    });
    expect(
      plan.codeLinks.some(
        (link) => link.kind === "tests" && link.tier === "resolved",
      ),
    ).toBe(false);

    // Regression guard: link extraction must not blow up scan time. The
    // fixture scans in well under a second today; 10s is the alarm line.
    expect(elapsedMs).toBeLessThan(10_000);
  });
});

/**
 * Phase 4 Wave A todo 0 — non-relative specifiers.
 *
 * Before this, `resolveTypeScriptSpecifier` returned null for anything not
 * starting with `.`, so a package name, a tsconfig alias and a Python package
 * import all produced no edge. These cases are stated against two fixture
 * repositories rather than against this repository's own counts, because a
 * repo-wide edge total cannot tell a working alias resolver from a broken one
 * — this repository imports across packages in only 96 places.
 */
describe("non-relative specifier resolution (Phase 4 Wave A todo 0)", () => {
  function edgeOf(
    links: readonly CodeLink[],
    sourcePath: string,
    targetPath: string,
    kind: string,
  ): CodeLink | undefined {
    return links.find(
      (link) =>
        link.sourcePath === sourcePath &&
        link.targetPath === targetPath &&
        link.kind === kind,
    );
  }

  it("resolves workspace package names, subpath exports and tsconfig paths", async () => {
    const { commitSha, source } =
      await createLocalRepositorySource(MONOREPO_ALIASES);
    const plan = await scanRepository({ commitSha, source });

    // `import { greet } from "@demo/core"` — the package's `exports` entry is
    // a barrel, so the edge lands on the file that declares `greet`, not on
    // the index every package in the workspace would otherwise fan into.
    expect(
      edgeOf(
        plan.codeLinks,
        "apps/web/src/page.ts",
        "packages/core/src/greet.ts",
        "imports",
      ),
    ).toMatchObject({ method: "barrel-resolution", tier: "resolved" });

    // `@demo/core/util` — a subpath export states the mapping outright.
    expect(
      edgeOf(
        plan.codeLinks,
        "apps/web/src/page.ts",
        "packages/core/src/util.ts",
        "imports",
      ),
    ).toMatchObject({ method: "alias-resolution", tier: "resolved" });

    // A name re-exported by `export * from "./util"` resolves only because
    // exactly one starred target exports it.
    expect(
      edgeOf(
        plan.codeLinks,
        "apps/web/src/star.ts",
        "packages/core/src/util.ts",
        "imports",
      ),
    ).toMatchObject({ method: "barrel-resolution", tier: "resolved" });

    // `~/helpers` — a tsconfig path alias, scoped to the app that declares it.
    expect(
      edgeOf(
        plan.codeLinks,
        "apps/web/src/other.ts",
        "apps/web/src/helpers.ts",
        "imports",
      ),
    ).toMatchObject({ method: "alias-resolution", tier: "resolved" });

    // Calls bind through the alias too, all the way to the declaring file.
    expect(
      edgeOf(
        plan.codeLinks,
        "apps/web/src/page.ts",
        "packages/core/src/greet.ts",
        "calls",
      ),
    ).toMatchObject({ method: "import-binding", tier: "resolved" });

    // Nothing was invented: every link names a file the scan actually saw.
    const scanned = new Set(plan.artifacts.map(({ path }) => path));
    for (const link of plan.codeLinks) {
      expect(scanned.has(link.sourcePath)).toBe(true);
      expect(scanned.has(link.targetPath)).toBe(true);
    }
  });

  it("resolves a Next.js @/ alias and a FastAPI source root, and derives coverage", async () => {
    const { commitSha, source } =
      await createLocalRepositorySource(NEXT_FASTAPI);
    const plan = await scanRepository({ commitSha, source });

    expect(
      edgeOf(
        plan.codeLinks,
        "frontend/lib/api.ts",
        "frontend/lib/format.ts",
        "imports",
      ),
    ).toMatchObject({ method: "alias-resolution", tier: "resolved" });

    // `@/components` is a directory: the alias resolves to its index, and the
    // barrel walk then attributes the named import to the declaring file.
    expect(
      edgeOf(
        plan.codeLinks,
        "frontend/app/page.tsx",
        "frontend/components/card.tsx",
        "imports",
      ),
    ).toMatchObject({ method: "barrel-resolution", tier: "resolved" });

    // `from app.core.config import settings`, written inside backend/, means
    // backend/app/core/config.py — the module is relative to the project root
    // that pyproject.toml marks, not to the repository root.
    expect(
      edgeOf(
        plan.codeLinks,
        "backend/app/api/routes.py",
        "backend/app/core/config.py",
        "imports",
      ),
    ).toMatchObject({ method: "module-resolution", tier: "reference" });

    // Coverage is derived on both sides of the repository, and is never
    // stronger than a reference (WORK_SPEC §3-1).
    const coverage = plan.codeLinks.filter((link) => link.kind === "tests");
    expect(
      coverage.map((link) => `${link.sourcePath} -> ${link.targetPath}`).sort(),
    ).toEqual([
      "backend/tests/test_routes.py -> backend/app/api/routes.py",
      "frontend/tests/format.test.ts -> frontend/lib/format.ts",
    ]);
    expect(coverage.every((link) => link.tier === "reference")).toBe(true);
    // A test importing another test is not coverage.
    expect(coverage.some((link) => link.targetPath.includes("/tests/"))).toBe(
      false,
    );
  });

  it("attributes an import the same way whether or not the barrel was rescanned", async () => {
    // The hazard the barrel read-back pass exists for: an incremental scan
    // parses only changed files, so without it `page.ts` would point at the
    // package index on one scan and at `greet.ts` on the next, for the same
    // commit. The edge a file gets must not depend on what else was rescanned.
    const { commitSha, source } =
      await createLocalRepositorySource(MONOREPO_ALIASES);
    const full = await scanRepository({ commitSha, source });

    const unchangedExceptImporter = full.artifacts
      .filter(({ path }) => path !== "apps/web/src/page.ts")
      .map((artifact): PreviousScannedArtifact => ({
        classification: artifact.classification,
        digest: artifact.digest,
        exportedSymbols: artifact.exportedSymbols,
        kind: artifact.kind,
        path: artifact.path,
        sizeBytes: artifact.sizeBytes,
        sourceBlobSha: artifact.sourceBlobSha,
        sourceCommitSha: artifact.sourceCommitSha,
      }));
    const incremental = await scanRepository({
      commitSha,
      previousArtifacts: unchangedExceptImporter,
      previousCommitSha: "9".repeat(40),
      source,
    });

    // Only the importer was rescanned…
    expect(incremental.artifacts.map(({ path }) => path)).toEqual([
      "apps/web/src/page.ts",
    ]);
    // …and its links are byte-identical to the ones a full scan derived.
    const linksOfImporter = (plan: { codeLinks: readonly CodeLink[] }) =>
      plan.codeLinks
        .filter((link) => link.sourcePath === "apps/web/src/page.ts")
        .map(({ kind, method, targetPath, tier }) => ({
          kind,
          method,
          targetPath,
          tier,
        }));
    expect(linksOfImporter(incremental)).toEqual(linksOfImporter(full));
    expect(linksOfImporter(incremental).length).toBeGreaterThan(0);
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
         where e.relation in ('imports', 'calls', 'tests')
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
        // A derived coverage edge must obey the same replace-on-rescan rule:
        // if it were outside the delete set it would outlive the import that
        // produced it, and the map would show a test covering a file it no
        // longer touches.
        planLink("src/a.ts", "src/b.ts", "tests"),
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
        relation: "tests",
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

  it("a full relink replaces every file's edges and stamps the resolver generation", async () => {
    await apply({
      artifacts: [
        planArtifact("src/a.ts", SHA_A),
        planArtifact("src/b.ts", SHA_A),
        planArtifact("src/c.ts", SHA_A),
      ],
      codeLinks: [
        planLink("src/a.ts", "src/b.ts", "imports"),
        planLink("src/c.ts", "src/b.ts", "imports"),
      ],
      commitSha: SHA_A,
      linkSchemaVersion: 1,
      linkScope: "incremental",
      removedPaths: [],
      skipped: [],
      touchedRows: 3,
      treeSha: SHA_B,
      unchangedPaths: [],
    });
    expect((await edgeRows()).length).toBe(2);

    // A relink re-parses unchanged files, so it emits links without emitting
    // artifact rows. The path-scoped delete could not express that: it would
    // have left src/c.ts's stale edge behind forever.
    await apply({
      artifacts: [],
      codeLinks: [planLink("src/a.ts", "src/c.ts", "imports")],
      commitSha: SHA_A,
      linkSchemaVersion: 2,
      linkScope: "full",
      removedPaths: [],
      skipped: [],
      touchedRows: 0,
      treeSha: SHA_B,
      unchangedPaths: ["src/a.ts", "src/b.ts", "src/c.ts"],
    });

    expect(await edgeRows()).toEqual([
      {
        relation: "imports",
        source: "src/a.ts",
        target: "src/c.ts",
        tier: "resolved",
      },
    ]);

    const stamped = await asServiceRole(database, (tx) =>
      tx.query<{ link_schema_version: number }>(
        "select link_schema_version from public.repositories where id = $1",
        [repositoryId],
      ),
    );
    expect(stamped.rows[0]?.link_schema_version).toBe(2);
  });

  it("an incremental plan leaves the stored resolver generation alone", async () => {
    await apply({
      artifacts: [planArtifact("src/a.ts", SHA_A)],
      codeLinks: [],
      commitSha: SHA_A,
      linkSchemaVersion: 2,
      linkScope: "incremental",
      removedPaths: [],
      skipped: [],
      touchedRows: 1,
      treeSha: SHA_B,
      unchangedPaths: [],
    });
    const stamped = await asServiceRole(database, (tx) =>
      tx.query<{ link_schema_version: number }>(
        "select link_schema_version from public.repositories where id = $1",
        [repositoryId],
      ),
    );
    // Only a full relink can claim the repository's edges are up to date.
    expect(stamped.rows[0]?.link_schema_version).toBe(1);
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
