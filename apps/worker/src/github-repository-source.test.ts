import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_SECONDARY_WAIT_MS,
  GitHubRepositorySource,
  GitHubRequestError,
  MAX_INLINE_WAIT_MS,
  MAX_JITTER_MS,
  MAX_THROTTLE_PAUSES,
  classifyGitHubRefusal,
} from "./github-repository-source";

/**
 * GitHub refusals under queued reads (PR #8 follow-up, 2026-09-12).
 *
 * Production: a backfill's scan and analyze both ended on 403 within
 * seconds, three attempts each, while one fresh request to the same path
 * answered 200. The source threw on the first non-2xx with the status alone,
 * the scan kept sending the rest of its 1,170 body reads into the same
 * refusal, and the queue retried two and four seconds later. These cases pin
 * the three things that change: the refusal is classified from its headers,
 * a `retry-after` is waited out inside the job, and every request on the
 * source shares that one pause.
 */

const T0 = 1_757_678_400_000; // 2026-09-12T12:00:00Z
const SHA = "a".repeat(40);
const CONTENTS = "/repos/owner/repo/contents/README.md?ref=" + SHA;

/** A secondary-limit refusal exactly as GitHub shapes it. */
function secondaryLimit(retryAfterSeconds = 60): Response {
  return Response.json(
    {
      documentation_url: "https://docs.github.com/rest/overview/rate-limits",
      message:
        "You have exceeded a secondary rate limit. Please wait a few minutes before you try again.",
    },
    {
      headers: {
        "retry-after": String(retryAfterSeconds),
        "x-ratelimit-limit": "5000",
        "x-ratelimit-remaining": "4321",
        "x-ratelimit-reset": String(Math.floor(T0 / 1000) + 1700),
        "x-ratelimit-resource": "core",
      },
      status: 403,
    },
  );
}

/** A primary-limit refusal: the hour's budget is spent, reset later. */
function primaryLimit(resetInSeconds: number): Response {
  return Response.json(
    {
      documentation_url: "https://docs.github.com/rest/overview/rate-limits",
      message: "API rate limit exceeded for installation ID 154681535.",
    },
    {
      headers: {
        "x-ratelimit-limit": "5000",
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": String(Math.floor(T0 / 1000) + resetInSeconds),
        "x-ratelimit-resource": "core",
        "x-ratelimit-used": "5000",
      },
      status: 403,
    },
  );
}

const body = (text = "body") => new Response(text, { status: 200 });

interface Harness {
  readonly clock: { now: number };
  readonly fetchImplementation: ReturnType<typeof vi.fn<typeof fetch>>;
  /** The fake clock at each request, in order. */
  readonly fired: number[];
  readonly sleeps: number[];
  readonly source: GitHubRepositorySource;
}

/**
 * A source over a scripted fetch and a fake clock: `sleep` advances time
 * instead of waiting, so a minute-long pause costs nothing and its length is
 * observable.
 */
function harness(
  script: (url: string, index: number) => Response,
  random = () => 0,
): Harness {
  const clock = { now: T0 };
  const fired: number[] = [];
  const sleeps: number[] = [];
  const fetchImplementation = vi.fn<typeof fetch>(async (input) => {
    fired.push(clock.now);
    return script(String(input), fired.length - 1);
  });
  const source = new GitHubRepositorySource(
    "owner",
    "repo",
    "installation-token",
    fetchImplementation,
    {
      now: () => clock.now,
      random,
      sleep: async (ms) => {
        sleeps.push(ms);
        clock.now += ms;
      },
    },
  );
  return { clock, fetchImplementation, fired, sleeps, source };
}

