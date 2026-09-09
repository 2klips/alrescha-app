import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ALL_MIGRATIONS, createTestDatabase } from "./helpers/database";

/**
 * Directory nodes and containment (Phase 4 Wave A todo 3, R5 §2.2 D4).
 *
 * The hierarchy is derived in SQL from the artifact paths the scan stored, so
 * the plan never mentions a folder and the two ingest paths cannot disagree
 * about one (ADR-013). These cases state the tree a path set produces, what
 * happens to a folder that empties, and which folders count as packages.
 */

const USER = "7e000000-0000-4000-8000-00000000000e";
const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);

function planArtifact(path: string) {
  return {
    classification: path.endsWith(".json") ? "config" : "code_metadata",
    digest: path.length.toString(16).padStart(2, "0").repeat(32),
    exportedSymbols: [],
    kind: path.endsWith(".json") ? "config" : "code_metadata",
    path,
    rationales: [],
    sizeBytes: 64,
    sourceBlobSha: SHA_A,
    sourceCommitSha: SHA_A,
    symbolEngine: null,
    todoItems: [],
  };
}

describe("directory nodes", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let workspaceId: string;
  let repositoryId: string;

  beforeEach(async () => {
    database = await createTestDatabase([...ALL_MIGRATIONS]);
    await database.query(
      "insert into auth.users (id, email) values ($1, 'dirs@example.test')",
      [USER],
    );
    const workspaces = await database.query<{ id: string }>(
      "select id from public.workspaces",
    );
    workspaceId = workspaces.rows[0]?.id ?? "";
    const repository = await database.query<{ id: string }>(
      "select public.ensure_local_repository($1, 'local/dirs') as id",
      [workspaceId],
    );
    repositoryId = repository.rows[0]?.id ?? "";
  });

  afterEach(async () => {
    await database.close();
  });

  async function apply(plan: Record<string, unknown>): Promise<void> {
    await database.query(
      "select public.apply_repository_scan($1, $2, $3::jsonb)",
      [
        workspaceId,
        repositoryId,
        JSON.stringify({
          artifacts: [],
          codeLinks: [],
          commitSha: SHA_A,
          docLinks: [],
          removedPaths: [],
          skipped: [],
          touchedRows: 1,
          treeSha: SHA_B,
          unchangedPaths: [],
          ...plan,
        }),
      ],
    );
  }

  async function directories(): Promise<
    { path: string; role: string | null }[]
  > {
    const rows = await database.query<{ path: string; role: string | null }>(
      `select path, role from public.directories
       where workspace_id = $1 order by path`,
      [workspaceId],
    );
    return rows.rows;
  }

  async function containment(): Promise<string[]> {
    const rows = await database.query<{ child: string; parent: string }>(
      `select
         parent_directory.path as parent,
         coalesce(child_directory.path, child_artifact.path) as child
       from public.edges e
       join public.directories parent_directory
         on parent_directory.id = e.source_node_id
       left join public.directories child_directory
         on child_directory.id = e.target_node_id
       left join public.artifacts child_artifact
         on child_artifact.id = e.target_node_id
       where e.workspace_id = $1 and e.relation = 'contains'
       order by parent, child`,
      [workspaceId],
    );
    return rows.rows.map(({ child, parent }) => `${parent} -> ${child}`);
  }

  const TREE = [
    "README.md",
    "apps/web/package.json",
    "apps/web/src/page.tsx",
    "packages/core/src/index.ts",
  ];

  it("derives one node per ancestor directory, and none for a root file", async () => {
    await apply({ artifacts: TREE.map(planArtifact) });

    expect(await directories()).toEqual([
      { path: "apps", role: null },
      // A directory holding a manifest is a package: the six of them are the
      // cores this repository's galaxy is supposed to have (R5 §2.6).
      { path: "apps/web", role: "package" },
      { path: "apps/web/src", role: null },
      { path: "packages", role: null },
      { path: "packages/core", role: null },
      { path: "packages/core/src", role: null },
    ]);
    expect(await containment()).toEqual([
      "apps -> apps/web",
      "apps/web -> apps/web/package.json",
      "apps/web -> apps/web/src",
      "apps/web/src -> apps/web/src/page.tsx",
      "packages -> packages/core",
      "packages/core -> packages/core/src",
      "packages/core/src -> packages/core/src/index.ts",
    ]);
    // `README.md` sits at the root, which is not a node: a folder that holds
    // the entire repository says nothing about anything.
    expect((await containment()).join("\n")).not.toContain("README.md");
  });

  it("converges: the same tree applied twice is the same hierarchy", async () => {
    await apply({ artifacts: TREE.map(planArtifact) });
    const first = await containment();
    await apply({
      artifacts: TREE.map(planArtifact),
      commitSha: SHA_B,
      unchangedPaths: [],
    });

    expect(await containment()).toEqual(first);
    expect((await directories()).length).toBe(6);
  });

  it("sweeps a folder that no longer holds anything", async () => {
    await apply({ artifacts: TREE.map(planArtifact) });

    // The scan that removes the only file under `packages/core/src`.
    await apply({
      artifacts: [],
      commitSha: SHA_B,
      removedPaths: ["packages/core/src/index.ts"],
      unchangedPaths: TREE.filter(
        (path) => path !== "packages/core/src/index.ts",
      ),
    });

    // The whole empty chain goes, not only its leaf.
    expect((await directories()).map(({ path }) => path)).toEqual([
      "apps",
      "apps/web",
      "apps/web/src",
    ]);
    expect(await containment()).toEqual([
      "apps -> apps/web",
      "apps/web -> apps/web/package.json",
      "apps/web -> apps/web/src",
      "apps/web/src -> apps/web/src/page.tsx",
    ]);
    // Nothing is left pointing at a node that is gone.
    const orphans = await database.query<{ count: string }>(
      `select count(*) as count from public.edges e
       where e.relation = 'contains'
         and not exists (
           select 1 from public.graph_nodes n where n.id = e.source_node_id
         )`,
    );
    expect(Number(orphans.rows[0]?.count)).toBe(0);
  });

  it("changes a directory's role when its manifest arrives or leaves", async () => {
    await apply({ artifacts: [planArtifact("apps/web/src/page.tsx")] });
    expect(await directories()).toEqual([
      { path: "apps", role: null },
      { path: "apps/web", role: null },
      { path: "apps/web/src", role: null },
    ]);

    await apply({
      artifacts: [planArtifact("apps/web/package.json")],
      commitSha: SHA_B,
      unchangedPaths: ["apps/web/src/page.tsx"],
    });
    expect(
      (await directories()).find(({ path }) => path === "apps/web")?.role,
    ).toBe("package");

    await apply({
      artifacts: [],
      commitSha: SHA_A,
      removedPaths: ["apps/web/package.json"],
      unchangedPaths: ["apps/web/src/page.tsx"],
    });
    expect(
      (await directories()).find(({ path }) => path === "apps/web")?.role,
    ).toBeNull();
  });

  it("files containment under hierarchy, resolved, and layout-only", async () => {
    await apply({ artifacts: TREE.map(planArtifact) });

    const rows = await database.query<{
      confidence: string;
      family: string;
      provenance: Record<string, unknown>;
    }>(
      `select family, confidence, provenance from public.edges
       where workspace_id = $1 and relation = 'contains' limit 1`,
      [workspaceId],
    );
    const [edge] = rows.rows;

    expect(edge?.family).toBe("hierarchy");
    expect(Number(edge?.confidence)).toBe(1);
    // Provenance is required on every edge (WORK_SPEC §3-2); containment has
    // no span, so it carries the reason it exists.
    expect(edge?.provenance).toEqual({
      layoutOnly: true,
      reason: "path containment",
      tier: "resolved",
    });
  });

  it("keeps the hierarchy out of the plan entirely", async () => {
    // ADR-013 by construction: if the plan cannot express a directory, the
    // GitHub path and the CLI cannot disagree about one.
    const plan = {
      artifacts: TREE.map(planArtifact),
      codeLinks: [],
      commitSha: SHA_A,
      docLinks: [],
      removedPaths: [],
      skipped: [],
      touchedRows: 4,
      treeSha: SHA_B,
      unchangedPaths: [],
    };
    await apply(plan);

    const serialized = JSON.stringify(plan);
    expect(serialized).not.toContain("directories");
    expect(serialized).not.toContain("contains");
    expect((await directories()).length).toBe(6);
  });

  describe("layout config", () => {
    async function repositoryRow(): Promise<{
      layout_config: Record<string, unknown>;
      layout_config_commit_sha: string | null;
    }> {
      const rows = await database.query<{
        layout_config: Record<string, unknown>;
        layout_config_commit_sha: string | null;
      }>(
        `select layout_config, layout_config_commit_sha
         from public.repositories where id = $1`,
        [repositoryId],
      );
      return (
        rows.rows[0] ?? { layout_config: {}, layout_config_commit_sha: null }
      );
    }

    const CONFIG = {
      ignore: ["notes/**"],
      layersHidden: ["statistical"],
      layout: { backend: ["svc/"], database: ["store/"] },
      progressDocs: [],
      todoFiles: ["BACKLOG.md"],
    };

    it("stores the conventions with the commit that stated them", async () => {
      await apply({
        artifacts: [planArtifact("svc/orders.ts")],
        commitSha: SHA_A,
        layoutConfig: CONFIG,
      });

      const row = await repositoryRow();
      expect(row.layout_config).toEqual(CONFIG);
      // Which commit's `.alrescha.json` produced this picture is part of the
      // picture (Phase 4 Wave A todo 4).
      expect(row.layout_config_commit_sha).toBe(SHA_A);
    });

    it("clears the conventions when the repository stops stating them", async () => {
      await apply({
        artifacts: [planArtifact("svc/orders.ts")],
        commitSha: SHA_A,
        layoutConfig: CONFIG,
      });
      await apply({
        artifacts: [],
        commitSha: SHA_B,
        layoutConfig: {
          ignore: [],
          layersHidden: [],
          layout: {},
          progressDocs: [],
          todoFiles: [],
        },
        unchangedPaths: ["svc/orders.ts"],
      });

      // A deleted settings file must not leave a repository governed by it.
      expect((await repositoryRow()).layout_config).toEqual({
        ignore: [],
        layersHidden: [],
        layout: {},
        progressDocs: [],
        todoFiles: [],
      });
    });

    it("leaves an older plan's repository ungoverned rather than guessing", async () => {
      // A CLI built before this wave uploads a plan with no `layoutConfig`.
      await apply({
        artifacts: [planArtifact("svc/orders.ts")],
        commitSha: SHA_A,
      });

      const row = await repositoryRow();
      expect(row.layout_config).toEqual({});
      expect(row.layout_config_commit_sha).toBeNull();
    });
  });
});
