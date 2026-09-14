import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ingestCiTestReports } from "../packages/core/src/index";
import { ciEvidenceRecords } from "../apps/worker/src/ci-evidence";
import { PostgresAnalysisStore } from "../apps/worker/src/postgres-analysis-store";
import {
  buildWorkspaceMapModel,
  type WorkspaceMapRows,
} from "../apps/web/lib/map/workspace-map";
import { ALL_MIGRATIONS, createTestDatabase } from "./helpers/database";
import { pgliteSql } from "./helpers/pglite-sql";

/**
 * The `verified` grade, reached for the first time (Phase 4 Wave C todo 18,
 * D12).
 *
 * `workspace-map.ts` has read for it since Phase 3 — a `test`/`ci` evidence
 * row with a `supports` verdict, and the edges out of it — and nothing in
 * production ever wrote one. Every node on every live map was `inferred` or
 * `broken`, and the product's central claim had no path to being true.
 *
 * This runs the recorded GitHub Actions reports through the real parser, the
 * real store and the real migrations, then reads the map the way the loader
 * does. What it protects is the *shape* of the promotion as much as its
 * existence: without execution evidence the count stays zero, and the code
 * under a passing test is not promoted by association.
 */

const ACTIONS_ROOT = resolve(
  import.meta.dirname,
  "../fixtures/drifted-demo/recordings/github/actions",
);
const OWNER = "79000000-0000-4000-8000-000000000001";
const fixedUlid = (suffix: string) => `01J8000000000000000000000${suffix}`;

const REPOSITORY = fixedUlid("B");
const SPEC_NODE = fixedUlid("A");
const CODE_NODE = fixedUlid("C");
const TEST_NODE = fixedUlid("D");
const REQUIREMENT_NODE = `0${"R".repeat(25)}`;

interface ActionsFixture {
  readonly analyzedCommitSha: string;
  readonly checkRuns: Array<{
    conclusion: string | null;
    head_sha: string;
    name: string;
    status: string;
  }>;
  readonly reports: Array<{
    artifactId: number;
    artifactName: string;
    content: string;
    format: "junit" | "vitest-json";
    headSha: string;
  }>;
}

/** The recorded Actions run, as `GitHubCiEvidenceSource` would deliver it. */
async function actionsFixture(): Promise<ActionsFixture> {
  const read = async (name: string) =>
    readFile(resolve(ACTIONS_ROOT, name), "utf8");
  const artifacts = JSON.parse(await read("artifacts.json")) as {
    artifacts: Array<{
      id: number;
      name: string;
      workflow_run: { head_sha: string };
    }>;
  };
  const checkRuns = JSON.parse(await read("check-runs.json")) as {
    check_runs: ActionsFixture["checkRuns"];
  };
  const headSha = artifacts.artifacts[0]!.workflow_run.head_sha;
  return {
    analyzedCommitSha: headSha,
    checkRuns: checkRuns.check_runs,
    reports: [
      {
        artifactId: artifacts.artifacts[0]!.id,
        artifactName: artifacts.artifacts[0]!.name,
        content: await read("junit.xml"),
        format: "junit",
        headSha,
      },
      {
        artifactId: artifacts.artifacts[1]!.id,
        artifactName: artifacts.artifacts[1]!.name,
        content: await read("vitest.json"),
        format: "vitest-json",
        headSha,
      },
    ],
  };
}

