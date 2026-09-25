import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { PGlite } from "@electric-sql/pglite";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readHarnessRows } from "../apps/web/lib/harness/harness-rows";
import { loadWorkspaceJourney } from "../apps/web/lib/home/journey";
import { loadWorkspaceInspectionDashboard } from "../apps/web/lib/inspection/inspection-report";
import { loadWorkspaceProgressReport } from "../apps/web/lib/progress/progress-report";
import { createLocalRepositorySource } from "../packages/cli/src/local-source";
import { scanRepository } from "../packages/core/src/index";
import { ALL_MIGRATIONS, createTestDatabase } from "./helpers/database";
import {
  postgrestOverPglite,
  type PostgrestRequestRecord,
} from "./helpers/postgrest-pglite";

/**
 * RE-04 — the screens' loaders past PostgREST's row cap.
 *
 * PostgREST answers with at most `max_rows` rows and says nothing about it;
 * Supabase's default, and this repository's `supabase/config.toml`, is 1,000.
 * The map was read past it first (`workspace-map-row-cap.test.ts`). These are
 * the loaders that still asked for a whole table in one request and took
 * whatever came back as all of it:
 *
 * - `/app/progress`: requirements, `implements` edges and todos. The coverage
 *   ledger is a count, so a capped page under-reports it.
 * - `/app/inspection`: the document artifacts the freshness widget lists and
 *   the todos it counts (its risk rows are the map's, already paged).
 * - the home: every connected repository and every MCP token. Its node, edge
 *   and assertion counts are `HEAD` counts, which no cap cuts.
 * - `/app/harness`: the instruction files and the repositories they name.
 *
 * The data is the production SQL's own projection of `drifted-demo`
 * (`apply_repository_scan`), in two repositories, plus rows seeded past the
 * cap, read by the real loaders through the real client as the signed-in
 * owner, under row security. The emulated cap is 10 — no read the loaders
 * leave as one request holds more than 10 rows here — so a fixture this size
 * crosses it; the rule is the same at 1,000, and the last cases run there.
 */

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const DRIFTED_DEMO = resolve(repoRoot, "fixtures/drifted-demo");

/** The emulated `max_rows`. */
const CAP = 10;
/** Rows seeded into each table past the cap: three pages' worth. */
const SEEDED = CAP * 2 + 3;
/** `supabase/config.toml` `[api] max_rows`, and Supabase's default. */
const SERVER_CAP = 1_000;
/** Rows seeded past the real cap. */
const WIDE_ROWS = SERVER_CAP + 100;
const SEEDED_AT = "2026-09-24T12:00:00.000Z";

const OWNER = "79000000-0000-4000-8000-0000000000f1";
const WIDE = "79000000-0000-4000-8000-0000000000f2";

let database: PGlite;
const workspaces = new Map<string, string>();

function sessionFor(userId: string, maxRows?: number) {
  const emulator = postgrestOverPglite(database, {
    ...(maxRows === undefined ? {} : { maxRows }),
    role: "authenticated",
    userId,
  });
  const client = createClient(
    "https://abcdefghijklmnopqrst.supabase.co",
    "key",
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: emulator.fetch },
    },
  );
  return { client, emulator };
}

async function count(sql: string, params: unknown[]): Promise<number> {
  const result = await database.query<{ n: number }>(sql, params);
  return result.rows[0]?.n ?? 0;
}

async function workspaceFor(userId: string): Promise<string> {
  await database.query("insert into auth.users (id, email) values ($1, $2)", [
    userId,
    `${userId}@example.test`,
  ]);
  const result = await database.query<{ id: string }>(
    "select id from public.workspaces where owner_user_id = $1",
    [userId],
  );
  const workspaceId = result.rows[0]?.id ?? "";
  workspaces.set(userId, workspaceId);
  return workspaceId;
}

function workspaceOf(userId: string): string {
  const workspaceId = workspaces.get(userId);
  if (!workspaceId) throw new Error(`no workspace for ${userId}`);
  return workspaceId;
}

