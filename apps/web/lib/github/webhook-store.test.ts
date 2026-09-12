import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { createGitHubWebhookStore } from "./webhook-store";

/**
 * A delivery finds its repository by id (PR #10 follow-up). GitHub sends a
 * push with the repository's *current* name; a row that still carries the
 * name from before a rename — or the stale one a selection copied in — must
 * still be the same repository, or every push is `repository_not_selected`
 * until someone renames the row by hand.
 */

class FakeQueryBuilder {
  readonly filters: unknown[][] = [];

  constructor(
    readonly table: string,
    private readonly response: { data: unknown; error: null },
  ) {}

  select() {
    return this;
  }

  eq(...args: unknown[]) {
    this.filters.push(args);
    return this;
  }

  async maybeSingle() {
    return this.response;
  }
}

class FakeSupabaseClient {
  readonly builders: FakeQueryBuilder[] = [];

  constructor(private readonly rows: Record<string, unknown>) {}

  from(table: string) {
    const builder = new FakeQueryBuilder(table, {
      data: this.rows[table] ?? null,
      error: null,
    });
    this.builders.push(builder);
    return builder;
  }
}

const WORKSPACE_ID = "01K287J3D18V7A1MZG9E8D1Y01";

describe("resolving a webhook delivery's repository", () => {
  it("matches the row by installation and GitHub id, not by the name the delivery carries", async () => {
    const client = new FakeSupabaseClient({
      github_installations: {
        id: "inst-row",
        revoked_at: null,
        workspace_id: WORKSPACE_ID,
      },
      repositories: { id: "repo-row", workspace_id: WORKSPACE_ID },
    });
    const store = createGitHubWebhookStore(client as unknown as SupabaseClient);

    const resolved = await store.resolveRepository({
      installationId: 777,
      repositoryFullName: "acme/alrescha-app",
      repositoryGitHubId: 1_328_886_745,
    });

    expect(resolved).toEqual({ id: "repo-row", workspaceId: WORKSPACE_ID });
    const repositories = client.builders.find(
      (builder) => builder.table === "repositories",
    );
    expect(repositories?.filters).toEqual([
      ["workspace_id", WORKSPACE_ID],
      ["installation_id", "inst-row"],
      ["github_repository_id", 1_328_886_745],
    ]);
    expect(
      repositories?.filters.some(([column]) => column === "full_name"),
    ).toBe(false);
  });

  it("still answers nothing for a revoked installation or an unselected repository", async () => {
    const revoked = createGitHubWebhookStore(
      new FakeSupabaseClient({
        github_installations: {
          id: "inst-row",
          revoked_at: "2026-09-12T00:00:00Z",
          workspace_id: WORKSPACE_ID,
        },
        repositories: { id: "repo-row", workspace_id: WORKSPACE_ID },
      }) as unknown as SupabaseClient,
    );
    const unselected = createGitHubWebhookStore(
      new FakeSupabaseClient({
        github_installations: {
          id: "inst-row",
          revoked_at: null,
          workspace_id: WORKSPACE_ID,
        },
      }) as unknown as SupabaseClient,
    );
    const delivery = {
      installationId: 777,
      repositoryFullName: "acme/alrescha-app",
      repositoryGitHubId: 1_328_886_745,
    };

    expect(await revoked.resolveRepository(delivery)).toBeNull();
    expect(await unselected.resolveRepository(delivery)).toBeNull();
  });
});