describe("CI evidence reaches the map", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let store: PostgresAnalysisStore;
  let workspace: string;
  let fixture: ActionsFixture;

  /** Every table the map loader reads, straight from the database. */
  async function readRows(): Promise<WorkspaceMapRows> {
    const query = async <T>(sql: string): Promise<T[]> =>
      (await database.query<T>(sql, [workspace])).rows;
    return {
      accessEvents: [],
      artifacts: await query(
        "select id, classification, path, exported_symbols from public.artifacts where workspace_id = $1",
      ),
      assertions: [],
      coChanges: [],
      concepts: [],
      dbObjects: [],
      directories: [],
      edges: await query(
        `select id, source_node_id, target_node_id, relation, family, confidence, provenance
         from public.edges where workspace_id = $1`,
      ),
      evidence: await query(
        "select id, kind, verdict, source_artifact_id from public.evidence where workspace_id = $1",
      ),
      findings: [],
      graphNodes: await query(
        "select id, kind, label from public.graph_nodes where workspace_id = $1",
      ),
      rationales: [],
      repositories: await query(
        "select id, full_name, last_scanned_commit_sha, layout_config from public.repositories where workspace_id = $1",
      ),
      requirements: await query(
        "select id, statement, source_artifact_id, source_span from public.requirements where workspace_id = $1",
      ),
      routes: [],
      sections: [],
      tokens: [],
    };
  }

  /**
   * The map's grade per node id. Keyed by id rather than by label because a
   * label is display text — an artifact's is its basename and a
   * requirement's is its statement — and this is about which node the
   * evidence reached.
   */
  async function gradeById(): Promise<Map<string, string>> {
    const model = buildWorkspaceMapModel(workspace, await readRows());
    return new Map(model.graph.nodes.map((node) => [node.id, node.grade]));
  }

  /**
   * The records one analysis of the recorded run would produce — or of the
   * same run with the requirement code stripped from every test name.
   */
  function records(options: { readonly withoutRequirementCodes?: boolean } = {}) {
    const ingestion = ingestCiTestReports({
      analyzedCommitSha: fixture.analyzedCommitSha,
      checkRuns: fixture.checkRuns,
      reports: options.withoutRequirementCodes
        ? fixture.reports.map((report) => ({
            ...report,
            content: report.content.replaceAll("REQ-AUTH-002 ", ""),
          }))
        : fixture.reports,
    });
    return ciEvidenceRecords({
      analyzedCommitSha: fixture.analyzedCommitSha,
      measured: [],
      nodeByPath: new Map([
        ["src/session.ts", CODE_NODE],
        ["spec.md", SPEC_NODE],
        ["tests/session.test.ts", TEST_NODE],
      ]),
      requirementNodesByCode: new Map([["REQ-AUTH-002", [REQUIREMENT_NODE]]]),
      scope: { repositoryId: REPOSITORY, workspaceId: workspace },
      testFiles: ingestion.testFiles,
    });
  }

  beforeEach(async () => {
    fixture = await actionsFixture();
    database = await createTestDatabase([...ALL_MIGRATIONS]);
    store = new PostgresAnalysisStore(
      pgliteSql(database) as unknown as postgres.Sql,
    );
    await database.query(
      "insert into auth.users (id, email) values ($1, 'ci-evidence@example.test')",
      [OWNER],
    );
    const workspaces = await database.query<{ id: string }>(
      "select id from public.workspaces where owner_user_id = $1",
      [OWNER],
    );
    workspace = workspaces.rows[0]?.id ?? "";
    await database.query(
      "insert into public.repositories (id, workspace_id, full_name) values ($1, $2, 'owner/ci-repo')",
      [REPOSITORY, workspace],
    );

    // The scan's artifacts, as `apply_repository_scan` would leave them.
    for (const [id, path, classification] of [
      [SPEC_NODE, "spec.md", "spec"],
      [CODE_NODE, "src/session.ts", "code_metadata"],
      [TEST_NODE, "tests/session.test.ts", "code_metadata"],
    ] as const) {
      await database.query(
        `insert into public.graph_nodes (id, workspace_id, repository_id, kind, label)
         values ($1, $2, $3, 'artifact', $4)`,
        [id, workspace, REPOSITORY, path],
      );
      await database.query(
        `insert into public.artifacts
          (id, workspace_id, repository_id, kind, classification, path, digest, source_commit_sha)
         values ($1, $2, $3, $4, $4, $5, $6, $7)`,
        [
          id,
          workspace,
          REPOSITORY,
          classification,
          path,
          "d".repeat(64),
          fixture.analyzedCommitSha,
        ],
      );
    }
    // …and the requirement the analysis extracted, which the CI evidence
    // will support.
    await database.query(
      `insert into public.graph_nodes (id, workspace_id, repository_id, kind, label)
       values ($1, $2, $3, 'requirement', 'REQ-AUTH-002')`,
      [REQUIREMENT_NODE, workspace, REPOSITORY],
    );
    await database.query(
      `insert into public.requirements
        (id, workspace_id, repository_id, source_artifact_id, statement, source_span, status)
       values ($1, $2, $3, $4, 'The app MUST rotate tokens.', $5::jsonb, 'active')`,
      [
        REQUIREMENT_NODE,
        workspace,
        REPOSITORY,
        SPEC_NODE,
        JSON.stringify({ endLine: 3, path: "spec.md", startLine: 3 }),
      ],
    );
  });

  afterEach(async () => {
    await database.close();
  });

  /**
   * The state every live workspace is in today: a scanned graph and no CI.
   * It has to keep producing no `verified` node, or the grade means nothing.
   */
  it("grades nothing verified before any evidence is written", async () => {
    const grades = await gradeById();

    expect(grades.size).toBeGreaterThan(3);
    expect([...grades.values()]).not.toContain("verified");
  });

  it("promotes the test file and the requirement the run names", async () => {
    const delta = await store.reconcileCiEvidence({
      ...records(),
      repositoryId: REPOSITORY,
      workspaceId: workspace,
    });
    expect(delta).toMatchObject({ removed: 0, supporting: 1, written: 1 });

    const grades = await gradeById();
    // The first `verified` node this product has ever produced from stored
    // rows: a test file a recorded CI run executed and passed.
    expect(grades.get(TEST_NODE)).toBe("verified");
    expect(grades.get(REQUIREMENT_NODE)).toBe("verified");
    // The code the test imports is not promoted: the scan's `tests` edge is
    // import-derived, and inference does not carry an execution grade.
    expect(grades.get(CODE_NODE)).toBe("inferred");
    expect(grades.get(SPEC_NODE)).toBe("inferred");
  });

  /**
   * The grade without a requirement code (2026-09-14). The file ran and
   * passed is the claim; the code in a test's name is what the file supports,
   * not what makes it evidence. A suite that names no requirement — this
   * repository's own, for one — still gets its test files graded.
   */
  it("promotes the test file when its names carry no requirement code, and nothing else", async () => {
    const delta = await store.reconcileCiEvidence({
      ...records({ withoutRequirementCodes: true }),
      repositoryId: REPOSITORY,
      workspaceId: workspace,
    });
    expect(delta).toMatchObject({ removed: 0, supporting: 1, written: 1 });

    const grades = await gradeById();
    expect(grades.get(TEST_NODE)).toBe("verified");
    // No name named it, so no edge reaches it.
    expect(grades.get(REQUIREMENT_NODE)).toBe("inferred");
    expect(grades.get(CODE_NODE)).toBe("inferred");
    const edges = await database.query<{ relation: string }>(
      `select e.relation from public.edges e
       join public.evidence v on v.id = e.source_node_id
       where e.workspace_id = $1`,
      [workspace],
    );
    expect(edges.rows).toEqual([{ relation: "tests" }]);
    const metadata = await database.query<{ codes: string[] }>(
      "select metadata->'requirementCodes' as codes from public.evidence where workspace_id = $1",
      [workspace],
    );
    expect(metadata.rows[0]?.codes).toEqual([]);
  });

  it("writes the row and the edges the map reads", async () => {
    await store.reconcileCiEvidence({
      ...records(),
      repositoryId: REPOSITORY,
      workspaceId: workspace,
    });

    const rows = await database.query<{
      commit_sha: string;
      kind: string;
      source_artifact_id: string;
      verdict: string;
    }>(
      `select kind, verdict, source_artifact_id, metadata->>'analyzedCommitSha' as commit_sha
       from public.evidence where workspace_id = $1`,
      [workspace],
    );
    expect(rows.rows).toEqual([
      {
        commit_sha: fixture.analyzedCommitSha,
        kind: "test",
        source_artifact_id: TEST_NODE,
        verdict: "supports",
      },
    ]);

    const edges = await database.query<{
      family: string;
      relation: string;
      target_node_id: string;
    }>(
      `select e.relation, e.family, e.target_node_id
       from public.edges e
       join public.evidence v on v.id = e.source_node_id
       where e.workspace_id = $1 order by e.relation`,
      [workspace],
    );
    expect(edges.rows).toEqual([
      {
        family: "evidence",
        relation: "supports",
        target_node_id: REQUIREMENT_NODE,
      },
      { family: "evidence", relation: "tests", target_node_id: TEST_NODE },
    ]);
  });

  it("converges on the same rows when the same commit is analysed twice", async () => {
    await store.reconcileCiEvidence({
      ...records(),
      repositoryId: REPOSITORY,
      workspaceId: workspace,
    });
    const second = await store.reconcileCiEvidence({
      ...records(),
      repositoryId: REPOSITORY,
      workspaceId: workspace,
    });

    expect(second).toMatchObject({ removed: 0, written: 1 });
    const count = await database.query<{ count: string }>(
      "select count(*)::text as count from public.evidence where workspace_id = $1",
      [workspace],
    );
    expect(count.rows[0]?.count).toBe("1");
  });

  /**
   * An evidence row is a claim about one commit. Keeping the last one would
   * leave the map showing a `verified` file whose test no longer runs — the
   * exact failure the grade exists to prevent.
   */
  it("removes the previous commit's evidence when the next analysis finds none", async () => {
    await store.reconcileCiEvidence({
      ...records(),
      repositoryId: REPOSITORY,
      workspaceId: workspace,
    });
    const delta = await store.reconcileCiEvidence({
      edges: [],
      evidence: [],
      repositoryId: REPOSITORY,
      workspaceId: workspace,
    });

    expect(delta).toMatchObject({ removed: 1, supporting: 0, written: 0 });
    expect([...(await gradeById()).values()]).not.toContain("verified");
    // The node went with the row, and the edges went with the node.
    const edges = await database.query<{ count: string }>(
      `select count(*)::text as count from public.edges
       where workspace_id = $1 and relation in ('tests', 'supports')`,
      [workspace],
    );
    expect(edges.rows[0]?.count).toBe("0");
  });
});
