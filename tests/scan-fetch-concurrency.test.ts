/**
 * Bounded-concurrency scan content fetch (perf research MT-3).
 *
 * The point of the change is throughput; the point of these tests is that
 * throughput bought nothing at the expense of the plan. A scan plan is the
 * repository's persisted truth, so it must not depend on how many blob
 * requests happened to be in flight.
 */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_SCAN_FETCH_CONCURRENCY,
  MAX_CONCURRENCY,
  clampConcurrency,
  mapWithConcurrency,
  scanRepository,
  type PreviousScannedArtifact,
  type RepositorySource,
  type RepositoryTree,
  type RepositoryTreeEntry,
} from "../packages/core/src/index";

const COMMIT_SHA = "a".repeat(40);

/** A tree of scannable paths across every classification the scanner knows. */
function fixtureTree(fileCount: number): RepositoryTree {
  const entries: RepositoryTreeEntry[] = Array.from(
    { length: fileCount },
    (_, index) => ({
      mode: "100644",
      path:
        index % 5 === 0
          ? `docs/adr/ADR-${String(index).padStart(3, "0")}.md`
          : index % 5 === 1
            ? `spec/part-${index}.md`
            : index % 5 === 2
              ? `src/module-${index}.ts`
              : index % 5 === 3
                ? `AGENTS.md`.replace("AGENTS", `nested/${index}/AGENTS`)
                : `src/py-${index}.py`,
      sha: index.toString(16).padStart(40, "0"),
      size: 200,
      type: "blob" as const,
    }),
  );
  // Two entries the scanner resolves without any fetch at all, so the slot
  // ordering across resolved and fetched entries is exercised.
  entries.push(
    { mode: "160000", path: "vendor/sub", sha: "b".repeat(40), type: "commit" },
    { mode: "120000", path: "docs/link.md", sha: "c".repeat(40), type: "blob" },
  );
  return { entries, treeSha: "d".repeat(40), truncated: false };
}

function bodyFor(path: string): Uint8Array {
  const text = path.endsWith(".ts")
    ? `export const value_${path.replace(/\W/g, "_")} = 1;\n// WHY: keeps the symbol table non-empty\n`
    : path.endsWith(".py")
      ? `def handler_${path.replace(/\W/g, "_")}():\n    return 1\n`
      : `# ${path}\n\nBody for ${path}.\n`;
  return new TextEncoder().encode(text);
}

interface RecordingSource extends RepositorySource {
  readonly fetches: string[];
  readonly peakInFlight: () => number;
}

/** A source that records fetch order and how many calls overlapped. */
function recordingSource(
  tree: RepositoryTree,
  options: { delayMs?: number; failOn?: readonly string[] } = {},
): RecordingSource {
  const fetches: string[] = [];
  let inFlight = 0;
  let peak = 0;
  return {
    fetches,
    peakInFlight: () => peak,
    async fetchContent(path) {
      fetches.push(path);
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      try {
        if (options.delayMs) {
          await new Promise((resolve) => setTimeout(resolve, options.delayMs));
        } else {
          await Promise.resolve();
        }
        if (options.failOn?.includes(path)) {
          throw new Error(`boom: ${path}`);
        }
        return bodyFor(path);
      } finally {
        inFlight -= 1;
      }
    },
    listTree: async () => tree,
  };
}

