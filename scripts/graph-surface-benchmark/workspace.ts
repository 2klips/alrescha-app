/**
 * Benchmark workspace builder (todo 15): the v3 corpus workspace augmented
 * with deterministically derived graph edges (markdown relative links →
 * `references`, TS/JS relative imports → `imports`) and the pre-registered
 * memory fixtures. Links that fail to resolve to a corpus path are dropped —
 * every edge ends at a real node.
 */

import {
  workspaceFromCorpus,
  type RepositoryCorpus,
} from "../databrain-benchmark/context";
import type {
  McpEdgeData,
  McpMemoryEntryData,
  McpWorkspaceData,
} from "../../packages/mcp/src/store";
import type { MemoryFixture } from "./manifest";

const MEMORY_FIXTURE_TIMESTAMP = "2026-08-25T00:00:00.000Z";

/** Resolve `./x` or `../x` against the directory of `fromPath`. */
function resolveRelative(fromPath: string, target: string): string | null {
  const base = fromPath.split("/").slice(0, -1);
  const segments = target.split("/");
  for (const segment of segments) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (base.length === 0) return null;
      base.pop();
      continue;
    }
    base.push(segment);
  }
  return base.join("/");
}

const IMPORT_PATTERN =
  /(?:import|export)\s[^'"]*?from\s*['"](\.{1,2}\/[^'"]+)['"]/g;
const MARKDOWN_LINK_PATTERN =
  /\]\((\.{0,2}[\w./-]+?\.(?:md|mdc))(?:#[^)]*)?\)/g;

export function deriveCorpusEdges(corpus: RepositoryCorpus): McpEdgeData[] {
  const pathToIndex = new Map(
    corpus.entries.map((entry, index) => [entry.path, index]),
  );
  const nodeId = (index: number): string =>
    `artifact-${index.toString().padStart(5, "0")}`;
  const resolveImport = (fromPath: string, target: string): number | null => {
    const resolved = resolveRelative(fromPath, target);
    if (resolved === null) return null;
    for (const candidate of [
      resolved,
      `${resolved}.ts`,
      `${resolved}.tsx`,
      `${resolved}/index.ts`,
    ]) {
      const index = pathToIndex.get(candidate);
      if (index !== undefined) return index;
    }
    return null;
  };

  const edges: McpEdgeData[] = [];
  const seen = new Set<string>();
  const push = (
    sourceIndex: number,
    targetIndex: number,
    relation: "imports" | "references",
  ): void => {
    if (sourceIndex === targetIndex) return;
    const key = `${sourceIndex} ${targetIndex} ${relation}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({
      id: `edge-${edges.length.toString().padStart(5, "0")}`,
      relation,
      sourceNodeId: nodeId(sourceIndex),
      targetNodeId: nodeId(targetIndex),
    });
  };

  for (const [index, entry] of corpus.entries.entries()) {
    if (/\.(ts|tsx)$/.test(entry.path)) {
      for (const match of entry.content.matchAll(IMPORT_PATTERN)) {
        const target = resolveImport(entry.path, match[1] ?? "");
        if (target !== null) push(index, target, "imports");
      }
      continue;
    }
    if (/\.(md|mdc)$/.test(entry.path)) {
      for (const match of entry.content.matchAll(MARKDOWN_LINK_PATTERN)) {
        const raw = match[1] ?? "";
        const resolved = raw.startsWith(".")
          ? resolveRelative(entry.path, raw)
          : raw;
        if (resolved === null) continue;
        const target = pathToIndex.get(resolved);
        if (target !== undefined) push(index, target, "references");
      }
    }
  }
  return edges;
}

export function memoryEntriesFromFixtures(
  fixtures: readonly MemoryFixture[],
  corpusKey: string,
): McpMemoryEntryData[] {
  return fixtures
    .filter((fixture) => fixture.corpus === corpusKey)
    .map((fixture, index) => ({
      anchorNodeId: null,
      anchorPath: fixture.sourcePaths[0] ?? null,
      entryKey: fixture.entryKey,
      id: `memory-${index.toString().padStart(3, "0")}`,
      name: fixture.name,
      text: fixture.text,
      updatedAt: MEMORY_FIXTURE_TIMESTAMP,
    }));
}

export function benchmarkWorkspace(input: {
  corpus: RepositoryCorpus;
  corpusKey: string;
  memoryFixtures: readonly MemoryFixture[];
}): McpWorkspaceData {
  const workspace = workspaceFromCorpus(input.corpus);
  const repository = workspace.repositories[0];
  if (!repository) throw new TypeError("Corpus workspace has no repository.");
  return {
    ...workspace,
    memoryEntries: memoryEntriesFromFixtures(
      input.memoryFixtures,
      input.corpusKey,
    ),
    repositories: [{ ...repository, edges: deriveCorpusEdges(input.corpus) }],
  };
}
