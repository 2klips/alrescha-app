import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ALL_MIGRATIONS,
  asAuthenticatedUser,
  createTestDatabase,
} from "./helpers/database";

/**
 * "Since your last visit" needs one stored fact (Phase 4 Wave D todo 19 ⑵).
 *
 * The order inside `touch_screen_view` is the whole design: it returns what
 * was there **before** it writes. A screen that stamped first would always
 * read its own stamp and report that nothing had happened, every time.
 *
 * Per member, not per workspace: two people on one workspace have different
 * last visits, and a shared row would tell the second one that everything
 * the first one already read is new.
 */

const OWNER = "7C000000-0000-4000-8000-000000000001".toLowerCase();
const MEMBER = "7D000000-0000-4000-8000-000000000002".toLowerCase();
const OUTSIDER = "7E000000-0000-4000-8000-000000000003".toLowerCase();

describe("screen views", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let workspace: string;

  async function touch(user: string, screen = "progress") {
    const rows = await asAuthenticatedUser(database, user, async (tx) =>
      tx.query<{ previous: string | null }>(
        "select public.touch_screen_view($1, $2) as previous",
        [workspace, screen],
      ),
    );
    return rows.rows[0]?.previous ?? null;
  }

  beforeEach(async () => {
    database = await createTestDatabase([...ALL_MIGRATIONS]);
    await database.query(
      `insert into auth.users (id, email) values
        ($1, 'views-owner@example.test'),
        ($2, 'views-member@example.test'),
        ($3, 'views-outsider@example.test')`,
      [OWNER, MEMBER, OUTSIDER],
    );
    const workspaces = await database.query<{ id: string }>(
      "select id from public.workspaces where owner_user_id = $1",
      [OWNER],
    );
    workspace = workspaces.rows[0]?.id ?? "";
    await database.query(
      `insert into public.workspace_members (workspace_id, user_id, role)
       values ($1, $2, 'member')`,
      [workspace, MEMBER],
    );
  });

  afterEach(async () => {
    await database.close();
  });

  it("reports never on the first visit, and the first visit on the second", async () => {
    // Null is not "nothing new" — the screen says so rather than showing an
    // empty digest to somebody who has never opened it.
    expect(await touch(OWNER)).toBeNull();

    const second = await touch(OWNER);
    expect(second).not.toBeNull();
    expect(Date.parse(second ?? "")).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it("moves the stamp forward on every visit", async () => {
    await touch(OWNER);
    const first = await touch(OWNER);
    const third = await touch(OWNER);

    // The third call sees the second call's stamp, not the first's.
    expect(Date.parse(third ?? "")).toBeGreaterThanOrEqual(
      Date.parse(first ?? ""),
    );
  });

  it("keeps each member's visits to themselves", async () => {
    await touch(OWNER);
    await touch(OWNER);

    // The member has never opened it, whatever the owner has been doing.
    expect(await touch(MEMBER)).toBeNull();

    const rows = await database.query<{ count: string }>(
      "select count(*)::text as count from public.workspace_screen_views where workspace_id = $1",
      [workspace],
    );
    expect(rows.rows[0]?.count).toBe("2");
  });

  it("keeps each screen separate", async () => {
    await touch(OWNER, "progress");

    expect(await touch(OWNER, "inspection")).toBeNull();
    expect(await touch(OWNER, "progress")).not.toBeNull();
  });

  it("refuses a screen it does not know", async () => {
    await expect(touch(OWNER, "dashboard")).rejects.toThrow();
  });

  it("does not let a non-member stamp another workspace", async () => {
    // The insert policy is the barrier; RLS rejects the write rather than
    // recording a visit by somebody who cannot see the screen.
    await expect(touch(OUTSIDER)).rejects.toThrow();
  });

  it("shows a member only their own row", async () => {
    await touch(OWNER);
    await touch(MEMBER);

    const visible = await asAuthenticatedUser(database, MEMBER, async (tx) =>
      tx.query<{ user_id: string }>(
        "select user_id from public.workspace_screen_views",
      ),
    );
    expect(visible.rows.map(({ user_id }) => user_id)).toEqual([MEMBER]);
  });
});
