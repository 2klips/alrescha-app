import type { GitHubRepositoryChoice } from "@alrescha/core";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type { RepositoryRecord } from "./api";
import { reconcileConnectedRepository } from "./repository-identity";

/**
 * A repository renamed on GitHub, selected again (PR #10 follow-up).
 *
 * Production reproduced it on 2026-09-12: GitHub repository id 1328886745
 * is `2klips/alrescha-app`, the picker's inventory still said
 * `2klips/arr-app` (its install-time label), and choosing it wrote the old
 * label over the canonical name on the home and the header. These pin the
 * rule that fixes it — the id is the identity, GitHub's current record is
 * what a selection stores, and nothing is overwritten when that record
 * cannot be read — against a fake of the two tables the connect writes.
 */

type TableResponse = {
  data: unknown;
  error: { code?: string; message: string } | null;
};

class FakeQueryBuilder {
  readonly calls: { args: unknown[]; method: string }[] = [];

  constructor(
    readonly table: string,
    private readonly response: TableResponse,
  ) {}

  #record(method: string, args: unknown[]): this {
    this.calls.push({ args, method });
    return this;
  }

  eq(...args: unknown[]) {
    return this.#record("eq", args);
  }

  select(...args: unknown[]) {
    return this.#record("select", args);
  }

  update(...args: unknown[]) {
    return this.#record("update", args);
  }

  upsert(...args: unknown[]) {
    return this.#record("upsert", args);
  }

  insert(...args: unknown[]) {
    return this.#record("insert", args);
  }

  async maybeSingle() {
    return this.response;
  }

  async single() {
    return this.response;
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?:
      ((value: TableResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.response).then(onfulfilled, onrejected);
  }

  /** The one call of this method, or undefined. */
  call(method: string) {
    return this.calls.find((call) => call.method === method);
  }

  /** `[column, value]` pairs of every `.eq()`. */
  filters() {
    return this.calls
      .filter((call) => call.method === "eq")
      .map((call) => call.args);
  }
}

/**
 * Each table's responses are consumed in `.from()` order and hold on the
 * last one, so the second write to `repositories` (the keep-what-stands
 * update after a refused upsert) can answer differently from the first.
 */
class FakeSupabaseClient {
  readonly builders: FakeQueryBuilder[] = [];
  readonly #queues = new Map<string, TableResponse[]>();

  constructor(responses: Record<string, TableResponse | TableResponse[]>) {
    for (const [table, value] of Object.entries(responses)) {
      this.#queues.set(table, Array.isArray(value) ? [...value] : [value]);
    }
  }

  from(table: string) {
    const queue = this.#queues.get(table) ?? [{ data: null, error: null }];
    const response = (queue.length > 1 ? queue.shift() : queue[0])!;
    const builder = new FakeQueryBuilder(table, response);
    this.builders.push(builder);
    return builder;
  }

  writesTo(table: string) {
    return this.builders.filter((builder) => builder.table === table);
  }
}

const WORKSPACE_ID = "01K287J3D18V7A1MZG9E8D1Y01";
const INSTALLATION_ID = "01K287J3D18V7A1MZG9E8D1Y02";
const REPOSITORY_ID = "01K287J3D18V7A1MZG9E8D1Y03";
const GITHUB_ID = 1_328_886_745;

/** The picker's inventory row: the name from install day. */
const CACHED: GitHubRepositoryChoice = {
  defaultBranch: "main",
  fullName: "acme/arr-app",
  githubRepositoryId: GITHUB_ID,
};
/** GitHub's record today, by the same id. */
const CURRENT: GitHubRepositoryChoice = {
  defaultBranch: "main",
  fullName: "acme/alrescha-app",
  githubRepositoryId: GITHUB_ID,
};

const answers = (record: RepositoryRecord) => vi.fn(async () => record);

function reconcile(
  client: FakeSupabaseClient,
  overrides: Partial<Parameters<typeof reconcileConnectedRepository>[0]> = {},
) {
  const recordAudit = vi.fn(async () => {});
  const readRepository =
    overrides.readRepository ?? answers({ repository: CURRENT });
  return {
    readRepository,
    recordAudit,
    result: reconcileConnectedRepository({
      actorUserId: "user-1",
      cached: CACHED,
      client: client as unknown as SupabaseClient,
      installationId: INSTALLATION_ID,
      readRepository,
      recordAudit,
      token: "installation-secret",
      workspaceId: WORKSPACE_ID,
      ...overrides,
    }),
  };
}

