/**
 * First-scan wall-time bench (perf research MT-3).
 *
 * ## What this measures, and what it does not
 *
 * A first scan of a real repository is **network bound**: every changed blob
 * is one round trip to the repository host, and on a first scan every file is
 * changed. Measuring the real thing needs GitHub App credentials and a real
 * repository, so it is not something this script can honestly do.
 *
 * What it can do is measure the thing the change is actually about — whether
 * those round trips overlap. The source here is a fake whose `fetchContent`
 * sleeps for a **stated, simulated** per-request latency. So:
 *
 *   · the latency figure is an assumption, printed with every result, not a
 *     measurement of GitHub;
 *   · the wall times are real measurements of this scanner under that
 *     assumption;
 *   · the `latency=0` row is the honest check that the restructure did not
 *     make the CPU-only path slower.
 *
 * The bench also asserts that every concurrency setting produced a
 * byte-identical scan plan, so a number can never come from a scan that
 * quietly did something different.
 *
 * Usage:
 *   node --import tsx scripts/bench-scan-fetch.ts [--files 600] [--latency 5]
 */

import os from "node:os";
import { setTimeout as sleep } from "node:timers/promises";

import {
  scanRepository,
  type RepositoryScanPlan,
  type RepositorySource,
  type RepositoryTree,
  type RepositoryTreeEntry,
} from "../packages/core/src/index";

const COMMIT_SHA = "a".repeat(40);
const WIDTHS = [1, 2, 4, 8, 16] as const;

function fixtureTree(fileCount: number): RepositoryTree {
  const entries: RepositoryTreeEntry[] = Array.from(
    { length: fileCount },
    (_, index) => ({
      mode: "100644",
      path:
        index % 4 === 0
          ? `docs/adr/ADR-${String(index).padStart(4, "0")}.md`
          : index % 4 === 1
            ? `spec/part-${index}.md`
            : index % 4 === 2
              ? `src/module-${index}.ts`
              : `src/py-${index}.py`,
      sha: index.toString(16).padStart(40, "0"),
      size: 400,
      type: "blob",
    }),
  );
  return { entries, treeSha: "d".repeat(40), truncated: false };
}

function bodyFor(path: string): Uint8Array {
  const key = path.replace(/\W/g, "_");
  const text = path.endsWith(".ts")
    ? `export function handler_${key}(input: string): string {\n  // WHY: gives the symbol extractor something real to parse\n  return input.trim();\n}\n\nexport const CONSTANT_${key} = 42;\n`
    : path.endsWith(".py")
      ? `def handler_${key}(value):\n    """Docstring."""\n    return value\n`
      : `# ${path}\n\n## Context\n\nBody paragraph for ${path}.\n\n## Decision\n\nAnother paragraph.\n`;
  return new TextEncoder().encode(text);
}

function latentSource(
  tree: RepositoryTree,
  latencyMs: number,
): RepositorySource {
  return {
    fetchContent: async (path) => {
      if (latencyMs > 0) await sleep(latencyMs);
      else await Promise.resolve();
      return bodyFor(path);
    },
    listTree: async () => tree,
  };
}

/** A stable projection of a plan, for proving every run produced the same one. */
function planFingerprint(plan: RepositoryScanPlan): string {
  return JSON.stringify({
    artifacts: plan.artifacts.map((artifact) => [
      artifact.path,
      artifact.digest,
      artifact.classification,
      artifact.exportedSymbols.map(({ name }) => name),
    ]),
    codeLinks: plan.codeLinks.length,
    removedPaths: plan.removedPaths,
    skipped: plan.skipped,
    touchedRows: plan.touchedRows,
    unchangedPaths: plan.unchangedPaths,
  });
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const flag = (name: string, fallback: number): number => {
    const index = argv.indexOf(`--${name}`);
    if (index < 0) return fallback;
    const value = Number(argv[index + 1]);
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`--${name} must be a non-negative number`);
    }
    return value;
  };
  const files = flag("files", 600);
  const latency = flag("latency", 5);

  const cpu = os.cpus()[0]?.model ?? "unknown";
  console.log(
    `[host] ${cpu.trim()} · ${os.cpus().length} threads · node ${process.version}` +
      ` · ${os.platform()} ${os.release()}`,
  );
  console.log(
    `[bench] files=${files} simulated per-request latency=${latency}ms` +
      " (an assumption, not a measurement of GitHub)",
  );

  const tree = fixtureTree(files);
  const fingerprints = new Set<string>();

  for (const simulated of [latency, 0]) {
    for (const width of WIDTHS) {
      const start = performance.now();
      const plan = await scanRepository({
        commitSha: COMMIT_SHA,
        fetchConcurrency: width,
        source: latentSource(tree, simulated),
      });
      const elapsed = performance.now() - start;
      fingerprints.add(planFingerprint(plan));
      console.log(
        `[scan] latency=${String(simulated).padStart(2)}ms` +
          ` concurrency=${String(width).padStart(2)}` +
          ` wall=${elapsed.toFixed(1).padStart(9)}ms` +
          ` artifacts=${plan.artifacts.length}`,
      );
    }
  }

  if (fingerprints.size !== 1) {
    throw new Error(
      `${fingerprints.size} distinct scan plans across concurrency settings — ` +
        "the numbers above would be comparing different work",
    );
  }
  console.log("[scan] every run produced an identical plan");
}

await main();
