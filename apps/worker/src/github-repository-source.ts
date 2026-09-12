import {
  GITHUB_API_VERSION,
  type RepositorySource,
  type RepositoryTree,
  type RepositoryTreeEntry,
} from "@alrescha/core";

/**
 * What a GitHub refusal was, read from the response's safe metadata alone
 * (PR #8 follow-up, 2026-09-12).
 *
 * The production failure this exists for: queued scan and analyze jobs ended
 * on repeated 403s while a single fresh request to the same path answered
 * 200, and the error kept only the status — so nobody could say whether the
 * installation's hourly budget was spent, GitHub's secondary limit had
 * tripped, or the token was refused outright. Each of those wants a different
 * response, and GitHub says which one it is in headers and in one sentence of
 * the body.
 *
 * - `primary-rate-limit`: `x-ratelimit-remaining: 0`; retry at
 *   `x-ratelimit-reset` (up to an hour away).
 * - `secondary-rate-limit`: a `retry-after` header, or the body naming a
 *   secondary rate limit; retry after the header, else a minute.
 * - `rate-limited`: a 429 saying nothing more.
 * - `forbidden`: a 403 saying nothing more — a scope or access refusal that
 *   waiting will not change.
 * - `other`: every other status (401, 404, 5xx).
 */
export type GitHubRefusalKind =
  | "primary-rate-limit"
  | "secondary-rate-limit"
  | "rate-limited"
  | "forbidden"
  | "other";

/** The rate-limit headers GitHub sends with every REST response. */
export interface GitHubRateLimitSnapshot {
  readonly limit: number | null;
  readonly remaining: number | null;
  /** Epoch seconds, as `x-ratelimit-reset` reports it. */
  readonly reset: number | null;
  /** `core`, `search`, … — which budget the request drew from. */
  readonly resource: string | null;
}

export interface GitHubRequestErrorInput {
  readonly kind: GitHubRefusalKind;
  /** The clock the message's "retry after" is written against. */
  readonly now: number;
  readonly path: string;
  readonly rateLimit: GitHubRateLimitSnapshot | null;
  /** Epoch ms after which GitHub says the request may be repeated. */
  readonly retryAt: number | null;
  readonly status: number;
}

/**
 * A GitHub API failure that keeps the HTTP status, so callers can tell "this
 * file is gone" (404) apart from "this token is dead" (401/403) or "we are
 * being throttled" (429). Collapsing those into one opaque error is what let
 * an expired installation token read as "file deleted" and mass-resolve real
 * findings (perf research MT-1).
 *
 * It also keeps the refusal's kind, the time GitHub says to retry at, and
 * the rate-limit counters — header values, never the body — so a job's
 * `last_error` says which limit it hit and the worker can schedule the retry
 * for when the limit clears instead of the queue's fixed backoff.
 */
export class GitHubRequestError extends Error {
  readonly kind: GitHubRefusalKind;
  readonly path: string;
  readonly rateLimit: GitHubRateLimitSnapshot | null;
  readonly retryAt: number | null;
  readonly status: number;

  constructor(input: GitHubRequestErrorInput) {
    super(describeRefusal(input));
    this.name = "GitHubRequestError";
    this.kind = input.kind;
    this.path = input.path;
    this.rateLimit = input.rateLimit;
    this.retryAt = input.retryAt;
    this.status = input.status;
  }
}

function describeRefusal(input: GitHubRequestErrorInput): string {
  const parts = [
    `${input.status}${input.kind === "other" ? "" : ` ${input.kind}`}`,
  ];
  if (input.retryAt !== null) {
    const seconds = Math.max(0, Math.ceil((input.retryAt - input.now) / 1000));
    parts.push(`retry after ${seconds}s`);
  }
  const limit = input.rateLimit;
  if (limit && (limit.remaining !== null || limit.limit !== null)) {
    const budget = `${limit.remaining ?? "?"}/${limit.limit ?? "?"} ${limit.resource ?? "core"}`;
    const reset =
      limit.reset === null
        ? ""
        : `, resets in ${Math.max(0, limit.reset - Math.floor(input.now / 1000))}s`;
    parts.push(`rate limit ${budget}${reset}`);
  }
  return `GitHub repository request failed: ${parts.join("; ")} (${input.path})`;
}

function integerHeader(headers: Headers, name: string): number | null {
  const raw = headers.get(name);
  if (raw === null) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isSafeInteger(value) ? value : null;
}

function rateLimitSnapshot(headers: Headers): GitHubRateLimitSnapshot | null {
  const limit = integerHeader(headers, "x-ratelimit-limit");
  const remaining = integerHeader(headers, "x-ratelimit-remaining");
  const reset = integerHeader(headers, "x-ratelimit-reset");
  if (limit === null && remaining === null && reset === null) return null;
  return {
    limit,
    remaining,
    reset,
    resource: headers.get("x-ratelimit-resource"),
  };
}

