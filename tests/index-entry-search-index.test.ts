import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  AUTH_TENANCY_MIGRATION,
  BOUND_INDEX_ENTRY_SEARCH_KEYS_MIGRATION,
  createTestDatabase,
  EVIDENCE_GRAPH_MIGRATION,
} from "./helpers/database";

describe("bounded index-entry search index", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;

  beforeAll(async () => {
    database = await createTestDatabase([
      AUTH_TENANCY_MIGRATION,
      EVIDENCE_GRAPH_MIGRATION,
      BOUND_INDEX_ENTRY_SEARCH_KEYS_MIGRATION,
    ]);
  });

  afterAll(async () => {
    await database.close();
  });

  it("indexes tenant selectors without the unbounded search_key", async () => {
    const result = await database.query<{ indexdef: string }>(
      `select indexdef
         from pg_indexes
        where schemaname = 'public'
          and indexname = 'index_entries_workspace_repository_idx'`,
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.indexdef).toContain("(workspace_id, repository_id)");
    expect(result.rows[0]?.indexdef).not.toContain("search_key");
  });
});