async function repositoryIn(workspaceId: string, name: string) {
  const result = await database.query<{ id: string }>(
    "select public.ensure_local_repository($1, $2) as id",
    [workspaceId, name],
  );
  return result.rows[0]?.id ?? "";
}

async function scanDriftedDemo(workspaceId: string, repositoryId: string) {
  const { commitSha, source } = await createLocalRepositorySource(DRIFTED_DEMO);
  const plan = await scanRepository({ commitSha, mode: "full", source });
  await database.query(
    "select public.apply_repository_scan($1, $2, $3::jsonb)",
    [workspaceId, repositoryId, JSON.stringify(plan)],
  );
}

/** New graph nodes of one kind, one per label, returning their ids in order. */
async function nodes(
  workspaceId: string,
  repositoryId: string,
  kind: string,
  labels: readonly string[],
): Promise<string[]> {
  const result = await database.query<{ id: string }>(
    `insert into public.graph_nodes (workspace_id, repository_id, kind, label)
     select $1, $2, $3, label from unnest($4::text[]) with ordinality as s(label, n)
     order by n
     returning id`,
    [workspaceId, repositoryId, kind, labels],
  );
  return result.rows.map(({ id }) => id);
}

/**
 * Artifacts for new file nodes, one per path. The scanner's own fields are
 * stood in for: a digest of the path, one commit for every file.
 */
async function artifacts(
  workspaceId: string,
  repositoryId: string,
  kind: string,
  files: readonly { classification: string; path: string }[],
): Promise<string[]> {
  const ids = await nodes(
    workspaceId,
    repositoryId,
    "artifact",
    files.map(({ path }) => path),
  );
  await database.query(
    `insert into public.artifacts
       (id, workspace_id, repository_id, kind, classification, path, digest,
        source_commit_sha, last_seen_commit_sha, source_blob_sha, size_bytes,
        metadata)
     select id, $1, $2, $3, classification, path,
            encode(sha256(convert_to(path, 'UTF8')), 'hex'),
            repeat('a', 40), repeat('a', 40), repeat('b', 40), 100 + n::int,
            jsonb_build_object(
              'summary', 'Seeded ' || path, 'summaryBlobSha', repeat('b', 40))
     from unnest($4::text[], $5::text[], $6::text[])
            with ordinality as s(id, classification, path, n)`,
    [
      workspaceId,
      repositoryId,
      kind,
      ids,
      files.map(({ classification }) => classification),
      files.map(({ path }) => path),
    ],
  );
  return ids;
}

/**
 * Instruction files whose order is the database's to give: a leading dot,
 * mixed case and one path in two places, so a collation that ignores
 * punctuation or case would sort them differently from a byte-wise one.
 */
function instructionFiles(count: number, tag: string) {
  const shapes = [
    (n: string) => ({
      classification: "skill",
      path: `.claude/skills/${tag}-${n}/SKILL.md`,
    }),
    (n: string) => ({
      classification: "agents",
      path: `Docs/${tag}-${n}/AGENTS.md`,
    }),
    (n: string) => ({
      classification: "claude",
      path: `docs/${tag}-${n}/CLAUDE.md`,
    }),
    (n: string) => ({
      classification: "cursor_rule",
      path: `.cursor/rules/${tag}-${n}.mdc`,
    }),
  ];
  return Array.from({ length: count }, (_, index) => {
    const shape = shapes[index % shapes.length];
    if (!shape) throw new Error("no instruction shape");
    return shape(String(index + 1).padStart(4, "0"));
  });
}

/**
 * Requirements (every fifth withdrawn), `implements` edges for two in three
 * of them and a second edge for every fourth, and document todos in every
 * status, spread over the days before `SEEDED_AT`.
 */
