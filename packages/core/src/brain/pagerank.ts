/**
 * Personalized PageRank (Phase 3 Wave B todo 5).
 *
 * The one retrieval algorithm three independent lines converged on — Aider's
 * repo map, HippoRAG's seeded retrieval, RepoHyper's expansion
 * (RESEARCH_KG_FUSION §3): seed nodes get restart mass, importance diffuses
 * over the undirected graph, one pass replaces an agent's multi-hop
 * exploration. Deterministic: plain power iteration, no randomness.
 *
 * Defaults follow Graft's shipped values (α=0.25, 25 iterations); results are
 * max-normalized so the top node is 1 and scores compose with other signals.
 */

export interface PageRankEdge {
  readonly source: string;
  readonly target: string;
}

export interface PageRankInput {
  /** Restart probability. */
  readonly alpha?: number;
  readonly edges: readonly PageRankEdge[];
  readonly iterations?: number;
  readonly nodes: readonly string[];
  /** Restart mass concentrates here; empty or absent → uniform PageRank. */
  readonly seeds?: readonly string[];
}

export const PAGERANK_ALPHA = 0.25;
export const PAGERANK_ITERATIONS = 25;

export function personalizedPageRank(
  input: PageRankInput,
): Map<string, number> {
  const alpha = input.alpha ?? PAGERANK_ALPHA;
  const iterations = input.iterations ?? PAGERANK_ITERATIONS;
  const index = new Map(input.nodes.map((node, at) => [node, at]));
  const size = index.size;
  if (size === 0) return new Map();

  // Undirected adjacency over known nodes only.
  const neighbors: number[][] = Array.from({ length: size }, () => []);
  for (const edge of input.edges) {
    const source = index.get(edge.source);
    const target = index.get(edge.target);
    if (source === undefined || target === undefined || source === target)
      continue;
    neighbors[source]?.push(target);
    neighbors[target]?.push(source);
  }

  const restart = new Float64Array(size);
  const seedIndices = (input.seeds ?? [])
    .map((seed) => index.get(seed))
    .filter((at): at is number => at !== undefined);
  if (seedIndices.length > 0) {
    for (const at of seedIndices)
      restart[at] = (restart[at] ?? 0) + 1 / seedIndices.length;
  } else {
    restart.fill(1 / size);
  }

  let rank = Float64Array.from(restart);
  for (let step = 0; step < iterations; step += 1) {
    const next = new Float64Array(size);
    let danglingMass = 0;
    for (let at = 0; at < size; at += 1) {
      const out = neighbors[at] ?? [];
      const mass = rank[at] ?? 0;
      if (out.length === 0) {
        danglingMass += mass;
        continue;
      }
      const share = mass / out.length;
      for (const to of out) {
        next[to] = (next[to] ?? 0) + share;
      }
    }
    for (let at = 0; at < size; at += 1) {
      // Dangling mass restarts too — nothing leaks out of the walk.
      next[at] =
        alpha * (restart[at] ?? 0) +
        (1 - alpha) * ((next[at] ?? 0) + danglingMass * (restart[at] ?? 0));
    }
    rank = next;
  }

  let max = 0;
  for (let at = 0; at < size; at += 1) {
    if ((rank[at] ?? 0) > max) max = rank[at] ?? 0;
  }
  const result = new Map<string, number>();
  for (const [node, at] of index) {
    result.set(node, max > 0 ? (rank[at] ?? 0) / max : 0);
  }
  return result;
}
