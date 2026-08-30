/**
 * Expiry-aware cache for per-repository sources (perf research MT-1).
 *
 * The worker mints a short-lived (~1h) GitHub installation token per
 * repository and reuses it across jobs. The previous cache held the promise
 * forever, which produced two production failure modes on a long-lived
 * worker:
 *
 *  - after the token expired, every fetch returned 401 — and the analyze/
 *    enrich readSource treated any error as "file deleted", so
 *    reconcileFindings silently auto-resolved real findings;
 *  - a rejected build stayed cached, poisoning that repository until restart.
 *
 * This cache re-mints a source ahead of its expiry, evicts rejected builds so
 * the next job retries, and pairs with `readTransientSource`, which lets only
 * a real 404 read as "smaller repository".
 */

import { GitHubRequestError } from "./github-repository-source";

import type { RepositorySource } from "@arr/core";

/** Re-mint this long before expiry so a token never dies mid-job. */
export const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

/** Trust an unparseable expiry for this long only (GitHub's default is 1h). */
const FALLBACK_TTL_MS = 50 * 60 * 1000;

export interface BuiltSource<Source> {
  /** ISO timestamp from the GitHub installation-token response. */
  readonly expiresAt: string;
  readonly source: Source;
}

interface CacheEntry<Source> {
  /** Epoch ms; Infinity while the build is still in flight. */
  expiresAtMs: number;
  promise: Promise<Source>;
}

export function createExpiringSourceCache<Source>(
  build: (
    workspaceId: string,
    repositoryId: string,
  ) => Promise<BuiltSource<Source>>,
  now: () => number = Date.now,
): (workspaceId: string, repositoryId: string) => Promise<Source> {
  const entries = new Map<string, CacheEntry<Source>>();

  return (workspaceId, repositoryId) => {
    const key = `${workspaceId}:${repositoryId}`;
    const existing = entries.get(key);
    if (existing && now() < existing.expiresAtMs - TOKEN_REFRESH_MARGIN_MS) {
      return existing.promise;
    }

    const entry: CacheEntry<Source> = {
      expiresAtMs: Number.POSITIVE_INFINITY,
      promise: undefined as unknown as Promise<Source>,
    };
    entry.promise = build(workspaceId, repositoryId).then(
      ({ expiresAt, source }) => {
        const parsed = Date.parse(expiresAt);
        entry.expiresAtMs = Number.isFinite(parsed)
          ? parsed
          : now() + FALLBACK_TTL_MS;
        return source;
      },
    );
    // A failed build must not poison the key: evict so the next job rebuilds.
    // The catch branch is separate from `entry.promise`, so callers still see
    // the rejection and the job fails into the queue's retry path.
    entry.promise.catch(() => {
      if (entries.get(key) === entry) entries.delete(key);
    });
    entries.set(key, entry);
    return entry.promise;
  };
}

/**
 * Fetch one file body for analysis, treating ONLY a 404 as "the file vanished
 * between scan and analysis" (a smaller repository, `null`). Every other
 * failure — 401/403 token death, 429 throttling, network errors — propagates,
 * so the job fails and the queue's lease retries it instead of the findings
 * reconciler mistaking an outage for deletions.
 */
export async function readTransientSource(
  source: RepositorySource,
  path: string,
  commitSha: string,
): Promise<string | null> {
  try {
    const bytes = await source.fetchContent(path, commitSha);
    return Buffer.from(bytes).toString("utf8");
  } catch (error) {
    if (error instanceof GitHubRequestError && error.status === 404) {
      return null;
    }
    throw error;
  }
}
