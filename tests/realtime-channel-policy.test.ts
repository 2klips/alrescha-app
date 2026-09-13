import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ACCESS_EVENTS_CHANNEL_POLICY_MIGRATION,
  ALL_MIGRATIONS,
  asAuthenticatedUser,
  asServiceRole,
  createTestDatabase,
} from "./helpers/database";

const ROOT = resolve(import.meta.dirname, "..");

/**
 * Phase 4 Wave B todo 15 — who may listen to a workspace's access-event
 * channel.
 *
 * Realtime authorises a private-channel join by running a `select` against
 * `realtime.messages` as the caller with `realtime.topic()` set to the
 * requested topic; the policy below is that check. The unit-test database
 * is plain Postgres with no `realtime` schema, so the migration is guarded
 * and this test installs the stub it guards for: the table, the grants
 * Supabase ships, and the `topic()` function, shaped the way the platform
 * shapes them. What is asserted is the policy — the platform's own join
 * plumbing is exercised by the Playwright spec over a real Realtime server.
 */

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

const REALTIME_STUB = `
  create schema realtime;
  create table realtime.messages (
    id uuid primary key default gen_random_uuid(),
    topic text not null,
    extension text not null,
    payload jsonb,
    event text,
    private boolean default false,
    inserted_at timestamp not null default now()
  );
  alter table realtime.messages enable row level security;
  grant usage on schema realtime to anon, authenticated, service_role;
  grant select, insert, update on realtime.messages to anon, authenticated, service_role;
  create function realtime.topic()
  returns text
  language sql
  stable
  as $$
    select nullif(current_setting('realtime.topic', true), '')::text;
  $$;
  grant execute on function realtime.topic() to anon, authenticated, service_role;
`;

function channelOf(workspaceId: string): string {
  return `workspace:${workspaceId}:access-events`;
}

describe("access-events channel policy", () => {
  let database: PGlite;
  let workspaceA = "";
  let workspaceB = "";

  beforeEach(async () => {
    database = await createTestDatabase(
      ALL_MIGRATIONS.filter(
        (migration) => migration !== ACCESS_EVENTS_CHANNEL_POLICY_MIGRATION,
      ),
    );
    await database.exec(REALTIME_STUB);
    await database.exec(
      await readFile(
        resolve(ROOT, ACCESS_EVENTS_CHANNEL_POLICY_MIGRATION),
        "utf8",
      ),
    );

    await database.query(
      "insert into auth.users (id, email) values ($1, 'glow-a@example.test'), ($2, 'glow-b@example.test')",
      [USER_A, USER_B],
    );
    const workspaces = await database.query<{
      id: string;
      owner_user_id: string;
    }>("select id, owner_user_id from public.workspaces");
    workspaceA =
      workspaces.rows.find(({ owner_user_id }) => owner_user_id === USER_A)
        ?.id ?? "";
    workspaceB =
      workspaces.rows.find(({ owner_user_id }) => owner_user_id === USER_B)
        ?.id ?? "";
    expect(workspaceA).not.toBe("");
    expect(workspaceB).not.toBe("");

    // The frame the server publishes, as the service role publishes it.
    await asServiceRole(database, async (tx) => {
      await tx.query(
        `insert into realtime.messages (topic, extension, event, private, payload)
         values ($1, 'broadcast', 'access_event', true, '{"tool":"search_index"}'::jsonb)`,
        [channelOf(workspaceA)],
      );
    });
  });

  afterEach(async () => {
    await database.close();
  });

  async function visibleTo(userId: string, topic: string): Promise<number> {
    return asAuthenticatedUser(database, userId, async (tx) => {
      await tx.query("select set_config('realtime.topic', $1, true)", [topic]);
      const result = await tx.query<{ count: number }>(
        "select count(*)::int as count from realtime.messages",
      );
      return result.rows[0]?.count ?? -1;
    });
  }

  it("installs the policy when realtime.messages exists", async () => {
    const policies = await database.query<{ policyname: string; cmd: string }>(
      "select policyname, cmd from pg_policies where schemaname = 'realtime' and tablename = 'messages'",
    );
    expect(policies.rows).toEqual([
      { cmd: "SELECT", policyname: "access_events_channel_member_read" },
    ]);
  });

  it("lets a workspace member join its own access-events channel", async () => {
    expect(await visibleTo(USER_A, channelOf(workspaceA))).toBe(1);
  });

  it("refuses another workspace's channel — the cross-tenant join", async () => {
    // B is signed in and holds A's workspace id; the topic is well-formed.
    // Membership, not knowledge of the id, is what the policy asks for.
    expect(await visibleTo(USER_B, channelOf(workspaceA))).toBe(0);
  });

  it("refuses topics that are not the access-events channel", async () => {
    // A member of A asking for a differently-named topic under the same
    // workspace gets nothing: the policy names the one channel it opens.
    expect(await visibleTo(USER_A, `workspace:${workspaceA}:notes`)).toBe(0);
    expect(await visibleTo(USER_A, workspaceA)).toBe(0);
    expect(await visibleTo(USER_A, "")).toBe(0);
  });

  it("never lets a browser publish into the channel", async () => {
    // Only `select` is granted by policy. The table grant permits inserts
    // (that is how Supabase ships it), so what blocks this is the absence of
    // an insert policy — a signed-in member cannot light nodes by writing a
    // frame that looks like a tool call.
    await expect(
      asAuthenticatedUser(database, USER_A, async (tx) => {
        await tx.query("select set_config('realtime.topic', $1, true)", [
          channelOf(workspaceA),
        ]);
        await tx.query(
          `insert into realtime.messages (topic, extension, event, private, payload)
           values ($1, 'broadcast', 'access_event', true, '{"tool":"forged"}'::jsonb)`,
          [channelOf(workspaceA)],
        );
      }),
    ).rejects.toThrow(/row-level security/);
  });

  it("is a no-op on a database without the realtime schema", async () => {
    const plain = await createTestDatabase([...ALL_MIGRATIONS]);
    try {
      const schemas = await plain.query<{ nspname: string }>(
        "select nspname from pg_namespace where nspname = 'realtime'",
      );
      expect(schemas.rows).toEqual([]);
    } finally {
      await plain.close();
    }
  });
});