describe("scan content fetch concurrency (perf research MT-3)", () => {
  it("produces an identical plan at every concurrency setting", async () => {
    const tree = fixtureTree(40);
    const plans = [];
    for (const fetchConcurrency of [1, 2, 8, 32]) {
      plans.push(
        await scanRepository({
          commitSha: COMMIT_SHA,
          fetchConcurrency,
          source: recordingSource(tree),
        }),
      );
    }

    const [serial] = plans;
    expect(serial?.artifacts.length).toBeGreaterThan(30);
    for (const plan of plans.slice(1)) {
      expect(plan).toEqual(serial);
    }
  });

  it("keeps the plan in path order however the fetches interleave", async () => {
    const tree = fixtureTree(30);
    // Later paths answer sooner, so completion order is not path order.
    const source: RepositorySource = {
      fetchContent: async (path) => {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.max(0, 20 - path.length)),
        );
        return bodyFor(path);
      },
      listTree: async () => tree,
    };
    const plan = await scanRepository({
      commitSha: COMMIT_SHA,
      fetchConcurrency: 16,
      source,
    });

    expect(plan.artifacts.map(({ path }) => path)).toEqual(
      [...plan.artifacts.map(({ path }) => path)].sort((left, right) =>
        left.localeCompare(right),
      ),
    );
    expect(plan.skipped.map(({ path }) => path)).toEqual([
      "docs/link.md",
      "vendor/sub",
    ]);
  });

  it("actually overlaps requests, and does not when asked not to", async () => {
    const tree = fixtureTree(24);
    const parallel = recordingSource(tree, { delayMs: 5 });
    await scanRepository({
      commitSha: COMMIT_SHA,
      fetchConcurrency: 8,
      source: parallel,
    });
    const serial = recordingSource(tree, { delayMs: 1 });
    await scanRepository({
      commitSha: COMMIT_SHA,
      fetchConcurrency: 1,
      source: serial,
    });

    expect(parallel.peakInFlight()).toBe(8);
    expect(serial.peakInFlight()).toBe(1);
  });

  it("fetches nothing for entries the blob sha already resolved", async () => {
    const tree = fixtureTree(20);
    const first = recordingSource(tree);
    const plan = await scanRepository({
      commitSha: COMMIT_SHA,
      source: first,
    });
    const second = recordingSource(tree);
    const again = await scanRepository({
      commitSha: "b".repeat(40),
      previousArtifacts: plan.artifacts.map(
        (artifact): PreviousScannedArtifact => ({
          classification: artifact.classification,
          digest: artifact.digest,
          exportedSymbols: artifact.exportedSymbols,
          kind: artifact.kind,
          path: artifact.path,
          sizeBytes: artifact.sizeBytes,
          sourceBlobSha: artifact.sourceBlobSha,
          sourceCommitSha: artifact.sourceCommitSha,
        }),
      ),
      previousCommitSha: COMMIT_SHA,
      source: second,
    });

    expect(first.fetches.length).toBe(plan.artifacts.length);
    expect(second.fetches).toEqual([]);
    expect(again.unchangedPaths).toEqual(
      [...plan.artifacts.map(({ path }) => path)].sort(),
    );
  });

  it("reports the first failure in path order, not the first to reject", async () => {
    const tree = fixtureTree(20);
    const paths = tree.entries
      .filter((entry) => entry.type === "blob" && entry.mode === "100644")
      .map(({ path }) => path)
      .sort((left, right) => left.localeCompare(right));
    const early = paths[1] as string;
    const late = paths[paths.length - 1] as string;
    const source: RepositorySource = {
      fetchContent: async (path) => {
        // The late path rejects immediately; the early one takes its time.
        if (path === late) throw new Error(`boom: ${late}`);
        if (path === early) {
          await new Promise((resolve) => setTimeout(resolve, 20));
          throw new Error(`boom: ${early}`);
        }
        return bodyFor(path);
      },
      listTree: async () => tree,
    };

    await expect(
      scanRepository({
        commitSha: COMMIT_SHA,
        fetchConcurrency: 8,
        source,
      }),
    ).rejects.toThrow(`boom: ${early}`);
  });
});

describe("mapWithConcurrency", () => {
  it("returns results in input order, not completion order", async () => {
    const order: number[] = [];
    const results = await mapWithConcurrency([5, 1, 4, 2], 4, async (item) => {
      await new Promise((resolve) => setTimeout(resolve, item));
      order.push(item);
      return item * 10;
    });

    expect(results).toEqual([50, 10, 40, 20]);
    expect(order).toEqual([1, 2, 4, 5]);
  });

  it("settles every task before throwing the earliest error", async () => {
    let settled = 0;
    await expect(
      mapWithConcurrency([0, 1, 2, 3], 4, async (item) => {
        await new Promise((resolve) => setTimeout(resolve, (3 - item) * 5));
        settled += 1;
        if (item === 1 || item === 3) throw new Error(`fail ${item}`);
        return item;
      }),
    ).rejects.toThrow("fail 1");

    expect(settled).toBe(4);
  });

  it("handles an empty list without spawning a worker", async () => {
    expect(await mapWithConcurrency([], 8, async () => 1)).toEqual([]);
  });

  it("clamps the width to a sane range", () => {
    expect(clampConcurrency(undefined, 8)).toBe(8);
    expect(clampConcurrency(0, 8)).toBe(8);
    expect(clampConcurrency(-3, 8)).toBe(8);
    expect(clampConcurrency(1.5, 8)).toBe(8);
    expect(clampConcurrency(4, 8)).toBe(4);
    expect(clampConcurrency(1_000, 8)).toBe(MAX_CONCURRENCY);
    expect(DEFAULT_SCAN_FETCH_CONCURRENCY).toBe(8);
  });
});