describe("a repository renamed on GitHub, selected again", () => {
  it("stores GitHub's current name by id, and refreshes the picker's inventory row", async () => {
    const client = new FakeSupabaseClient({
      repositories: { data: { id: REPOSITORY_ID }, error: null },
    });

    const { readRepository, recordAudit, result } = reconcile(client);
    const stored = await result;

    expect(readRepository).toHaveBeenCalledWith({
      githubRepositoryId: GITHUB_ID,
      token: "installation-secret",
    });
    expect(stored).toEqual({
      metadata: { confirmed: true, renamed: true, repository: CURRENT },
      repositoryId: REPOSITORY_ID,
    });

    const [inventory] = client.writesTo("github_available_repositories");
    expect(inventory?.call("update")?.args[0]).toEqual({
      default_branch: "main",
      full_name: "acme/alrescha-app",
      observed_at: expect.any(String),
    });
    expect(inventory?.filters()).toEqual([
      ["workspace_id", WORKSPACE_ID],
      ["installation_id", INSTALLATION_ID],
      ["github_repository_id", GITHUB_ID],
    ]);

    const [selection] = client.writesTo("repositories");
    expect(selection?.call("upsert")?.args).toEqual([
      {
        default_branch: "main",
        full_name: "acme/alrescha-app",
        github_repository_id: GITHUB_ID,
        installation_id: INSTALLATION_ID,
        selected_at: expect.any(String),
        workspace_id: WORKSPACE_ID,
      },
      { onConflict: "workspace_id,github_repository_id" },
    ]);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "repository_selected",
        metadata: { kept: false, metadataSource: "github", renamed: true },
        targetId: REPOSITORY_ID,
      }),
    );
  });

  it("leaves the inventory alone when GitHub's record matches it", async () => {
    const client = new FakeSupabaseClient({
      repositories: { data: { id: REPOSITORY_ID }, error: null },
    });

    const stored = await reconcile(client, {
      readRepository: answers({ repository: CACHED }),
    }).result;

    expect(stored.metadata).toEqual({
      confirmed: true,
      renamed: false,
      repository: CACHED,
    });
    expect(client.writesTo("github_available_repositories")).toEqual([]);
  });

  it("keeps the connected row's own name when GitHub cannot be read, and only marks the selection", async () => {
    const client = new FakeSupabaseClient({
      repositories: {
        data: {
          default_branch: "main",
          full_name: "acme/alrescha-app",
          id: REPOSITORY_ID,
        },
        error: null,
      },
    });

    const { recordAudit, result } = reconcile(client, {
      readRepository: answers({
        error: "GitHub repository request failed: 403",
      }),
    });
    const stored = await result;

    expect(stored).toEqual({
      metadata: {
        confirmed: false,
        reason: "GitHub repository request failed: 403",
        repository: CURRENT,
      },
      repositoryId: REPOSITORY_ID,
    });
    expect(client.writesTo("github_available_repositories")).toEqual([]);
    const [selection] = client.writesTo("repositories");
    expect(selection?.call("upsert")).toBeUndefined();
    expect(selection?.call("insert")).toBeUndefined();
    // The stale inventory name is not in the write at all.
    expect(selection?.call("update")?.args[0]).toEqual({
      installation_id: INSTALLATION_ID,
      selected_at: expect.any(String),
    });
    expect(selection?.filters()).toEqual([
      ["workspace_id", WORKSPACE_ID],
      ["github_repository_id", GITHUB_ID],
    ]);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { kept: true, metadataSource: "inventory", renamed: false },
      }),
    );
  });

  it("treats an answer that names another repository as no answer", async () => {
    const client = new FakeSupabaseClient({
      repositories: {
        data: {
          default_branch: "main",
          full_name: "acme/alrescha-app",
          id: REPOSITORY_ID,
        },
        error: null,
      },
    });

    const stored = await reconcile(client, {
      readRepository: answers({
        error: "GitHub repository response names another repository.",
      }),
    }).result;

    expect(stored.metadata).toEqual({
      confirmed: false,
      reason: "GitHub repository response names another repository.",
      repository: CURRENT,
    });
    expect(client.writesTo("github_available_repositories")).toEqual([]);
    expect(
      client.writesTo("repositories")[0]?.call("update")?.args[0],
    ).not.toHaveProperty("full_name");
  });

  it("stores the inventory's values on a first connect when GitHub cannot be read — they are all there is", async () => {
    const client = new FakeSupabaseClient({
      repositories: [
        { data: null, error: null },
        { data: { id: REPOSITORY_ID }, error: null },
      ],
    });

    const stored = await reconcile(client, {
      readRepository: answers({
        error: "GitHub repository request failed: ECONNRESET",
      }),
    }).result;

    expect(stored).toEqual({
      metadata: {
        confirmed: false,
        reason: "GitHub repository request failed: ECONNRESET",
        repository: CACHED,
      },
      repositoryId: REPOSITORY_ID,
    });
    const [marked, inserted] = client.writesTo("repositories");
    expect(marked?.call("update")).toBeDefined();
    expect(inserted?.call("upsert")?.args).toEqual([
      expect.objectContaining({
        full_name: "acme/arr-app",
        github_repository_id: GITHUB_ID,
      }),
      { onConflict: "workspace_id,github_repository_id" },
    ]);
  });

  it("says so, and keeps the row's name, when GitHub's current name is already another row's", async () => {
    const client = new FakeSupabaseClient({
      repositories: [
        {
          data: null,
          error: { code: "23505", message: "duplicate key value" },
        },
        {
          data: {
            default_branch: "main",
            full_name: "acme/arr-app",
            id: REPOSITORY_ID,
          },
          error: null,
        },
      ],
    });

    const stored = await reconcile(client).result;

    expect(stored).toEqual({
      metadata: {
        confirmed: false,
        reason:
          "GitHub's current name is already another repository's in this workspace",
        repository: CACHED,
      },
      repositoryId: REPOSITORY_ID,
    });
    // The picker still converges on GitHub's name.
    expect(
      client.writesTo("github_available_repositories")[0]?.call("update")
        ?.args[0],
    ).toEqual(expect.objectContaining({ full_name: "acme/alrescha-app" }));
  });

  it("fails on any other write error instead of pretending the selection stood", async () => {
    const client = new FakeSupabaseClient({
      repositories: {
        data: null,
        error: { code: "42501", message: "permission denied" },
      },
    });

    await expect(reconcile(client).result).rejects.toThrow(
      "Failed to select GitHub repository: 42501",
    );
  });

  it("does not call GitHub without a token, and keeps what stands", async () => {
    const client = new FakeSupabaseClient({
      repositories: {
        data: {
          default_branch: "main",
          full_name: "acme/alrescha-app",
          id: REPOSITORY_ID,
        },
        error: null,
      },
    });

    const { readRepository, result } = reconcile(client, { token: null });
    const stored = await result;

    expect(readRepository).not.toHaveBeenCalled();
    expect(stored.metadata).toEqual({
      confirmed: false,
      reason: "no installation token was minted for the repository",
      repository: CURRENT,
    });
  });

  it("writes a repeated selection through the (workspace, GitHub id) key, never a bare insert", async () => {
    const client = new FakeSupabaseClient({
      repositories: { data: { id: REPOSITORY_ID }, error: null },
    });

    const first = await reconcile(client).result;
    const second = await reconcile(client, {
      readRepository: answers({
        error: "GitHub repository request failed: 502",
      }),
    }).result;
    const third = await reconcile(client).result;

    expect([
      first.repositoryId,
      second.repositoryId,
      third.repositoryId,
    ]).toEqual([REPOSITORY_ID, REPOSITORY_ID, REPOSITORY_ID]);
    for (const write of client.writesTo("repositories")) {
      expect(write.call("insert")).toBeUndefined();
      const upsert = write.call("upsert");
      if (upsert) {
        expect(upsert.args[1]).toEqual({
          onConflict: "workspace_id,github_repository_id",
        });
      } else {
        expect(write.filters()).toEqual([
          ["workspace_id", WORKSPACE_ID],
          ["github_repository_id", GITHUB_ID],
        ]);
      }
    }
  });
});
