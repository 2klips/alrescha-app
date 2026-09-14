/**
 * Auxiliary ⑤ (todo 25): precision of the risk map's top N, labelled by a
 * pre-registered rule rather than by a person's opinion.
 *
 * The rule: a file on the list is a true positive when, inside the window,
 * a commit whose subject matches the pattern touched it — "a fix landed
 * there recently". It is a proxy for risk, stated as one; the report says so
 * next to every number. Strata follow R5 §4.6 (d): repositories with CI
 * evidence and without, because coverage is one of the map's signals and a
 * map with it measured is a different map.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { RiskEntry, RiskMap } from "../../packages/core/src/index";
import type { McpWorkspaceData } from "../../packages/mcp/src/store";

const RECORD_SEPARATOR = "";
const FIELD_SEPARATOR = "";

/** `git log --format=%x1e%H%x1f%s --name-only`, parsed. */
export interface FixCommit {
  readonly paths: readonly string[];
  readonly sha: string;
  readonly subject: string;
}

export function parseGitLogNameOnly(text: string): FixCommit[] {
  return text
    .split(RECORD_SEPARATOR)
    .map((record) => record.trim())
    .filter((record) => record.length > 0)
    .map((record) => {
      const [header, ...rest] = record.split("\n");
      const [sha = "", subject = ""] = (header ?? "").split(FIELD_SEPARATOR);
      return {
        paths: rest
          .map((line) => line.trim())
          .filter((line) => line.length > 0),
        sha: sha.trim(),
        subject: subject.trim(),
      };
    });
}

/** Commits per path among the commits whose subject matches. */
export function fixTouchesByPath(
  commits: readonly FixCommit[],
  subjectPattern: RegExp,
): Map<string, number> {
  const touches = new Map<string, number>();
  for (const commit of commits) {
    if (!subjectPattern.test(commit.subject)) continue;
    for (const path of new Set(commit.paths)) {
      touches.set(path, (touches.get(path) ?? 0) + 1);
    }
  }
  return touches;
}

export async function collectFixCommits(input: {
  readonly rootDir: string;
  readonly sinceDays: number;
}): Promise<FixCommit[]> {
  const { stdout } = await promisify(execFile)(
    "git",
    [
      "log",
      `--since=${input.sinceDays}.days`,
      `--format=${RECORD_SEPARATOR}%H${FIELD_SEPARATOR}%s`,
      "--name-only",
      "--no-merges",
    ],
    { cwd: input.rootDir, maxBuffer: 64 * 1024 * 1024 },
  );
  return parseGitLogNameOnly(stdout);
}

export interface RiskLabel {
  readonly factors: readonly string[];
  readonly fixCommits: number;
  readonly level: RiskEntry["level"];
  readonly path: string;
  readonly rank: number;
  readonly score: number;
  readonly truePositive: boolean;
}

/** The top N by score (ties by path), each labelled by the rule. */
export function labelRiskEntries(
  entries: readonly RiskEntry[],
  touches: ReadonlyMap<string, number>,
  topN: number,
): RiskLabel[] {
  return [...entries]
    .sort(
      (left, right) =>
        right.score - left.score || left.path.localeCompare(right.path),
    )
    .slice(0, topN)
    .map((entry, index) => {
      const fixCommits = touches.get(entry.path) ?? 0;
      return {
        factors: entry.factors.map(({ kind }) => kind),
        fixCommits,
        level: entry.level,
        path: entry.path,
        rank: index + 1,
        score: entry.score,
        truePositive: fixCommits > 0,
      };
    });
}

/** Precision over the first `k` labels; null when the list is shorter. */
export function precisionAt(
  labels: readonly RiskLabel[],
  k: number,
): number | null {
  if (labels.length < k) return null;
  const head = labels.slice(0, k);
  return (
    Math.round(
      (head.filter(({ truePositive }) => truePositive).length / k) * 1000,
    ) / 1000
  );
}

export type RiskStratum = "with-ci" | "without-ci";

/** Which stratum a workspace falls in: does any evidence row come from CI? */
export function riskStratum(workspace: McpWorkspaceData): RiskStratum {
  const hasCi = workspace.repositories.some((repository) =>
    repository.evidence.some((evidence) => evidence.kind === "ci"),
  );
  return hasCi ? "with-ci" : "without-ci";
}

export interface RiskStratumReport {
  readonly entries: number;
  readonly labels: readonly RiskLabel[];
  readonly precisionAt10: number | null;
  readonly precisionAtN: number | null;
  readonly stratum: RiskStratum;
  readonly truePositives: number;
}

export interface RiskPrecisionReport {
  readonly corpusCommit: string | null;
  readonly entryCount: number;
  readonly fixCommits: number;
  readonly repository: string;
  readonly sinceDays: number;
  readonly strata: readonly RiskStratumReport[];
  readonly subjectPattern: string;
  readonly topN: number;
  readonly unmeasured: readonly string[];
}

export function buildRiskPrecisionReport(input: {
  readonly commits: readonly FixCommit[];
  readonly corpusCommit: string | null;
  readonly repository: string;
  readonly riskMap: RiskMap;
  readonly sinceDays: number;
  readonly stratum: RiskStratum;
  readonly subjectPattern: RegExp;
  readonly topN: number;
}): RiskPrecisionReport {
  const touches = fixTouchesByPath(input.commits, input.subjectPattern);
  const labels = labelRiskEntries(input.riskMap.entries, touches, input.topN);
  const measured: RiskStratumReport = {
    entries: labels.length,
    labels,
    precisionAt10: precisionAt(labels, 10),
    precisionAtN: precisionAt(labels, input.topN),
    stratum: input.stratum,
    truePositives: labels.filter(({ truePositive }) => truePositive).length,
  };
  const other: RiskStratum =
    input.stratum === "with-ci" ? "without-ci" : "with-ci";
  const empty: RiskStratumReport = {
    entries: 0,
    labels: [],
    precisionAt10: null,
    precisionAtN: null,
    stratum: other,
    truePositives: 0,
  };
  return {
    corpusCommit: input.corpusCommit,
    entryCount: input.riskMap.entries.length,
    fixCommits: input.commits.filter((commit) =>
      input.subjectPattern.test(commit.subject),
    ).length,
    repository: input.repository,
    sinceDays: input.sinceDays,
    strata: [measured, empty].sort((left, right) =>
      left.stratum.localeCompare(right.stratum),
    ),
    subjectPattern: input.subjectPattern.source,
    topN: input.topN,
    unmeasured: input.riskMap.unmeasured.map(({ signal }) => signal),
  };
}
