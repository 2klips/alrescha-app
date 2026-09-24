import { PGlite } from "@electric-sql/pglite";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { postgrestOverPglite } from "./helpers/postgrest-pglite";

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
