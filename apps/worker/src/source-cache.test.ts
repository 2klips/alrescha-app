import { describe, expect, test } from "vitest";

import {
  GitHubRepositorySource,
  GitHubRequestError,
} from "./github-repository-source";
import {
  TOKEN_REFRESH_MARGIN_MS,
  createExpiringSourceCache,
  readTransientSource,
} from "./source-cache";

const HOUR_MS = 60 * 60 * 1000;

function makeBuild(clock: { now: number }) {
  let calls = 0;
  const build = (workspaceId: string, repositoryId: string) => {
    calls += 1;
    return Promise.resolve({
      expiresAt: new Date(clock.now + HOUR_MS).toISOString(),
      source: { id: `${workspaceId}:${repositoryId}#${calls}` },
    });
  };
  return { build, callCount: () => calls };
}

describe("createExpiringSourceCache (perf research MT-1)", () => {
  test("reuses a fresh source instead of re-minting per job", async () => {
    const clock = { now: 0 };
    const { build, callCount } = makeBuild(clock);
    const sourceFor = createExpiringSourceCache(build, () => clock.now);

    const first = await sourceFor("w", "r");
    clock.now += 10 * 60 * 1000; // 10 minutes later — well inside the hour
    const second = await sourceFor("w", "r");

    expect(second).toBe(first);
    expect(callCount()).toBe(1);
  });

  test("re-mints ahead of expiry, not after the token is already dead", async () => {
    const clock = { now: 0 };
    const { build, callCount } = makeBuild(clock);
    const sourceFor = createExpiringSourceCache(build, () => clock.now);

    const first = await sourceFor("w", "r");
    // One millisecond inside the refresh margin: the old token still works,
    // but a job starting now could outlive it — re-mint.
    clock.now = HOUR_MS - TOKEN_REFRESH_MARGIN_MS + 1;
    const second = await sourceFor("w", "r");

    expect(second).not.toBe(first);
    expect(callCount()).toBe(2);
  });

  test("keys are per workspace:repository", async () => {
    const clock = { now: 0 };
    const { build, callCount } = makeBuild(clock);
    const sourceFor = createExpiringSourceCache(build, () => clock.now);

    await sourceFor("w", "r1");
    await sourceFor("w", "r2");

    expect(callCount()).toBe(2);
  });

  test("a rejected build is evicted instead of poisoning the repository", async () => {
    const clock = { now: 0 };
    let calls = 0;
    const sourceFor = createExpiringSourceCache(
      () => {
        calls += 1;
        if (calls === 1) {
          return Promise.reject(new Error("installation token minting failed"));
        }
        return Promise.resolve({
          expiresAt: new Date(clock.now + HOUR_MS).toISOString(),
          source: { id: "recovered" },
        });
      },
      () => clock.now,
    );

    // The failure must still reach the caller — the job has to fail into the
    // queue's retry path, not be swallowed.
    await expect(sourceFor("w", "r")).rejects.toThrow(
      "installation token minting failed",
    );
    // …but the next job rebuilds instead of replaying the cached rejection.
    await expect(sourceFor("w", "r")).resolves.toEqual({ id: "recovered" });
    expect(calls).toBe(2);
  });

  test("concurrent callers share the in-flight build", async () => {
    const clock = { now: 0 };
    let calls = 0;
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const sourceFor = createExpiringSourceCache(
      async () => {
        calls += 1;
        await gate;
        return {
          expiresAt: new Date(clock.now + HOUR_MS).toISOString(),
          source: { id: "shared" },
        };
      },
      () => clock.now,
    );

    const first = sourceFor("w", "r");
    const second = sourceFor("w", "r");
    release?.();

    expect(await first).toBe(await second);
    expect(calls).toBe(1);
  });

  test("an unparseable expiry falls back to a bounded TTL, not forever", async () => {
    const clock = { now: 0 };
    let calls = 0;
    const sourceFor = createExpiringSourceCache(
      () => {
        calls += 1;
        return Promise.resolve({
          expiresAt: "not-a-date",
          source: { id: `build-${calls}` },
        });
      },
      () => clock.now,
    );

    await sourceFor("w", "r");
    clock.now += 2 * HOUR_MS;
    await sourceFor("w", "r");

    expect(calls).toBe(2);
  });
});

describe("readTransientSource (404-only tolerance)", () => {
  function sourceWithFetch(fetchImplementation: typeof fetch) {
    return new GitHubRepositorySource(
      "owner",
      "repo",
      "token",
      fetchImplementation,
    );
  }

  test("returns the decoded body on success", async () => {
    const source = sourceWithFetch(
      async () => new Response(Buffer.from("body-bytes"), { status: 200 }),
    );
    await expect(readTransientSource(source, "README.md", "sha")).resolves.toBe(
      "body-bytes",
    );
  });

  test("a 404 is a vanished file — a smaller repository, null", async () => {
    const source = sourceWithFetch(
      async () => new Response(null, { status: 404 }),
    );
    await expect(
      readTransientSource(source, "gone.md", "sha"),
    ).resolves.toBeNull();
  });

  test.each([401, 403, 429, 500])(
    "a %i must fail the job, never read as a deletion",
    async (status) => {
      const source = sourceWithFetch(
        async () => new Response(null, { status }),
      );
      await expect(
        readTransientSource(source, "still-there.md", "sha"),
      ).rejects.toThrow(`GitHub repository request failed: ${status}`);
    },
  );

  test("the propagated error keeps its HTTP status for callers upstream", async () => {
    const source = sourceWithFetch(
      async () => new Response(null, { status: 401 }),
    );
    const failure = await readTransientSource(source, "f.md", "sha").catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(GitHubRequestError);
    expect((failure as GitHubRequestError).status).toBe(401);
  });
});
