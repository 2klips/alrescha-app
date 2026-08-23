import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { normalizeGitHubWebhook } from "../packages/core/src/index";
import {
  buildWorkspaceMapModel,
  CO_CHANGE_MIN_COUNT,
  type WorkspaceMapRows,
} from "../apps/web/lib/map/workspace-map";
import {
  ALL_MIGRATIONS,
  asServiceRole,
  createTestDatabase,
} from "./helpers/database";

/**
 * Phase 3 Wave B todo 4 — co-change coupling from push webhooks.
 *
 * Only paths and counts travel; replay safety lives in the caller (counts are
 * recorded for inserted deliveries only) and pair guards live in both the
 * normalizer and the SQL function.
 */

const SHA = "c".repeat(40);

function pushBody(commits: unknown[]): string {
  return JSON.stringify({
    after: SHA,
    commits,
    installation: { id: 77 },
    repository: { full_name: "2klips/arr-app", id: 1234 },
  });
}

describe("push webhook co-change normalization (Wave B todo 4)", () => {
  it("extracts per-commit touched paths, dropping pairless and bulk commits", () => {
    const event = normalizeGitHubWebhook(
      "push",
      "delivery-1",
      pushBody([
        {
          added: ["src/a.ts"],
          id: "1".repeat(40),
          modified: ["src/b.ts", "src/a.ts"],
          removed: ["docs/old.md"],
        },
        // Single file — no pair, dropped.
        {
          added: [],
          id: "2".repeat(40),
          modified: ["src/only.ts"],
          removed: [],
        },
        // Bulk churn — dropped.
        {
          added: Array.from({ length: 60 }, (_, index) => `bulk/${index}.ts`),
          id: "3".repeat(40),
          modified: [],
          removed: [],
        },
        // Malformed sha — dropped.
        { added: ["x.ts", "y.ts"], id: "nope", modified: [], removed: [] },
      ]),
    );

    expect(event?.commitFiles).toEqual([
      {
        paths: ["docs/old.md", "src/a.ts", "src/b.ts"],
        sha: "1".repeat(40),
      },
    ]);
  });

  it("non-push events carry no commit files", () => {
    const event = normalizeGitHubWebhook(
      "check_run",
      "delivery-2",
      JSON.stringify({
        action: "completed",
        check_run: { conclusion: "success", head_sha: SHA },
        installation: { id: 77 },
        repository: { full_name: "2klips/arr-app", id: 1234 },
      }),
    );
    expect(event?.commitFiles).toEqual([]);
  });
});

describe("co-change display edges (Wave B todo 4)", () => {
  const baseRows: WorkspaceMapRows = {
    accessEvents: [],
    artifacts: [
      { classification: "code_metadata", id: "node-a", path: "src/a.ts" },
      { classification: "code_metadata", id: "node-b", path: "src/b.ts" },
    ],
    coChanges: [],
    edges: [],
    evidence: [],
    findings: [],
    graphNodes: [
      { id: "node-a", kind: "artifact", label: "src/a.ts" },
      { id: "node-b", kind: "artifact", label: "src/b.ts" },
    ],
    rationales: [],
    repositories: [],
    requirements: [],
    tokens: [],
  };

  it("a pair above the threshold renders as a reference-tier coupling edge", () => {
    const model = buildWorkspaceMapModel("ws", {
      ...baseRows,
      coChanges: [
        {
          change_count: CO_CHANGE_MIN_COUNT,
          path_a: "src/a.ts",
          path_b: "src/b.ts",
        },
      ],
    });
    const edge = model.graph.edges.find(
      (candidate) => candidate.provenance.relation === "co_changed",
    );
    expect(edge).toMatchObject({
      source: "node-a",
      target: "node-b",
      tier: "reference",
    });
  });

  it("below the threshold no coupling edge is invented", () => {
    const model = buildWorkspaceMapModel("ws", {
      ...baseRows,
      coChanges: [
        {
          change_count: CO_CHANGE_MIN_COUNT - 1,
          path_a: "src/a.ts",
          path_b: "src/b.ts",
        },
      ],
    });
    expect(
      model.graph.edges.some(
        (candidate) => candidate.provenance.relation === "co_changed",
      ),
    ).toBe(false);
  });
});

const USER = "91111111-1111-4111-8111-111111111111";

describe("co-change counts persist (Wave B todo 4)", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let workspaceId: string;
  let repositoryId: string;

  beforeEach(async () => {
    database = await createTestDatabase([...ALL_MIGRATIONS]);
    await database.query(
      "insert into auth.users (id, email) values ($1, 'cochange@example.test')",
      [USER],
    );
    const workspaces = await database.query<{ id: string }>(
      "select id from public.workspaces",
    );
    workspaceId = workspaces.rows[0]?.id ?? "";
    const repository = await database.query<{ id: string }>(
      "select public.ensure_local_repository($1, 'local/cochange') as id",
      [workspaceId],
    );
    repositoryId = repository.rows[0]?.id ?? "";
  });

  afterEach(async () => {
    await database.close();
  });

  async function record(commits: unknown): Promise<number> {
    const result = await database.query<{ recorded: number }>(
      "select public.record_push_co_changes($1, $2, $3::jsonb) as recorded",
      [workspaceId, repositoryId, JSON.stringify(commits)],
    );
    return result.rows[0]?.recorded ?? 0;
  }

  it("accumulates pair counts across pushes and guards degenerate commits", async () => {
    expect(
      await record([
        { paths: ["src/a.ts", "src/b.ts", "src/c.ts"], sha: "1".repeat(40) },
      ]),
    ).toBe(1);
    expect(
      await record([{ paths: ["src/a.ts", "src/b.ts"], sha: "2".repeat(40) }]),
    ).toBe(1);
    // Pairless and malformed commits record nothing.
    expect(
      await record([
        { paths: ["src/solo.ts"], sha: "3".repeat(40) },
        { paths: ["x.ts", "y.ts"], sha: "bad" },
      ]),
    ).toBe(0);

    const rows = await asServiceRole(database, (tx) =>
      tx.query<{ change_count: number; path_a: string; path_b: string }>(
        `select path_a, path_b, change_count from public.file_co_changes
         order by path_a, path_b`,
      ),
    );
    expect(rows.rows).toEqual([
      { change_count: 2, path_a: "src/a.ts", path_b: "src/b.ts" },
      { change_count: 1, path_a: "src/a.ts", path_b: "src/c.ts" },
      { change_count: 1, path_a: "src/b.ts", path_b: "src/c.ts" },
    ]);
  });

  it("only workspace members can read the counts", async () => {
    await record([{ paths: ["src/a.ts", "src/b.ts"], sha: "4".repeat(40) }]);
    const outsider = await database.query<{ id: string }>(
      "insert into auth.users (id, email) values ('92222222-2222-4222-8222-222222222222', 'other@example.test') returning id",
    );
    expect(outsider.rows).toHaveLength(1);
    const { asAuthenticatedUser } = await import("./helpers/database");
    const seen = await asAuthenticatedUser(
      database,
      "92222222-2222-4222-8222-222222222222",
      (tx) => tx.query("select path_a from public.file_co_changes"),
    );
    expect(seen.rows).toEqual([]);
    const owner = await asAuthenticatedUser(database, USER, (tx) =>
      tx.query("select path_a from public.file_co_changes"),
    );
    expect(owner.rows).toHaveLength(1);
  });
});