async function seedLedger(
  workspaceId: string,
  repositoryId: string,
  anchor: { id: string; path: string },
  rows: number,
) {
  const requirements = await nodes(
    workspaceId,
    repositoryId,
    "requirement",
    Array.from({ length: rows }, (_, index) => `REQ seeded ${index + 1}`),
  );
  await database.query(
    `insert into public.requirements
       (id, workspace_id, repository_id, source_artifact_id, statement,
        source_span, status)
     select id, $1, $2, $3, 'The seeded system MUST keep row ' || n,
            jsonb_build_object('path', $4::text, 'startLine', n, 'endLine', n),
            case when n % 5 = 0 then 'withdrawn' else 'active' end
     from unnest($5::text[]) with ordinality as s(id, n)`,
    [workspaceId, repositoryId, anchor.id, anchor.path, requirements],
  );
  const [second] = await artifacts(workspaceId, repositoryId, "spec", [
    { classification: "spec", path: `docs/ledger-${repositoryId}.md` },
  ]);
  await database.query(
    `insert into public.edges
       (workspace_id, repository_id, source_node_id, target_node_id, relation,
        provenance, confidence)
     select $1, $2, id, target, 'implements',
            '{"reason":"seeded implements edge"}'::jsonb, 0.6
     from unnest($5::text[]) with ordinality as s(id, n)
     cross join lateral (
       select $3::text as target where n % 3 <> 0
       union all
       select $4::text where n % 4 = 0
     ) targets`,
    [workspaceId, repositoryId, anchor.id, second, requirements],
  );
  await database.query(
    `insert into public.todos
       (workspace_id, repository_id, title, status, source_kind, source_key,
        source_artifact_id, source_path, source_span, updated_at)
     select $1, $2, 'Seeded todo ' || n,
            (array['open', 'in-progress', 'done', 'blocked'])[1 + n % 4],
            'document', 'seed:todo:' || n, $3, $4,
            jsonb_build_object('path', $4::text, 'startLine', n, 'endLine', n),
            $5::timestamptz - make_interval(days => n)
     from generate_series(1, $6::int) as n`,
    [workspaceId, repositoryId, anchor.id, anchor.path, SEEDED_AT, rows],
  );
}

/** MCP tokens, every other one revoked. */
async function seedTokens(workspaceId: string, userId: string, rows: number) {
  await database.query(
    `insert into public.mcp_tokens
       (workspace_id, token_hash, token_prefix, name, created_by, scopes,
        revoked_at)
     select $1, 'seed-hash-' || $1 || '-' || n, 'seedtk' || lpad(n::text, 4, '0'),
            'seeded token ' || n, $2, array['mcp:read'],
            case when n % 2 = 0 then now() else null end
     from generate_series(1, $3::int) as n`,
    [workspaceId, userId, rows],
  );
}

/**
 * Repositories connected in one statement, so they share a creation time:
 * the tie `currentRepository` breaks by the order it is handed.
 */
async function seedRepositories(workspaceId: string, rows: number) {
  await database.query(
    `select public.ensure_local_repository($1, 'local/seeded-' || lpad(n::text, 4, '0'))
     from generate_series(1, $2::int) as n`,
    [workspaceId, rows],
  );
}

let ownerRepositories: string[] = [];

beforeAll(async () => {
  database = await createTestDatabase([...ALL_MIGRATIONS]);

  const owner = await workspaceFor(OWNER);
  const first = await repositoryIn(owner, "local/drifted-demo");
  await scanDriftedDemo(owner, first);
  // The same files in a second repository: one path, two rows.
  const twin = await repositoryIn(owner, "local/drifted-twin");
  await scanDriftedDemo(owner, twin);
  ownerRepositories = [first, twin];
  const anchor = await database.query<{ id: string; path: string }>(
    `select id, path from public.artifacts
     where workspace_id = $1 and repository_id = $2 order by id limit 1`,
    [owner, first],
  );
  const anchorRow = anchor.rows[0];
  if (!anchorRow) throw new Error("drifted-demo stored no artifacts");
  await seedLedger(owner, first, anchorRow, SEEDED);
  await artifacts(
    owner,
    first,
    "spec",
    Array.from({ length: SEEDED }, (_, index) => ({
      classification: "spec",
      path: `docs/seeded/spec-${String(index + 1).padStart(2, "0")}.md`,
    })),
  );
  await artifacts(owner, twin, "instruction", instructionFiles(SEEDED, "seed"));
  await seedTokens(owner, OWNER, SEEDED);
  await seedRepositories(owner, SEEDED);
  // Runs `alrescha push` applied, which the ledger lists by `local:%`.
  await database.query(
    `insert into public.runs
       (workspace_id, repository_id, trigger_kind, trigger_key, commit_sha,
        status, started_at, completed_at)
     select $1, $2, 'manual', 'local:' || sha, sha, 'succeeded',
            $3::timestamptz - make_interval(hours => n + 1),
            $3::timestamptz - make_interval(hours => n)
     from (select n, repeat(n::text, 40) as sha from generate_series(1, 3) as n) runs`,
    [owner, first, SEEDED_AT],
  );

  const wide = await workspaceFor(WIDE);
  const wideRepository = await repositoryIn(wide, "local/wide-demo");
  const [wideAnchor] = await artifacts(wide, wideRepository, "spec", [
    { classification: "spec", path: "spec.md" },
  ]);
  await seedLedger(
    wide,
    wideRepository,
    { id: wideAnchor ?? "", path: "spec.md" },
    WIDE_ROWS,
  );
  await artifacts(
    wide,
    wideRepository,
    "instruction",
    instructionFiles(WIDE_ROWS, "wide"),
  );
  await seedTokens(wide, WIDE, WIDE_ROWS);
});

