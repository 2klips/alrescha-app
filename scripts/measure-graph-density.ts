/**
 * Graph density measurement (Phase 4 Wave A todo 0).
 *
 * The galaxy work has a target — a repository this size should render roughly
 * this many nodes, this many edges, this average degree — and a target with no
 * instrument is a wish. This script is the instrument: it runs the real
 * scanner over a local directory and reports what the deterministic pass
 * actually produced, so every density figure in `spec/` can be replaced by a
 * measured one (ADR-012: no numbers without measurement).
 *
 * It reads the working tree, not the database, which is deliberate. The
 * scanner is the thing under test; a database read would measure whatever
 * happened to be persisted by whichever scan ran last.
 *
 * Two degree figures are printed on purpose. `imports`, `calls` and `tests`
 * can all connect the same pair of files, so counting edges overstates how
 * connected the picture looks; the distinct-pair figure is the one that
 * corresponds to what the force layout draws.
 *
 * Usage:
 *   node --import tsx scripts/measure-graph-density.ts [directory]
 *     [--mode full|incremental] [--out <path>] [--json] [--top 10]
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { createLocalRepositorySource } from "../packages/cli/src/local-source";
import {
  LINK_SCHEMA_VERSION,
  scanRepository,
  type LinkScope,
  type RepositoryScanPlan,
} from "../packages/core/src/index";

interface Options {
  readonly directory: string;
  readonly json: boolean;
  readonly mode: LinkScope;
  readonly out: string | null;
  readonly top: number;
}

function parseArguments(argv: readonly string[]): Options {
  let directory = ".";
  let json = false;
  let mode: LinkScope = "full";
  let out: string | null = null;
  let top = 10;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? "";
    if (argument === "--mode") {
      const value = argv[++index];
      mode = value === "incremental" ? "incremental" : "full";
    } else if (argument === "--out") {
      out = argv[++index] ?? null;
    } else if (argument === "--json") {
      json = true;
    } else if (argument === "--top") {
      top = Number.parseInt(argv[++index] ?? "10", 10) || 10;
    } else if (!argument.startsWith("--")) {
      directory = argument;
    }
  }
  return { directory, json, mode, out, top };
}

function tally<T extends string>(values: readonly T[]): ReadonlyMap<T, number> {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return new Map([...counts].sort((left, right) => right[1] - left[1]));
}

interface DensityReport {
  readonly artifactsByClassification: Record<string, number>;
  readonly averageDegree: number;
  readonly averagePairDegree: number;
  readonly codeFileCount: number;
  readonly commitSha: string;
  readonly degreeHistogram: Record<string, number>;
  readonly directory: string;
  readonly edgeCount: number;
  readonly linkSchemaVersion: number;
  readonly linkScope: LinkScope;
  readonly linksByKind: Record<string, number>;
  readonly linksByMethod: Record<string, number>;
  readonly linksByTier: Record<string, number>;
  readonly nodeCount: number;
  readonly orphanCodeFiles: number;
  readonly orphanShare: number;
  readonly pairCount: number;
  readonly scanMilliseconds: number;
  readonly topDegree: readonly { degree: number; path: string }[];
  readonly triangleCount: number;
}

const HISTOGRAM_BUCKETS: readonly (readonly [string, number, number])[] = [
  ["0", 0, 0],
  ["1", 1, 1],
  ["2-3", 2, 3],
  ["4-7", 4, 7],
  ["8-15", 8, 15],
  ["16-31", 16, 31],
  ["32+", 32, Number.POSITIVE_INFINITY],
];

function bucketOf(degree: number): string {
  for (const [label, low, high] of HISTOGRAM_BUCKETS) {
    if (degree >= low && degree <= high) return label;
  }
  return "32+";
}

/**
 * Triangles in the undirected simple graph. A tree has none; a graph with a
 * healthy number of them is the "web" shape the design is aiming at, so the
 * count is a cheap structural check rather than an aesthetic judgement.
 */
