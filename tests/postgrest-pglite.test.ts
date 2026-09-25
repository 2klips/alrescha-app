import { PGlite } from "@electric-sql/pglite";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestDatabase } from "./helpers/database";
import {
  postgrestOverPglite,
  type PostgrestPgliteOptions,
} from "./helpers/postgrest-pglite";

/**
 * The emulator the RE-04 read tests and probe stand on. What it has to get
 * right is what PostgREST does with the requests the real client sends:
 * filters, order, the limit and the server's own row cap, the exact count,
 * and scalar functions — and to refuse anything else rather than misread it.
 */

let database: PGlite;

beforeAll(async () => {
  database = new PGlite();
  await database.exec(`
    create table public.things (
      id text primary key, workspace_id text not null, n integer not null,
      tag text, meta jsonb
    );
    insert into public.things
    select 'T' || lpad(i::text, 3, '0'), case when i % 2 = 0 then 'A' else 'B' end,
           i, case when i % 3 = 0 then null else 'x' || i end,
           jsonb_build_object('i', i)
    from generate_series(1, 30) i;
    create function public.twice(value integer, label text default null)
    returns jsonb language sql as $$ select jsonb_build_object('v', value * 2, 'l', label) $$;
  `);
});

afterAll(async () => {
  await database.close();
});

function clientFor(maxRows?: number) {
  const emulator = postgrestOverPglite(
    database,
    maxRows === undefined ? {} : { maxRows },
  );
  return {
    client: createClient("https://abcdefghijklmnopqrst.supabase.co", "key", {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: emulator.fetch },
    }),
    emulator,
  };
}

describe("PostgREST over PGlite", () => {
  it("filters, orders and limits the way the client asked", async () => {
    const { client } = clientFor();
    const result = await client
      .from("things")
      .select("id, n, meta")
      .eq("workspace_id", "A")
      .gt("n", 10)
      .neq("id", "T012")
      .order("n", { ascending: false })
      .limit(3);
    expect(result.error).toBeNull();
    expect(result.data).toEqual([
      { id: "T030", meta: { i: 30 }, n: 30 },
      { id: "T028", meta: { i: 28 }, n: 28 },
      { id: "T026", meta: { i: 26 }, n: 26 },
    ]);
  });

  it("reads in, is and an or of lists", async () => {
    const { client } = clientFor();
    const listed = await client
      .from("things")
      .select("id")
      .in("id", ["T001", "T002", "T099"])
      .order("id", { ascending: true });
    expect(listed.data).toEqual([{ id: "T001" }, { id: "T002" }]);
    const empty = await client
      .from("things")
      .select("id")
      .is("tag", null)
      .eq("workspace_id", "B")
      .order("id", { ascending: true });
    expect(empty.data?.map(({ id }) => id)).toEqual([
      "T003",
      "T009",
      "T015",
      "T021",
      "T027",
    ]);
    const either = await client
      .from("things")
      .select("id")
      .or("id.in.(T001,T004),n.in.(7)")
      .order("id", { ascending: true });
    expect(either.data?.map(({ id }) => id)).toEqual(["T001", "T004", "T007"]);
  });

  it("stops at its own row cap whatever the limit, and still counts them all", async () => {
    const { client } = clientFor(4);
    const result = await client
      .from("things")
      .select("id", { count: "exact" })
      .eq("workspace_id", "A")
      .order("id", { ascending: true })
      .limit(2_001);
    expect(result.data).toHaveLength(4);
    expect(result.count).toBe(15);
  });

  it("calls a scalar function with named arguments", async () => {
    const { client, emulator } = clientFor();
    const result = await client.rpc("twice", { label: "k", value: 21 });
    expect(result.data).toEqual({ l: "k", v: 42 });
    expect(emulator.requests.at(-1)).toMatchObject({
      kind: "rpc",
      name: "twice",
      status: 200,
    });
  });

  it("records what each request returned", async () => {
    const { client, emulator } = clientFor();
    await client.from("things").select("id").eq("workspace_id", "B").limit(5);
    const [record] = emulator.requests;
    expect(record).toMatchObject({
      kind: "table",
      method: "GET",
      name: "things",
      rows: 5,
      status: 200,
    });
    expect(record?.bytes).toBe(
      JSON.stringify(
        [...Array(5)].map((_, i) => ({
          id: `T${String(2 * i + 1).padStart(3, "0")}`,
        })),
      ).length,
    );
    expect(record?.urlChars).toBe(record?.url.length);
  });

  it("refuses a shape it does not read instead of guessing", async () => {
    const { client } = clientFor();
    const result = await client.from("things").select("id").ilike("tag", "x%");
    expect(result.status).toBe(501);
    expect(result.error?.message).toMatch(/emulator: operator ilike/);
  });
});

/**
 * The shapes the screens' loaders send besides the map's (RE-04 loaders):
 * a `like` pattern (`/app/progress`'s CLI runs), a `HEAD` that asks only for
 * the count (the home's node, edge and assertion counts), and a value read
 * out of a json column (`/app/inspection`'s document summaries).
 */
