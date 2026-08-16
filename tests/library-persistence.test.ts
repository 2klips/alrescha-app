import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createLibrarySnapshot } from "../packages/core/src/index";
import {
  AUTH_TENANCY_MIGRATION,
  LIBRARY_MIGRATION,
  asAuthenticatedUser,
  createTestDatabase,
} from "./helpers/database";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const REPOSITORY_A = "01J0000000000000000000000A";

describe("personal library persistence", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let workspaceA = "";

  beforeAll(async () => {
    database = await createTestDatabase([
      AUTH_TENANCY_MIGRATION,
      LIBRARY_MIGRATION,
    ]);
    await database.query(
      "insert into auth.users (id, email) values ($1, 'library-a@example.test'), ($2, 'library-b@example.test')",
      [USER_A, USER_B],
    );
    const workspaces = await database.query<{
      id: string;
      owner_user_id: string;
    }>("select id, owner_user_id from public.workspaces");
    workspaceA =
      workspaces.rows.find(({ owner_user_id }) => owner_user_id === USER_A)
        ?.id ?? "";
    await database.query(
      `insert into public.repositories (id, workspace_id, full_name)
       values ($1, $2, 'arr/drifted-demo')`,
      [REPOSITORY_A, workspaceA],
    );
  });

  afterAll(async () => {
    await database.close();
  });

  it("dedupes the same content digest and preserves the first sourced snapshot", async () => {
    const snapshot = createLibrarySnapshot({
      content: "# Review auth\n\nCheck OAuth evidence.\n",
      name: "Review auth",
      source: {
        commitSha: "1".repeat(40),
        path: ".agents/skills/review-auth/SKILL.md",
        repository: "arr/drifted-demo",
      },
      tags: ["auth", "review"],
      type: "skill",
    });
    const save = (name: string, path: string, commitSha: string) =>
      asAuthenticatedUser(database, USER_A, (transaction) =>
        transaction.query<{ created: boolean; id: string }>(
          `select * from public.save_library_item(
            $1, $2, 'skill', $3, 'arr/drifted-demo', $4, $5, $6, $7
          )`,
          [
            workspaceA,
            name,
            path,
            commitSha,
            snapshot.content,
            snapshot.digest,
            snapshot.tags,
          ],
        ),
      );

    const first = await save(
      snapshot.name,
      snapshot.source.path,
      snapshot.source.commitSha,
    );
    const duplicate = await save(
      "Changed upstream name",
      "changed/SKILL.md",
      "2".repeat(40),
    );
    const stored = await asAuthenticatedUser(database, USER_A, (transaction) =>
      transaction.query<{
        content_snapshot: string;
        digest: string;
        name: string;
        source_commit_sha: string;
        source_path: string;
      }>(
        "select name, source_path, source_commit_sha, content_snapshot, digest from public.library_items",
      ),
    );

    expect(first.rows[0]).toMatchObject({
      created: true,
      id: expect.any(String),
    });
    expect(duplicate.rows[0]).toEqual({
      created: false,
      id: first.rows[0]?.id,
    });
    expect(stored.rows).toEqual([
      {
        content_snapshot: snapshot.content,
        digest: snapshot.digest,
        name: "Review auth",
        source_commit_sha: "1".repeat(40),
        source_path: ".agents/skills/review-auth/SKILL.md",
      },
    ]);
  });

  it("keeps items workspace-private and deletes only the saved snapshot", async () => {
    const hidden = await asAuthenticatedUser(database, USER_B, (transaction) =>
      transaction.query("select id from public.library_items"),
    );
    expect(hidden.rows).toEqual([]);

    await expect(
      asAuthenticatedUser(database, USER_B, (transaction) =>
        transaction.query(
          `select * from public.save_library_item(
            $1, 'Spoofed', 'skill', 'SKILL.md', 'arr/drifted-demo',
            $2, 'spoofed', $3, '{}'
          )`,
          [workspaceA, "3".repeat(40), "a".repeat(64)],
        ),
      ),
    ).rejects.toThrow(/workspace access denied/i);

    await expect(
      asAuthenticatedUser(database, USER_A, (transaction) =>
        transaction.query("update public.library_items set name = 'Mutated'"),
      ),
    ).rejects.toThrow(/permission denied|immutable/i);

    await asAuthenticatedUser(database, USER_A, (transaction) =>
      transaction.query("delete from public.library_items"),
    );
    const sourceRepository = await database.query<{ count: number }>(
      "select count(*)::int as count from public.repositories where id = $1",
      [REPOSITORY_A],
    );
    expect(sourceRepository.rows).toEqual([{ count: 1 }]);
  });
});