function countTriangles(
  neighbours: ReadonlyMap<string, ReadonlySet<string>>,
): number {
  const order = [...neighbours.keys()].sort();
  const rank = new Map(order.map((path, index) => [path, index]));
  let triangles = 0;
  for (const path of order) {
    const own = neighbours.get(path);
    if (!own) continue;
    const higher = [...own].filter(
      (other) => (rank.get(other) ?? -1) > (rank.get(path) ?? -1),
    );
    for (let i = 0; i < higher.length; i += 1) {
      for (let j = i + 1; j < higher.length; j += 1) {
        const a = higher[i];
        const b = higher[j];
        if (a === undefined || b === undefined) continue;
        if (neighbours.get(a)?.has(b)) triangles += 1;
      }
    }
  }
  return triangles;
}

function buildReport(input: {
  readonly directory: string;
  readonly plan: RepositoryScanPlan;
  readonly scanMilliseconds: number;
  readonly top: number;
}): DensityReport {
  const { plan } = input;
  const artifactPaths = new Set(plan.artifacts.map(({ path }) => path));
  for (const path of plan.unchangedPaths) artifactPaths.add(path);

  const codeFiles = new Set<string>();
  for (const artifact of plan.artifacts) {
    if (artifact.classification === "code_metadata")
      codeFiles.add(artifact.path);
  }
  // A relinked file contributes links without an artifact row; it is still a
  // code file and still a node.
  for (const link of plan.codeLinks) {
    codeFiles.add(link.sourcePath);
    codeFiles.add(link.targetPath);
    artifactPaths.add(link.sourcePath);
    artifactPaths.add(link.targetPath);
  }
  // Document links count too (Phase 4 Wave A todo 2): they are a third of
  // this repository's deterministic edges, and a density report that read
  // only the code half would understate the graph it is measuring.
  const allLinks = [...plan.codeLinks, ...plan.docLinks];
  for (const link of plan.docLinks) {
    artifactPaths.add(link.sourcePath);
    artifactPaths.add(link.targetPath);
  }

  const neighbours = new Map<string, Set<string>>();
  const rawDegree = new Map<string, number>();
  const link = (from: string, to: string): void => {
    if (!neighbours.has(from)) neighbours.set(from, new Set());
    if (!neighbours.has(to)) neighbours.set(to, new Set());
    neighbours.get(from)?.add(to);
    neighbours.get(to)?.add(from);
    rawDegree.set(from, (rawDegree.get(from) ?? 0) + 1);
    rawDegree.set(to, (rawDegree.get(to) ?? 0) + 1);
  };
  for (const edge of allLinks) link(edge.sourcePath, edge.targetPath);

  let pairCount = 0;
  for (const [, set] of neighbours) pairCount += set.size;
  pairCount /= 2;

  const nodeCount = artifactPaths.size;
  const edgeCount = allLinks.length;

  const histogram: Record<string, number> = {};
  for (const [, label] of HISTOGRAM_BUCKETS.entries()) histogram[label[0]] = 0;
  let orphanCodeFiles = 0;
  for (const path of artifactPaths) {
    const degree = neighbours.get(path)?.size ?? 0;
    const bucket = bucketOf(degree);
    histogram[bucket] = (histogram[bucket] ?? 0) + 1;
    if (degree === 0 && codeFiles.has(path)) orphanCodeFiles += 1;
  }

  const topDegree = [...neighbours]
    .map(([path, set]) => ({ degree: set.size, path }))
    .sort(
      (left, right) =>
        right.degree - left.degree || left.path.localeCompare(right.path),
    )
    .slice(0, input.top);

  const classifications: Record<string, number> = {};
  for (const [key, value] of tally(
    plan.artifacts.map(({ classification }) => classification),
  )) {
    classifications[key] = value;
  }

  const byKind: Record<string, number> = {};
  for (const [key, value] of tally(allLinks.map((edge) => edge.kind))) {
    byKind[key] = value;
  }
  const byTier: Record<string, number> = {};
  for (const [key, value] of tally(allLinks.map((edge) => edge.tier))) {
    byTier[key] = value;
  }
  const byMethod: Record<string, number> = {};
  for (const [key, value] of tally(allLinks.map((edge) => edge.method))) {
    byMethod[key] = value;
  }

  const orphanNodes = histogram["0"] ?? 0;
  return {
    artifactsByClassification: classifications,
    averageDegree: nodeCount === 0 ? 0 : (edgeCount * 2) / nodeCount,
    averagePairDegree: nodeCount === 0 ? 0 : (pairCount * 2) / nodeCount,
    codeFileCount: codeFiles.size,
    commitSha: plan.commitSha,
    degreeHistogram: histogram,
    directory: input.directory,
    edgeCount,
    linkSchemaVersion: plan.linkSchemaVersion,
    linkScope: plan.linkScope,
    linksByKind: byKind,
    linksByMethod: byMethod,
    linksByTier: byTier,
    nodeCount,
    orphanCodeFiles,
    orphanShare: nodeCount === 0 ? 0 : orphanNodes / nodeCount,
    pairCount,
    scanMilliseconds: input.scanMilliseconds,
    topDegree,
    triangleCount: countTriangles(neighbours),
  };
}

