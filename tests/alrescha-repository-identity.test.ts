import { describe, expect, it } from "vitest";

import {
  ALRESCHA_REPOSITORY_IDENTITY_MIGRATION,
  AUTH_TENANCY_MIGRATION,
  createTestDatabase,
} from "./helpers/database";

describe("Alrescha repository identity migration", () => {
  it("updates the implementation repository address without changing its id", async () => {
    const database = await createTestDatabase([AUTH_TENANCY_MIGRATION]);

    try {
      await database.query(
        "insert into auth.users (id, email) values ($1, 'rename@example.test')",
        ["71111111-1111-4111-8111-111111111111"],
      );
      const workspace = await database.query<{ id: string }>(
        "select id from public.workspaces limit 1",
      );
      const workspaceId = workspace.rows[0]?.id ?? "";
      await database.query(
        "insert into public.repositories (id, workspace_id, full_name) values ($1, $2, $3)",
        ["01K287J3D18V7A1MZG9E8D1Y09", workspaceId, "2klips/arr-app"],
      );

      await database.exec(
        await import("node:fs/promises").then(({ readFile }) =>
          readFile(ALRESCHA_REPOSITORY_IDENTITY_MIGRATION, "utf8"),
        ),
      );

      const repositories = await database.query<{
        full_name: string;
        id: string;
      }>("select id, full_name from public.repositories");
      expect(repositories.rows).toEqual([
        {
          full_name: "2klips/alrescha-app",
          id: "01K287J3D18V7A1MZG9E8D1Y09",
        },
      ]);
    } finally {
      await database.close();
    }
  });
});