describe("GitHub refusal classification", () => {
  it("reads a spent hourly budget as the primary limit, retrying at the reset", async () => {
    const error = await classifyGitHubRefusal(primaryLimit(1800), CONTENTS, T0);

    expect(error).toBeInstanceOf(GitHubRequestError);
    expect(error.kind).toBe("primary-rate-limit");
    expect(error.status).toBe(403);
    expect(error.retryAt).toBe(T0 + 1_800_000);
    expect(error.rateLimit).toEqual({
      limit: 5000,
      remaining: 0,
      reset: Math.floor(T0 / 1000) + 1800,
      resource: "core",
    });
    expect(error.message).toBe(
      `GitHub repository request failed: 403 primary-rate-limit; retry after 1800s; rate limit 0/5000 core, resets in 1800s (${CONTENTS})`,
    );
  });

  it("reads a retry-after as the secondary limit and says how long", async () => {
    const error = await classifyGitHubRefusal(secondaryLimit(60), CONTENTS, T0);

    expect(error.kind).toBe("secondary-rate-limit");
    expect(error.retryAt).toBe(T0 + 60_000);
    expect(error.message).toContain(
      "403 secondary-rate-limit; retry after 60s; rate limit 4321/5000 core, resets in 1700s",
    );
  });

  it("never carries the body: the classification is a word, the sentence is dropped", async () => {
    const error = await classifyGitHubRefusal(secondaryLimit(), CONTENTS, T0);

    expect(error.message).not.toMatch(/exceeded|Please wait|installation ID/);
    expect(JSON.stringify(error)).not.toMatch(/exceeded|Please wait/);
  });

  it("falls back to GitHub's minute when a secondary limit comes without a header", async () => {
    const response = Response.json(
      { message: "You have exceeded a secondary rate limit." },
      { status: 403 },
    );
    const error = await classifyGitHubRefusal(response, CONTENTS, T0);

    expect(error.kind).toBe("secondary-rate-limit");
    expect(error.retryAt).toBe(T0 + DEFAULT_SECONDARY_WAIT_MS);
    expect(error.rateLimit).toBeNull();
  });

  it("accepts an HTTP-date retry-after", async () => {
    const response = new Response(null, {
      headers: { "retry-after": new Date(T0 + 30_000).toUTCString() },
      status: 429,
    });
    const error = await classifyGitHubRefusal(response, CONTENTS, T0);

    expect(error.kind).toBe("secondary-rate-limit");
    expect(error.retryAt).toBe(T0 + 30_000);
  });

  it("a 429 with no hint is rate-limited with no time to wait for", async () => {
    const error = await classifyGitHubRefusal(
      new Response(null, { status: 429 }),
      CONTENTS,
      T0,
    );

    expect(error.kind).toBe("rate-limited");
    expect(error.retryAt).toBeNull();
    expect(error.message).toBe(
      `GitHub repository request failed: 429 rate-limited (${CONTENTS})`,
    );
  });

  it("a 403 with no hint is a refusal that waiting will not change", async () => {
    const error = await classifyGitHubRefusal(
      Response.json(
        { message: "Resource not accessible by integration" },
        { status: 403 },
      ),
      CONTENTS,
      T0,
    );

    expect(error.kind).toBe("forbidden");
    expect(error.retryAt).toBeNull();
    expect(error.message).toBe(
      `GitHub repository request failed: 403 forbidden (${CONTENTS})`,
    );
  });

  it("keeps the plain shape for every other status, so a 404 still reads as a 404", async () => {
    const error = await classifyGitHubRefusal(
      new Response(null, { status: 404 }),
      CONTENTS,
      T0,
    );

    expect(error.kind).toBe("other");
    expect(error.status).toBe(404);
    expect(error.message).toBe(
      `GitHub repository request failed: 404 (${CONTENTS})`,
    );
  });
});