describe("PostgREST over PGlite — the screen loaders' shapes", () => {
  it("matches a like pattern, reading * as %", async () => {
    const { client } = clientFor();
    const percent = await client
      .from("things")
      .select("id")
      .like("tag", "x1%")
      .order("id", { ascending: true });
    expect(percent.error).toBeNull();
    // x12, x15 and x18 have no tag: every third row is null.
    expect(percent.data?.map(({ id }) => id)).toEqual([
      "T001",
      "T010",
      "T011",
      "T013",
      "T014",
      "T016",
      "T017",
      "T019",
    ]);
    const star = await client
      .from("things")
      .select("id")
      .like("tag", "x2*")
      .order("id", { ascending: true });
    expect(star.data?.map(({ id }) => id)).toEqual([
      "T002",
      "T020",
      "T022",
      "T023",
      "T025",
      "T026",
      "T028",
      "T029",
    ]);
  });

  it("answers a HEAD with the whole count and no rows, whatever its cap", async () => {
    const { client, emulator } = clientFor(4);
    const result = await client
      .from("things")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", "A");
    expect(result.error).toBeNull();
    expect(result.count).toBe(15);
    expect(result.data).toBeNull();
    expect(emulator.requests.at(-1)).toMatchObject({
      bytes: 0,
      method: "HEAD",
      name: "things",
      rows: 0,
      status: 200,
    });
  });

  it("reads a value out of a json column, as json or as text, under its alias or its key", async () => {
    const { client } = clientFor();
    const aliased = await client
      .from("things")
      .select("id,as_json:meta->i,as_text:meta->>i")
      .eq("id", "T005");
    expect(aliased.error).toBeNull();
    expect(aliased.data).toEqual([{ as_json: 5, as_text: "5", id: "T005" }]);
    const named = await client
      .from("things")
      .select("id,meta->i,missing:meta->absent")
      .eq("id", "T006");
    expect(named.data).toEqual([{ i: 6, id: "T006", missing: null }]);
  });
});

/**
 * The shapes the map loader sends besides the store's (RE-04 map): the one
 * object `.single()` asks for, a negated filter, a to-one embed through a
 * composite tenant key (`jobs` → `runs(commit_sha)`), and a signed-in user's
 * session under row security.
 */
describe("PostgREST over PGlite — the map loader's shapes", () => {
  const OWNER = "78000000-0000-4000-8000-0000000000e1";
  const OTHER = "78000000-0000-4000-8000-0000000000e2";
  let supabase: PGlite;

  beforeAll(async () => {
    supabase = await createTestDatabase([]);
    await supabase.exec(`
      create table public.runs (
        workspace_id text not null, id text not null, commit_sha text,
        primary key (workspace_id, id)
      );
      create table public.jobs (
        id text primary key, workspace_id text not null, run_id text,
        completed_at timestamptz,
        foreign key (workspace_id, run_id) references public.runs(workspace_id, id)
      );
      insert into public.runs values ('W', 'R1', 'aaa'), ('V', 'R1', 'bbb');
      insert into public.jobs values
        ('J1', 'W', 'R1', '2026-09-24T00:00:00Z'),
        ('J2', 'W', null, null);
      create table public.notes (
        id text primary key, owner uuid not null, body text not null
      );
      insert into public.notes values
        ('N1', '${OWNER}', 'mine'), ('N2', '${OTHER}', 'theirs'),
        ('N3', '${OWNER}', 'also mine');
      alter table public.notes enable row level security;
      create policy notes_owner on public.notes for select to authenticated
        using (owner = auth.uid());
      grant select on public.notes to authenticated;
    `);
  });

  afterAll(async () => {
    await supabase.close();
  });

  function session(options: PostgrestPgliteOptions = {}) {
    const emulator = postgrestOverPglite(supabase, options);
    return createClient("https://abcdefghijklmnopqrst.supabase.co", "key", {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: emulator.fetch },
    });
  }

  it("answers .single() with the row itself, and 406 when there is not exactly one", async () => {
    const one = await session()
      .from("jobs")
      .select("id")
      .eq("id", "J1")
      .limit(1)
      .single();
    expect(one.error).toBeNull();
    expect(one.data).toEqual({ id: "J1" });
    const two = await session().from("jobs").select("id").single();
    expect(two.status).toBe(406);
    expect(two.error?.code).toBe("PGRST116");
    expect(two.data).toBeNull();
  });

  it("negates a filter with not", async () => {
    const done = await session()
      .from("jobs")
      .select("id")
      .not("completed_at", "is", null);
    expect(done.data).toEqual([{ id: "J1" }]);
    const others = await session()
      .from("jobs")
      .select("id")
      .not("id", "eq", "J1");
    expect(others.data).toEqual([{ id: "J2" }]);
  });

  it("embeds a to-one resource through its whole foreign key, null when it points nowhere", async () => {
    const result = await session()
      .from("jobs")
      .select("id,runs(commit_sha)")
      .order("id", { ascending: true });
    expect(result.error).toBeNull();
    // `R1` exists in two workspaces; the tenant half of the key picks one.
    expect(result.data).toEqual([
      { id: "J1", runs: { commit_sha: "aaa" } },
      { id: "J2", runs: null },
    ]);
  });

  it("refuses an embed with no single foreign key to follow", async () => {
    const result = await session().from("runs").select("id,jobs(id)");
    expect(result.status).toBe(501);
    expect(result.error?.message).toMatch(/emulator: embed jobs of runs/);
  });

  it("reads as a signed-in user under row security, count included", async () => {
    const result = await session({ role: "authenticated", userId: OWNER })
      .from("notes")
      .select("id", { count: "exact" })
      .order("id", { ascending: true });
    expect(result.data).toEqual([{ id: "N1" }, { id: "N3" }]);
    expect(result.count).toBe(2);
    expect(() =>
      postgrestOverPglite(supabase, { role: "authenticated" }),
    ).toThrow(/userId/);
  });
});