afterAll(async () => {
  await database.close();
});

/** Parameters that say where a page starts, not what the read is. */
function isPaging([name, value]: [string, string]): boolean {
  return (
    name === "limit" ||
    name === "offset" ||
    (name === "id" && /^(gt|lt)\./.test(value))
  );
}

/** The requests of one load, grouped into the reads they page. */
function readsOf(
  requests: readonly PostgrestRequestRecord[],
): Map<string, PostgrestRequestRecord[]> {
  const reads = new Map<string, PostgrestRequestRecord[]>();
  for (const request of requests) {
    if (request.kind !== "table") continue;
    const key = [
      request.method,
      request.name,
      ...[...new URL(request.url).searchParams]
        .filter((entry) => !isPaging(entry))
        .map(([name, value]) => `${name}=${value}`)
        .sort(),
    ].join("&");
    reads.set(key, [...(reads.get(key) ?? []), request]);
  }
  return reads;
}

function rowsOf(pages: readonly PostgrestRequestRecord[]): number {
  return pages.reduce((sum, page) => sum + (page.rows ?? 0), 0);
}

/**
 * The ledger as it reads at one moment. The digest windows start where the
 * clock says, and the visit stamp is the screen's own write, so both are set
 * aside: the previous visit is cleared before each load, and a window's
 * start is not compared.
 */
async function progressOf(userId: string, maxRows?: number) {
  await database.query(
    "delete from public.workspace_screen_views where workspace_id = $1",
    [workspaceOf(userId)],
  );
  const { report } = await loadWorkspaceProgressReport(
    sessionFor(userId, maxRows).client,
    userId,
  );
  return {
    ...report,
    digest: Object.fromEntries(
      Object.entries(report.digest).map(([window, entry]) => [
        window,
        entry === null ? null : { ...entry, from: "(clock)" },
      ]),
    ),
  };
}

/**
 * Each loader, as its page calls it, and the reads this fixture puts past
 * the cap — each named by a part of its request no other read of the screen
 * shares.
 */
const LOADS: Record<
  string,
  {
    readonly load: (client: SupabaseClient) => Promise<unknown>;
    readonly pastTheCap: readonly string[];
  }
> = {
  harness: {
    load: (client) => readHarnessRows(client, workspaceOf(OWNER)),
    pastTheCap: ["GET&artifacts&", "GET&repositories&"],
  },
  home: {
    load: (client) => loadWorkspaceJourney(client, OWNER),
    pastTheCap: ["GET&mcp_tokens&", "GET&repositories&"],
  },
  inspection: {
    load: (client) => loadWorkspaceInspectionDashboard(client, OWNER),
    pastTheCap: ["kind=in.(adr,instruction,spec,todo)", "GET&todos&"],
  },
  progress: {
    load: (client) => loadWorkspaceProgressReport(client, OWNER),
    pastTheCap: ["GET&edges&", "GET&requirements&", "GET&todos&"],
  },
};

