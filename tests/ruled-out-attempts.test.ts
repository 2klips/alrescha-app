import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ALL_MIGRATIONS, createTestDatabase } from "./helpers/database";

/**
 * Phase 2C todo 2 — the append-only ruled-out log.
 *
 * The whole value of this table is that a recorded dead end survives; the
 * tests below are therefore mostly negative — they prove the paths that
 * would erase history are closed, including for service_role.
 */

const USER_A = "51111111-1111-4111-8111-111111111111";
const USER_B = "52222222-2222-4222-8222-222222222222";

describe("ruled-out attempts (Phase 2C todo 2)", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let workspaceA: string;
  let workspaceB: string;

  beforeEach(async () => {
    database = await createTestDatabase([...ALL_MIGRATIONS]);
    await database.query(
      "insert into auth.users (id, email) values ($1, 'ruled-a@example.test'), ($2, 'ruled-b@example.test')",
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
  });

  afterEach(async () => {
    await database.close();
  });

  async function record(
    workspaceId: string,
    actor: string,
    hypothesis: string,
    outcome = "재현되지 않음",
  ): Promise<string> {
    const result = await database.query<{ id: string }>(
      "select public.record_ruled_out_as($1, $2, $3, $4, $5::text[]) as id",
      [workspaceId, actor, hypothesis, outcome, ["spec/WORK_SPEC.md"]],
    );
    return result.rows[0]!.id;
  }

  it("records an attempt with its actor, refs, and server-measured time", async () => {
    const id = await record(workspaceA, USER_A, "웹훅 서명 검증이 원인");
    const row = await database.query<{
      hypothesis: string;
      outcome: string;
      recorded_at: string;
      recorded_by: string;
      refs: string[];
    }>(
      "select hypothesis, outcome, refs, recorded_by, recorded_at from public.ruled_out_attempts where id = $1",
      [id],
    );
    expect(row.rows[0]).toMatchObject({
      hypothesis: "웹훅 서명 검증이 원인",
      outcome: "재현되지 않음",
      recorded_by: USER_A,
      refs: ["spec/WORK_SPEC.md"],
    });
    expect(row.rows[0]!.recorded_at).not.toBeNull();
  });

  it("refuses to update a recorded attempt — even as the table owner", async () => {
    const id = await record(workspaceA, USER_A, "캐시 무효화 누락");
    await expect(
      database.query(
        "update public.ruled_out_attempts set outcome = 'rewritten' where id = $1",
        [id],
      ),
    ).rejects.toThrow(/append-only/i);
  });

  it("refuses to delete a recorded attempt", async () => {
    const id = await record(workspaceA, USER_A, "레이스 컨디션");
    await expect(
      database.query("delete from public.ruled_out_attempts where id = $1", [
        id,
      ]),
    ).rejects.toThrow(/append-only/i);
    const remaining = await database.query(
      "select id from public.ruled_out_attempts where id = $1",
      [id],
    );
    expect(remaining.rows).toHaveLength(1);
  });

  it("rejects an actor who is not a member of the workspace", async () => {
    await expect(
      record(workspaceA, USER_B, "남의 워크스페이스"),
    ).rejects.toThrow(/not a member/i);
    expect(
      (await database.query("select id from public.ruled_out_attempts")).rows,
    ).toEqual([]);
  });

  it("keeps each workspace's log to itself", async () => {
    await record(workspaceA, USER_A, "A의 가설");
    await record(workspaceB, USER_B, "B의 가설");
    const inA = await database.query<{ hypothesis: string }>(
      "select hypothesis from public.ruled_out_attempts where workspace_id = $1",
      [workspaceA],
    );
    expect(inA.rows).toEqual([{ hypothesis: "A의 가설" }]);
  });

  it("bounds the stored text rather than accepting anything", async () => {
    await expect(
      record(workspaceA, USER_A, "x".repeat(2001)),
    ).rejects.toThrow();
    await expect(record(workspaceA, USER_A, "")).rejects.toThrow();
  });
});