function table(counts: Record<string, number>): string {
  const rows = Object.entries(counts).sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
  );
  return rows.map(([key, value]) => `| ${key} | ${value} |`).join("\n");
}

function renderMarkdown(report: DensityReport, measuredAt: string): string {
  return `# Graph density — \`${report.directory}\`

Measured ${measuredAt} by \`scripts/measure-graph-density.ts\` against the
working tree, resolver generation ${report.linkSchemaVersion}, link scope
\`${report.linkScope}\`. Scan took ${report.scanMilliseconds} ms. These are
measurements of the deterministic scan only: nothing here involved credits,
AI output, or the database.

| Measure | Value |
| --- | --- |
| Nodes (file artifacts) | ${report.nodeCount} |
| Code files | ${report.codeFileCount} |
| Edges (structure links) | ${report.edgeCount} |
| Distinct connected pairs | ${report.pairCount} |
| Average degree (edges) | ${report.averageDegree.toFixed(2)} |
| Average degree (distinct pairs) | ${report.averagePairDegree.toFixed(2)} |
| Nodes with no link | ${(report.orphanShare * 100).toFixed(1)}% |
| Code files with no link | ${report.orphanCodeFiles} |
| Triangles | ${report.triangleCount} |

Edges by relation:

| Relation | Count |
| --- | --- |
${table(report.linksByKind)}

Edges by tier:

| Tier | Count |
| --- | --- |
${table(report.linksByTier)}

Edges by resolution method — \`alias-resolution\`, \`barrel-resolution\` and
\`test-import\` did not exist before resolver generation 2, so their counts are
the links this repository's graph previously had no way to draw:

| Method | Count |
| --- | --- |
${table(report.linksByMethod)}

Degree histogram (distinct neighbours per node):

| Degree | Nodes |
| --- | --- |
${table(report.degreeHistogram)}

Artifacts by classification:

| Classification | Count |
| --- | --- |
${table(report.artifactsByClassification)}

Highest degree:

| Node | Neighbours |
| --- | --- |
${report.topDegree.map((entry) => `| \`${entry.path}\` | ${entry.degree} |`).join("\n")}
`;
}

async function main(argv: readonly string[]): Promise<number> {
  const options = parseArguments(argv);
  const directory = resolve(options.directory);
  const { commitSha, source } = await createLocalRepositorySource(directory);
  const startedAt = performance.now();
  const plan = await scanRepository({ commitSha, mode: options.mode, source });
  const scanMilliseconds = Math.round(performance.now() - startedAt);

  const report = buildReport({
    directory: options.directory,
    plan,
    scanMilliseconds,
    top: options.top,
  });

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(
      `${report.nodeCount} nodes · ${report.edgeCount} edges · ` +
        `${report.pairCount} pairs · avg degree ${report.averageDegree.toFixed(2)} ` +
        `(pairs ${report.averagePairDegree.toFixed(2)}) · ` +
        `orphans ${(report.orphanShare * 100).toFixed(1)}% · ` +
        `triangles ${report.triangleCount} · resolver v${LINK_SCHEMA_VERSION}`,
    );
    for (const [method, count] of Object.entries(report.linksByMethod)) {
      console.log(`  ${method.padEnd(18)} ${count}`);
    }
  }

  if (options.out) {
    const target = resolve(options.out);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(
      target,
      renderMarkdown(report, new Date().toISOString().slice(0, 10)),
      "utf8",
    );
    console.log(`wrote ${options.out}`);
  }
  return 0;
}

process.exitCode = await main(process.argv.slice(2));