describe("the screens' loaders past PostgREST's row cap (RE-04)", () => {
  it("has more rows than the cap in every table they page, and fewer in every read they do not", async () => {
    // Not a tautology: a fixture under the cap would pass everything below.
    const workspaceId = workspaceOf(OWNER);
    const stored = async (sql: string) => count(sql, [workspaceId]);
    const paged = {
      activeRequirements: await stored(
        "select count(*)::int as n from public.requirements where workspace_id = $1 and status = 'active'",
      ),
      documents: await stored(
        "select count(*)::int as n from public.artifacts where workspace_id = $1 and kind in ('adr', 'instruction', 'spec', 'todo')",
      ),
      implementsEdges: await stored(
        "select count(*)::int as n from public.edges where workspace_id = $1 and relation = 'implements'",
      ),
      instructions: await stored(
        "select count(*)::int as n from public.artifacts where workspace_id = $1 and kind = 'instruction'",
      ),
      repositories: await stored(
        "select count(*)::int as n from public.repositories where workspace_id = $1",
      ),
      todos: await stored(
        "select count(*)::int as n from public.todos where workspace_id = $1",
      ),
      tokens: await stored(
        "select count(*)::int as n from public.mcp_tokens where workspace_id = $1",
      ),
    };
    for (const [table, rows] of Object.entries(paged)) {
      expect({ rows: rows > CAP, table }).toEqual({ rows: true, table });
    }
    const single = {
      localScans: await stored(
        "select count(*)::int as n from public.runs where workspace_id = $1 and trigger_key like 'local:%'",
      ),
      progressEvents: await stored(
        "select count(*)::int as n from public.progress_events where workspace_id = $1",
      ),
      receipts: await stored(
        "select count(*)::int as n from public.receipts where workspace_id = $1",
      ),
      resolvedFindings: await stored(
        "select count(*)::int as n from public.findings where workspace_id = $1 and status = 'resolved'",
      ),
      ruledOut: await stored(
        "select count(*)::int as n from public.ruled_out_attempts where workspace_id = $1",
      ),
    };
    for (const [table, rows] of Object.entries(single)) {
      expect({ rows: rows <= CAP, table }).toEqual({ rows: true, table });
    }
  });

  it("counts the progress ledger a capped server holds as it would with no cap", async () => {
    const workspaceId = workspaceOf(OWNER);
    const capped = await progressOf(OWNER, CAP);
    const whole = await progressOf(OWNER);
    // The uncapped ledger is the stored one, not merely another answer.
    const active = await count(
      "select count(*)::int as n from public.requirements where workspace_id = $1 and status = 'active'",
      [workspaceId],
    );
    const covered = await count(
      `select count(distinct r.id)::int as n from public.requirements r
       join public.edges e
         on e.workspace_id = r.workspace_id and e.source_node_id = r.id
        and e.relation = 'implements'
       where r.workspace_id = $1 and r.status = 'active'`,
      [workspaceId],
    );
    const todos = await count(
      "select count(*)::int as n from public.todos where workspace_id = $1",
      [workspaceId],
    );
    expect(whole.metrics.requirements).toMatchObject({
      completed: covered,
      total: active,
    });
    expect(whole.metrics.todos.total).toBe(todos);
    expect(capped.metrics).toEqual(whole.metrics);
    expect(capped).toEqual(whole);
  });

  it("lists every document and counts every todo on /app/inspection under the cap", async () => {
    const workspaceId = workspaceOf(OWNER);
    const capped = await loadWorkspaceInspectionDashboard(
      sessionFor(OWNER, CAP).client,
      OWNER,
    );
    const whole = await loadWorkspaceInspectionDashboard(
      sessionFor(OWNER).client,
      OWNER,
    );
    const documents = await count(
      `select count(*)::int as n from public.artifacts
       where workspace_id = $1 and kind in ('adr', 'instruction', 'spec', 'todo')
         and last_seen_commit_sha is not null`,
      [workspaceId],
    );
    const todos = await count(
      "select count(*)::int as n from public.todos where workspace_id = $1",
      [workspaceId],
    );
    expect(whole.dashboard.documents.entries).toHaveLength(documents);
    expect(whole.dashboard.progress.total).toBe(todos);
    expect(capped.dashboard.progress).toEqual(whole.dashboard.progress);
    expect(capped).toEqual(whole);
  });

  it("finds the home's repositories and tokens under the cap, and the same current repository", async () => {
    const workspaceId = workspaceOf(OWNER);
    const capped = await loadWorkspaceJourney(
      sessionFor(OWNER, CAP).client,
      OWNER,
    );
    const whole = await loadWorkspaceJourney(sessionFor(OWNER).client, OWNER);
    expect(whole.repositoryCount).toBe(
      await count(
        "select count(*)::int as n from public.repositories where workspace_id = $1",
        [workspaceId],
      ),
    );
    expect(whole.activeTokenCount).toBe(
      await count(
        "select count(*)::int as n from public.mcp_tokens where workspace_id = $1 and revoked_at is null",
        [workspaceId],
      ),
    );
    // The seeded repositories share one creation time. The tie goes to the
    // newest id, the order `/app/map` hands `currentRepository`, so the two
    // screens name one repository.
    const newest = await database.query<{ full_name: string }>(
      `select full_name from public.repositories where workspace_id = $1
       order by created_at desc, id desc limit 1`,
      [workspaceId],
    );
    expect(whole.repoFullName).toBe(newest.rows[0]?.full_name);
    expect(capped).toEqual(whole);
  });

  it("draws every instruction file on /app/harness under the cap, in the database's path order", async () => {
    const workspaceId = workspaceOf(OWNER);
    const capped = await readHarnessRows(
      sessionFor(OWNER, CAP).client,
      workspaceId,
    );
    const whole = await readHarnessRows(sessionFor(OWNER).client, workspaceId);
    // The order is the database's `order by path`, with the id deciding a
    // path two repositories share, as the page listed them before.
    const stored = await database.query<{ id: string }>(
      `select id from public.artifacts
       where workspace_id = $1 and kind = 'instruction' order by path, id`,
      [workspaceId],
    );
    expect(whole?.artifacts.map(({ id }) => id)).toEqual(
      stored.rows.map(({ id }) => id),
    );
    expect(whole?.repositoryNames.size).toBe(
      await count(
        "select count(*)::int as n from public.repositories where workspace_id = $1",
        [workspaceId],
      ),
    );
    for (const repositoryId of ownerRepositories) {
      expect(whole?.repositoryNames.has(repositoryId)).toBe(true);
    }
    expect(capped).toEqual(whole);
  });

  it("asks past the cap wherever it can cut, stays one request where it cannot, and names the workspace on every page", async () => {
    const workspaceId = workspaceOf(OWNER);
    for (const [screen, { load, pastTheCap }] of Object.entries(LOADS)) {
      const capped = sessionFor(OWNER, CAP);
      await load(capped.client);
      const whole = sessionFor(OWNER);
      await load(whole.client);
      const cappedReads = readsOf(capped.emulator.requests);
      const wholeReads = readsOf(whole.emulator.requests);
      expect({ reads: [...cappedReads.keys()].sort(), screen }).toEqual({
        reads: [...wholeReads.keys()].sort(),
        screen,
      });
      // Paging did happen, in each read this fixture puts past the cap.
      for (const part of pastTheCap) {
        const paged = [...cappedReads].filter(
          ([read, pages]) => read.includes(part) && pages.length > 1,
        );
        expect({ part, paged: paged.length, screen }).toEqual({
          part,
          paged: 1,
          screen,
        });
      }

      for (const [read, pages] of cappedReads) {
        const unpaged = wholeReads.get(read) ?? [];
        // Every read returns under the cap what it returns with none.
        expect({ read, rows: rowsOf(pages) }).toEqual({
          read,
          rows: rowsOf(unpaged),
        });
        // With no cap every read is one request: paging costs nothing where
        // nothing is cut.
        expect({ read, requests: unpaged.length }).toEqual({
          read,
          requests: 1,
        });
        // A read whose own budget is within the real cap is never cut by
        // it, and stays one request.
        const asked = new URL(pages[0]?.url ?? "").searchParams.get("limit");
        if (asked !== null && Number(asked) <= SERVER_CAP) {
          expect({ read, requests: pages.length }).toEqual({
            read,
            requests: 1,
          });
        }
        for (const page of pages) {
          expect({ read, status: page.status }).toEqual({ read, status: 200 });
          expect(page.rows ?? 0).toBeLessThanOrEqual(CAP);
          // The workspace lookup itself is by owner; every other page
          // carries the tenant predicate, not only the first.
          if (page.name !== "workspaces") {
            expect({
              read,
              workspace: new URL(page.url).searchParams.get("workspace_id"),
            }).toEqual({ read, workspace: `eq.${workspaceId}` });
          }
        }
      }
    }
  });
});