describe("GitHubRepositorySource under a rate limit", () => {
  it("waits out retry-after and repeats the request instead of failing the job", async () => {
    const { fetchImplementation, fired, sleeps, source } = harness(
      (_, index) => (index === 0 ? secondaryLimit(60) : body()),
    );

    const content = await source.fetchContent("README.md", SHA);

    expect(new TextDecoder().decode(content)).toBe("body");
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([60_000]);
    expect(fired).toEqual([T0, T0 + 60_000]);
  });

  it("adds bounded jitter to the pause", async () => {
    const { sleeps, source } = harness(
      (_, index) => (index === 0 ? secondaryLimit(60) : body()),
      () => 1,
    );

    await source.fetchContent("README.md", SHA);

    // A tenth of the hint, capped: 60s → 5s at most.
    expect(sleeps).toEqual([60_000 + Math.min(MAX_JITTER_MS, 6_000)]);
  });

  it("a refusal with nothing to wait for is thrown at once, with no pause", async () => {
    const { fetchImplementation, sleeps, source } = harness(() =>
      Response.json(
        { message: "Resource not accessible by integration" },
        { status: 403 },
      ),
    );

    await expect(source.fetchContent("README.md", SHA)).rejects.toMatchObject({
      kind: "forbidden",
      retryAt: null,
      status: 403,
    });
    expect(sleeps).toEqual([]);
    // The gate did not close: the next request goes out.
    await expect(source.fetchContent("README.md", SHA)).rejects.toThrow(
      "403 forbidden",
    );
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it("a reset beyond the inline bound is not waited for: the error names the time and later requests fail without a network call", async () => {
    const { fetchImplementation, sleeps, source } = harness(() =>
      primaryLimit(1800),
    );

    const first = await source
      .fetchContent("README.md", SHA)
      .catch((error: unknown) => error);
    expect(first).toBeInstanceOf(GitHubRequestError);
    expect((first as GitHubRequestError).kind).toBe("primary-rate-limit");
    expect((first as GitHubRequestError).retryAt).toBe(T0 + 1_800_000);
    expect(sleeps).toEqual([]);
    expect(fetchImplementation).toHaveBeenCalledTimes(1);

    // The 969 body reads a scan would still issue after the first refusal
    // now stop at the gate instead of reaching GitHub.
    const second = await source
      .fetchContent("src/index.ts", SHA)
      .catch((error: unknown) => error);
    expect(second).toBe(first);
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("concurrent readers share one pause rather than each opening their own", async () => {
    const { fetchImplementation, fired, sleeps, source } = harness(
      (_, index) => (index < 8 ? secondaryLimit(60) : body()),
    );

    const reads = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        source.fetchContent(`file-${index}.md`, SHA),
      ),
    );

    expect(reads).toHaveLength(8);
    expect(fetchImplementation).toHaveBeenCalledTimes(16);
    expect(sleeps).toEqual([60_000]);
    // Eight sent before the limit, none during the minute, eight after it.
    expect(fired.filter((at) => at === T0)).toHaveLength(8);
    expect(fired.filter((at) => at > T0 && at < T0 + 60_000)).toHaveLength(0);
    expect(fired.filter((at) => at === T0 + 60_000)).toHaveLength(8);
  });

  it("stops waiting after the bounded run of pauses, then fails fast until the pause is over", async () => {
    let refuse = true;
    const { clock, fetchImplementation, sleeps, source } = harness(() =>
      refuse ? secondaryLimit(60) : body(),
    );

    const failure = await source
      .fetchContent("README.md", SHA)
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(GitHubRequestError);
    expect((failure as GitHubRequestError).kind).toBe("secondary-rate-limit");
    expect(sleeps).toEqual(Array(MAX_THROTTLE_PAUSES).fill(60_000));
    expect(fetchImplementation).toHaveBeenCalledTimes(MAX_THROTTLE_PAUSES + 1);
    expect(MAX_THROTTLE_PAUSES * 60_000).toBeLessThanOrEqual(
      MAX_THROTTLE_PAUSES * MAX_INLINE_WAIT_MS,
    );

    // Tripped: the next request does not reach GitHub while the pause holds.
    await expect(source.fetchContent("other.md", SHA)).rejects.toBe(failure);
    expect(fetchImplementation).toHaveBeenCalledTimes(MAX_THROTTLE_PAUSES + 1);

    // Once the pause has passed, the source tries again from a clean count.
    refuse = false;
    clock.now += 60_000;
    await expect(source.fetchContent("other.md", SHA)).resolves.toBeDefined();
    expect(fetchImplementation).toHaveBeenCalledTimes(MAX_THROTTLE_PAUSES + 2);
    expect(sleeps).toHaveLength(MAX_THROTTLE_PAUSES);
  });

  it("a successful answer resets the run, so an occasionally throttled scan completes", async () => {
    const { fetchImplementation, sleeps, source } = harness((_, index) =>
      index % 2 === 0 ? secondaryLimit(60) : body(),
    );

    for (let read = 0; read < MAX_THROTTLE_PAUSES + 2; read += 1) {
      await source.fetchContent(`file-${read}.md`, SHA);
    }

    expect(sleeps).toHaveLength(MAX_THROTTLE_PAUSES + 2);
    expect(fetchImplementation).toHaveBeenCalledTimes(
      2 * (MAX_THROTTLE_PAUSES + 2),
    );
  });

  it("the tree walk goes through the same gate", async () => {
    const tree = Response.json({
      sha: "d".repeat(40),
      tree: [
        {
          mode: "100644",
          path: "README.md",
          sha: "1".repeat(40),
          size: 4,
          type: "blob",
        },
      ],
      truncated: false,
    });
    const { fetchImplementation, sleeps, source } = harness((_, index) =>
      index === 0 ? secondaryLimit(45) : tree,
    );

    const listed = await source.listTree(SHA);

    expect(listed.entries.map(({ path }) => path)).toEqual(["README.md"]);
    expect(sleeps).toEqual([45_000]);
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });
});