/** `Retry-After` as ms from now. GitHub sends seconds; HTTP also allows a date. */
function retryAfterMs(headers: Headers, now: number): number | null {
  const raw = headers.get("retry-after");
  if (raw === null) return null;
  const seconds = Number.parseInt(raw, 10);
  if (Number.isSafeInteger(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.max(0, date - now) : null;
}

/**
 * Whether the refusal's body names a secondary rate limit — the one case
 * GitHub documents without a header. The body is read for this single
 * predicate and dropped: nothing of it is kept, logged, or put in a message.
 */
async function namesSecondaryRateLimit(response: Response): Promise<boolean> {
  try {
    const body: unknown = await response.json();
    return (
      typeof body === "object" &&
      body !== null &&
      "message" in body &&
      typeof body.message === "string" &&
      /secondary rate limit/i.test(body.message)
    );
  } catch {
    return false;
  }
}

/** GitHub's own guidance when a secondary limit comes without `retry-after`. */
export const DEFAULT_SECONDARY_WAIT_MS = 60_000;

/**
 * Read a non-2xx response into the error the job will carry. Only 403 and
 * 429 are candidates for a limit; the headers decide, and the body is
 * consulted for one documented sentence when they say nothing.
 */
export async function classifyGitHubRefusal(
  response: Response,
  path: string,
  now: number,
): Promise<GitHubRequestError> {
  const { status } = response;
  const rateLimit = rateLimitSnapshot(response.headers);
  const retryAfter = retryAfterMs(response.headers, now);
  let kind: GitHubRefusalKind = "other";
  let retryAt: number | null = null;

  if (status === 403 || status === 429) {
    if (rateLimit?.remaining === 0) {
      kind = "primary-rate-limit";
      retryAt =
        retryAfter !== null
          ? now + retryAfter
          : rateLimit.reset !== null
            ? rateLimit.reset * 1000
            : null;
    } else if (retryAfter !== null) {
      kind = "secondary-rate-limit";
      retryAt = now + retryAfter;
    } else if (await namesSecondaryRateLimit(response)) {
      kind = "secondary-rate-limit";
      retryAt = now + DEFAULT_SECONDARY_WAIT_MS;
    } else {
      kind = status === 429 ? "rate-limited" : "forbidden";
    }
  }

  return new GitHubRequestError({
    kind,
    now,
    path,
    rateLimit,
    retryAt,
    status,
  });
}

/**
 * The longest a request waits inside the job for a limit to clear. GitHub's
 * secondary `retry-after` is a minute; a primary reset can be an hour away,
 * and that one is handed to the queue (the worker defers the retry) rather
 * than held open here.
 */
export const MAX_INLINE_WAIT_MS = 90_000;

/**
 * How many pauses one uninterrupted run of throttled answers may take before
 * the source stops waiting and fails the job — bounded so a job never sits
 * behind an unlimited series of minute-long waits. Any successful response
 * starts the count over.
 */
export const MAX_THROTTLE_PAUSES = 3;

/** Jitter added to a pause so paused readers do not all resume in one burst. */
export const MAX_JITTER_MS = 5_000;

export interface GitHubSourceClock {
  readonly now?: () => number;
  readonly random?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One pause shared by every request on a source.
 *
 * A scan fetches eight bodies at a time and keeps going through the list
 * after one fails (`mapWithConcurrency` reports the first failure only at
 * the end), so a limit met on file 200 of 1,170 used to be followed by 970
 * more requests GitHub would refuse — on each of three attempts. The gate is
 * what those requests now wait on: the first throttled answer of a wave sets
 * the pause, the answers already in flight join it rather than extending it,
 * and nothing is sent until it passes. A pause longer than the inline bound,
 * or a fourth pause in a row, trips the gate: requests fail at once, without
 * a network call, until the pause is over.
 */
class ThrottleGate {
  /** Bumped by the first throttled answer of each wave, so its siblings share it. */
  private generation = 0;
  private pauses = 0;
  private pausedUntil = 0;
  private refusal: GitHubRequestError | null = null;
  private tripped = false;

  constructor(
    private readonly now: () => number,
    private readonly random: () => number,
    private readonly sleep: (ms: number) => Promise<void>,
  ) {}

  /** Wait for the gate to open; the ticket names the wave the caller joins. */
  async admit(): Promise<number> {
    for (;;) {
      const remaining = this.pausedUntil - this.now();
      if (remaining <= 0 || this.refusal === null) {
        if (this.tripped) {
          this.tripped = false;
          this.pauses = 0;
        }
        return this.generation;
      }
      if (this.tripped || remaining > MAX_INLINE_WAIT_MS) throw this.refusal;
      await this.sleep(remaining);
    }
  }

  succeeded(): void {
    this.pauses = 0;
  }

  /**
   * Record a throttled answer. `retry` means the caller may go through
   * `admit()` again and repeat the request; `throw` means it should not.
   */
  throttled(refusal: GitHubRequestError, ticket: number): "retry" | "throw" {
    if (refusal.retryAt === null) return "throw";
    const now = this.now();
    const hint = Math.max(0, refusal.retryAt - now);
    if (ticket === this.generation) {
      this.generation += 1;
      this.pauses += 1;
      const jitter = Math.floor(
        this.random() * Math.min(MAX_JITTER_MS, hint / 10),
      );
      this.pausedUntil = Math.max(this.pausedUntil, now + hint + jitter);
      this.refusal = refusal;
      if (hint > MAX_INLINE_WAIT_MS || this.pauses > MAX_THROTTLE_PAUSES) {
        this.tripped = true;
      }
    }
    return this.tripped || hint > MAX_INLINE_WAIT_MS ? "throw" : "retry";
  }
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown, label: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as JsonRecord;
}

function treeResponse(value: unknown): RepositoryTree {
  const response = record(value, "GitHub tree response");
  if (
    typeof response.sha !== "string" ||
    typeof response.truncated !== "boolean" ||
    !Array.isArray(response.tree)
  ) {
    throw new Error("GitHub tree response is malformed.");
  }

  const entries = response.tree.map((value, index): RepositoryTreeEntry => {
    const entry = record(value, `GitHub tree entry ${index}`);
    if (
      typeof entry.path !== "string" ||
      typeof entry.mode !== "string" ||
      typeof entry.sha !== "string" ||
      (entry.type !== "blob" &&
        entry.type !== "tree" &&
        entry.type !== "commit") ||
      (entry.size !== undefined && typeof entry.size !== "number")
    ) {
      throw new Error(`GitHub tree entry ${index} is malformed.`);
    }
    return {
      mode: entry.mode,
      path: entry.path,
      sha: entry.sha,
      ...(typeof entry.size === "number" ? { size: entry.size } : {}),
      type: entry.type,
    };
  });

  return { entries, treeSha: response.sha, truncated: response.truncated };
}

export class GitHubRepositorySource implements RepositorySource {
  private readonly gate: ThrottleGate;
  private readonly now: () => number;

  constructor(
    private readonly owner: string,
    private readonly repository: string,
    private readonly installationToken: string,
    private readonly fetchImplementation: typeof fetch = fetch,
    clock: GitHubSourceClock = {},
  ) {
    this.now = clock.now ?? Date.now;
    this.gate = new ThrottleGate(
      this.now,
      clock.random ?? Math.random,
      clock.sleep ?? defaultSleep,
    );
  }

  private async request(
    path: string,
    accept = "application/vnd.github+json",
  ): Promise<Response> {
    for (;;) {
      const ticket = await this.gate.admit();
      const response = await this.fetchImplementation(
        `https://api.github.com${path}`,
        {
          headers: {
            accept,
            authorization: `Bearer ${this.installationToken}`,
            "x-github-api-version": GITHUB_API_VERSION,
          },
        },
      );
      if (response.ok) {
        this.gate.succeeded();
        return response;
      }
      const refusal = await classifyGitHubRefusal(response, path, this.now());
      if (this.gate.throttled(refusal, ticket) === "throw") throw refusal;
    }
  }

  private treePath(sha: string, recursive: boolean): string {
    const owner = encodeURIComponent(this.owner);
    const repository = encodeURIComponent(this.repository);
    const suffix = recursive ? "?recursive=1" : "";
    return `/repos/${owner}/${repository}/git/trees/${encodeURIComponent(sha)}${suffix}`;
  }

  async listTree(commitSha: string): Promise<RepositoryTree> {
    const recursive = treeResponse(
      await (await this.request(this.treePath(commitSha, true))).json(),
    );
    if (!recursive.truncated) {
      return recursive;
    }

    const entries: RepositoryTreeEntry[] = [];
    const queue: Array<{ prefix: string; sha: string }> = [
      { prefix: "", sha: commitSha },
    ];
    let rootTreeSha = recursive.treeSha;

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;
      const subtree = treeResponse(
        await (await this.request(this.treePath(current.sha, false))).json(),
      );
      if (current.prefix === "") {
        rootTreeSha = subtree.treeSha;
      }
      for (const entry of subtree.entries) {
        const path = current.prefix
          ? `${current.prefix}/${entry.path}`
          : entry.path;
        if (entry.type === "tree") {
          queue.push({ prefix: path, sha: entry.sha });
        } else {
          entries.push({ ...entry, path });
        }
      }
      if (entries.length + queue.length > 100_000) {
        throw new Error(
          "Repository tree exceeds the 100,000-entry scan safety limit.",
        );
      }
    }

    return { entries, treeSha: rootTreeSha, truncated: false };
  }

  async fetchContent(path: string, commitSha: string): Promise<Uint8Array> {
    const owner = encodeURIComponent(this.owner);
    const repository = encodeURIComponent(this.repository);
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    const response = await this.request(
      `/repos/${owner}/${repository}/contents/${encodedPath}?ref=${encodeURIComponent(commitSha)}`,
      "application/vnd.github.raw+json",
    );
    return new Uint8Array(await response.arrayBuffer());
  }
}
