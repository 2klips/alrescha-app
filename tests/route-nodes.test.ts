import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  nextRouteFile,
  parsePythonRoutes,
  scanRepository,
} from "../packages/core/src/index";
import { createLocalRepositorySource } from "../packages/cli/src/local-source";
import { ALL_MIGRATIONS, createTestDatabase } from "./helpers/database";

/**
 * Routes (Phase 4 Wave A′ todo 6).
 *
 * A user thinks in screens and endpoints; the graph had neither. Next.js
 * states the URL in the path, so the scan SQL derives it from the stored
 * artifacts and the plan stays free of routes (ADR-013). FastAPI and Flask
 * state it in a decorator, so the scan reads method, path and line — and the
 * edge says `reference`, because a router mounted under a prefix has a URL
 * this cannot see.
 */

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const NEXT_FASTAPI = resolve(repoRoot, "fixtures/layout-variants/next-fastapi");
const USER = "70000000-0000-4000-8000-000000000001";
const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);

describe("Next.js route derivation", () => {
  it("reads the URL out of the path", () => {
    expect(nextRouteFile("apps/web/app/(shell)/commits/page.tsx")).toEqual({
      entry: "page",
      url: "/commits",
    });
    // The live app sits under its own `app` segment: the *first* `app/` is
    // the Next root, so the second one is a URL segment.
    expect(nextRouteFile("apps/web/app/app/(shell)/map/page.tsx")).toEqual({
      entry: "page",
      url: "/app/map",
    });
    expect(nextRouteFile("apps/web/app/layout.tsx")).toEqual({
      entry: "layout",
      url: "/",
    });
    expect(nextRouteFile("apps/web/app/api/github/webhooks/route.ts")).toEqual({
      entry: "route",
      url: "/api/github/webhooks",
    });
    expect(nextRouteFile("frontend/pages/about/index.tsx")).toEqual({
      entry: "page",
      url: "/about",
    });
    expect(nextRouteFile("frontend/pages/_app.tsx")).toBeNull();
    expect(nextRouteFile("apps/web/lib/map/workspace-map.ts")).toBeNull();
  });
});

describe("decorator route declarations", () => {
  it("reads method, path and line, and nothing else", () => {
    const routes = parsePythonRoutes(
      [
        "from fastapi import APIRouter",
        "",
        "router = APIRouter()",
        "",
        '@router.get("/health")',
        "def health(secret_token: str):",
        '    return {"token": secret_token}',
        "",
        "@router.post('/items/{item_id}')",
        "def create(item_id: str):",
        "    return item_id",
        "",
      ].join("\n"),
    );

    expect(routes).toEqual([
      { line: 5, method: "GET", path: "/health" },
      { line: 9, method: "POST", path: "/items/{item_id}" },
    ]);
    // The handler's body — and its parameter names — stay in the file.
    expect(JSON.stringify(routes)).not.toContain("secret_token");
  });

  it("reads Flask's verbs out of the argument that states them", () => {
    expect(
      parsePythonRoutes(
        [
          '@app.route("/login", methods=["GET", "POST"])',
          "def login():",
          "    pass",
          '@bp.route("/health")',
          "def health():",
          "    pass",
        ].join("\n"),
      ),
    ).toEqual([
      { line: 1, method: "GET", path: "/login" },
      { line: 1, method: "POST", path: "/login" },
      // A `route` with no verbs answers to all of them, and says so.
      { line: 4, method: "ANY", path: "/health" },
    ]);
  });

  it("ignores a decorator that names no path this scan can use", () => {
    expect(
      parsePythonRoutes(
        [
          "@app.get(build_path())",
          "@app.middleware('http')",
          '@router.get("relative/path")',
          "@dataclass",
        ].join("\n"),
      ),
    ).toEqual([]);
  });
});