describe("the screens' loaders at the real cap (RE-04)", () => {
  it("counts every requirement, link and todo past a thousand", async () => {
    const workspaceId = workspaceOf(WIDE);
    const { client, emulator } = sessionFor(WIDE, SERVER_CAP);
    const { report } = await loadWorkspaceProgressReport(client, WIDE);
    const active = await count(
      "select count(*)::int as n from public.requirements where workspace_id = $1 and status = 'active'",
      [workspaceId],
    );
    const covered = await count(
      `select count(distinct r.id)::int as n from public.requirements r
       join public.edges e
         on e.workspace_id = r.workspace_id and e.source_node_id = r.id
        and e.relation = 'implements'
       where r.workspace_id = $1 and r.status = 'active'`,
      [workspaceId],
    );
    const links = await count(
      "select count(*)::int as n from public.edges where workspace_id = $1 and relation = 'implements'",
      [workspaceId],
    );
    // One in five requirements is withdrawn, two in three are linked, and
    // every fourth twice: more than a thousand links.
    expect(active).toBeGreaterThan(SERVER_CAP / 2);
    expect(links).toBeGreaterThan(SERVER_CAP);
    expect(report.metrics.requirements).toMatchObject({
      completed: covered,
      total: active,
    });
    expect(report.metrics.todos.total).toBe(WIDE_ROWS);
    // Each read took a page of a thousand and what was left.
    const pages = (name: string) =>
      emulator.requests
        .filter((request) => request.name === name)
        .map(({ rows }) => rows);
    expect(pages("requirements")).toEqual([SERVER_CAP, WIDE_ROWS - SERVER_CAP]);
    expect(pages("edges")).toEqual([SERVER_CAP, links - SERVER_CAP]);
    expect(pages("todos")).toEqual([SERVER_CAP, WIDE_ROWS - SERVER_CAP]);
  });

  it("keeps the harness in the database's path order across pages of a thousand", async () => {
    const workspaceId = workspaceOf(WIDE);
    const { client, emulator } = sessionFor(WIDE, SERVER_CAP);
    const rows = await readHarnessRows(client, workspaceId);
    const stored = await database.query<{ id: string }>(
      `select id from public.artifacts
       where workspace_id = $1 and kind = 'instruction' order by path, id`,
      [workspaceId],
    );
    expect(stored.rows).toHaveLength(WIDE_ROWS);
    expect(rows?.artifacts.map(({ id }) => id)).toEqual(
      stored.rows.map(({ id }) => id),
    );
    const pages = emulator.requests.filter(({ name }) => name === "artifacts");
    expect(pages.map(({ rows: n }) => n)).toEqual([
      SERVER_CAP,
      WIDE_ROWS - SERVER_CAP,
    ]);
    // Every page in one total order, so no page repeats or skips a row.
    for (const page of pages) {
      expect(new URL(page.url).searchParams.get("order")).toBe(
        "path.asc,id.asc",
      );
    }
  });

  it("counts every active token on the home past a thousand", async () => {
    const model = await loadWorkspaceJourney(
      sessionFor(WIDE, SERVER_CAP).client,
      WIDE,
    );
    expect(model.activeTokenCount).toBe(WIDE_ROWS / 2);
  });
});