describe("routes over the three-tier fixture", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let workspaceId: string;
  let repositoryId: string;

  beforeEach(async () => {
    database = await createTestDatabase([...ALL_MIGRATIONS]);
    await database.query(
      "insert into auth.users (id, email) values ($1, 'routes@example.test')",
      [USER],
    );
    const workspaces = await database.query<{ id: string }>(
      "select id from public.workspaces",
    );
    workspaceId = workspaces.rows[0]?.id ?? "";
    const repository = await database.query<{ id: string }>(
      "select public.ensure_local_repository($1, 'local/routes') as id",
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

  async function routes(): Promise<
    { methods: string[]; tier: string; url: string }[]
  > {
    const rows = await database.query<{
      methods: string[];
      tier: string;
      url: string;
    }>(
      `select url, tier, methods from public.routes
       where workspace_id = $1 order by url`,
      [workspaceId],
    );
    return rows.rows;
  }

  async function handles(): Promise<string[]> {
    const rows = await database.query<{ path: string; url: string }>(
      `select r.url, a.path
       from public.edges e
       join public.routes r on r.id = e.source_node_id
       join public.artifacts a on a.id = e.target_node_id
       where e.workspace_id = $1 and e.relation = 'handles'
       order by r.url, a.path`,
      [workspaceId],
    );
    return rows.rows.map(({ path, url }) => `${url} -> ${path}`);
  }

  it("derives Next routes from paths and decorator routes from the plan", async () => {
    const { commitSha, source } =
      await createLocalRepositorySource(NEXT_FASTAPI);
    const plan = await scanRepository({ commitSha, source });

    // The fixture's FastAPI module declares no decorator today, so this is
    // the Next half; the decorator half is exercised below on a plan that
    // states one.
    expect(plan.routes).toEqual([]);
    await apply(plan);

    expect(await routes()).toEqual([
      { methods: [], tier: "resolved", url: "/" },
    ]);
    expect(await handles()).toEqual(["/ -> frontend/app/page.tsx"]);
  });

  it("gives a layout a handle on every URL beneath it", async () => {
    await apply({
      artifacts: [
        "apps/web/app/layout.tsx",
        "apps/web/app/(shell)/layout.tsx",
        "apps/web/app/(shell)/commits/page.tsx",
        "apps/web/app/api/health/route.ts",
      ].map((path) => ({
        classification: "code_metadata",
        digest: path.length.toString(16).padStart(2, "0").repeat(32),
        exportedSymbols: [],
        kind: "code_metadata",
        path,
        rationales: [],
        sizeBytes: 64,
        sourceBlobSha: SHA_A,
        sourceCommitSha: SHA_A,
        symbolEngine: null,
        todoItems: [],
      })),
      codeLinks: [],
      commitSha: SHA_A,
      docLinks: [],
      removedPaths: [],
      routes: [],
      skipped: [],
      touchedRows: 4,
      treeSha: SHA_B,
      unchangedPaths: [],
    });

    // Two URLs — a layout is not one — and each is handled by its own file
    // plus every layout above it. Opening `/commits` and seeing the three
    // files that render it is the point of the family.
    expect((await routes()).map(({ url }) => url)).toEqual([
      "/api/health",
      "/commits",
    ]);
    // The `(shell)` layout has the same URL as the root layout — the route
    // group is stripped — so only the directory says `/api/health` is
    // outside it.
    expect(await handles()).toEqual([
      "/api/health -> apps/web/app/api/health/route.ts",
      "/api/health -> apps/web/app/layout.tsx",
      "/commits -> apps/web/app/(shell)/commits/page.tsx",
      "/commits -> apps/web/app/(shell)/layout.tsx",
      "/commits -> apps/web/app/layout.tsx",
    ]);
  });

  it("stores a decorator route at the reference tier with its verbs", async () => {
    await apply({
      artifacts: [
        {
          classification: "code_metadata",
          digest: "c".repeat(64),
          exportedSymbols: [],
          kind: "code_metadata",
          path: "backend/app/api/routes.py",
          rationales: [],
          sizeBytes: 64,
          sourceBlobSha: SHA_A,
          sourceCommitSha: SHA_A,
          symbolEngine: "python-structural",
          todoItems: [],
        },
      ],
      codeLinks: [],
      commitSha: SHA_A,
      docLinks: [],
      removedPaths: [],
      routes: [
        {
          line: 12,
          method: "GET",
          path: "/health",
          sourcePath: "backend/app/api/routes.py",
        },
        {
          line: 18,
          method: "POST",
          path: "/health",
          sourcePath: "backend/app/api/routes.py",
        },
      ],
      skipped: [],
      touchedRows: 1,
      treeSha: SHA_B,
      unchangedPaths: [],
    });

    expect(await routes()).toEqual([
      { methods: ["GET", "POST"], tier: "reference", url: "/health" },
    ]);
    expect(await handles()).toEqual(["/health -> backend/app/api/routes.py"]);
    const edge = await database.query<{
      confidence: string;
      family: string;
      provenance: Record<string, unknown>;
    }>(
      `select family, confidence, provenance from public.edges
       where workspace_id = $1 and relation = 'handles' limit 1`,
      [workspaceId],
    );
    expect(edge.rows[0]?.family).toBe("route");
    // A decorator is evidence of intent, not of a mounted URL (ADR-014).
    expect(Number(edge.rows[0]?.confidence)).toBe(0.6);
    expect(edge.rows[0]?.provenance).toMatchObject({
      reason: "route decorator",
      span: { path: "backend/app/api/routes.py", startLine: 12 },
      tier: "reference",
    });
  });

  it("sweeps a URL no file serves any more", async () => {
    const artifact = (path: string) => ({
      classification: "code_metadata",
      digest: path.length.toString(16).padStart(2, "0").repeat(32),
      exportedSymbols: [],
      kind: "code_metadata",
      path,
      rationales: [],
      sizeBytes: 64,
      sourceBlobSha: SHA_A,
      sourceCommitSha: SHA_A,
      symbolEngine: null,
      todoItems: [],
    });
    const base = {
      codeLinks: [],
      docLinks: [],
      removedPaths: [],
      routes: [],
      skipped: [],
      touchedRows: 2,
      treeSha: SHA_B,
      unchangedPaths: [],
    };
    await apply({
      ...base,
      artifacts: [
        artifact("apps/web/app/(shell)/commits/page.tsx"),
        artifact("apps/web/app/(shell)/old/page.tsx"),
      ],
      commitSha: SHA_A,
    });
    expect((await routes()).map(({ url }) => url)).toEqual([
      "/commits",
      "/old",
    ]);

    await apply({
      ...base,
      artifacts: [],
      commitSha: SHA_B,
      removedPaths: ["apps/web/app/(shell)/old/page.tsx"],
      unchangedPaths: ["apps/web/app/(shell)/commits/page.tsx"],
    });

    expect((await routes()).map(({ url }) => url)).toEqual(["/commits"]);
    const orphans = await database.query<{ count: string }>(
      `select count(*) as count from public.edges e
       where e.relation = 'handles'
         and not exists (
           select 1 from public.graph_nodes n where n.id = e.source_node_id
         )`,
    );
    expect(Number(orphans.rows[0]?.count)).toBe(0);
  });

  it("derives the same URL in SQL as the resolver does in TypeScript", async () => {
    // One rule, two implementations — the plan cannot carry routes without
    // giving the two ingest paths something to disagree about, so the SQL
    // has to state the rule too. This is what keeps them one rule.
    const paths = [
      "apps/web/app/(shell)/commits/page.tsx",
      "apps/web/app/app/(shell)/settings/mcp/page.tsx",
      "apps/web/app/api/github/webhooks/route.ts",
      "apps/web/app/layout.tsx",
      "frontend/app/page.tsx",
      "frontend/pages/about/index.tsx",
      "frontend/pages/_app.tsx",
      "apps/web/lib/map/workspace-map.ts",
      "packages/core/src/index.ts",
    ];
    const derived = await database.query<{
      path: string;
      url: string | null;
    }>(
      `select path, public.next_route_url(path) as url
       from unnest($1::text[]) as path`,
      [paths],
    );

    expect(derived.rows.map(({ path, url }) => [path, url])).toEqual(
      paths.map((path) => [path, nextRouteFile(path)?.url ?? null]),
    );
  });

  it("keeps routes out of the plan for Next, and in it for decorators", async () => {
    const source = await readFile(
      resolve(NEXT_FASTAPI, "frontend/app/page.tsx"),
      "utf8",
    );
    expect(source.length).toBeGreaterThan(0);

    const { commitSha, source: repository } =
      await createLocalRepositorySource(NEXT_FASTAPI);
    const plan = await scanRepository({ commitSha, source: repository });

    // ADR-013 by construction: a Next route cannot be in the plan, so the
    // two ingest paths cannot carry different ones.
    expect(JSON.stringify(plan.routes)).not.toContain("/");
    expect(Object.keys(plan)).toContain("routes");
  });
});
