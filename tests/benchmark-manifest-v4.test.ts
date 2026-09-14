import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { gradeBenchmarkOutput } from "../scripts/databrain-benchmark/grading";
import {
  benchmarkManifestDigest,
  loadBenchmarkManifest,
} from "../scripts/databrain-benchmark/manifest";
import { loadGraphSurfaceBenchmark } from "../scripts/graph-surface-benchmark/manifest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const v3Path = join(repoRoot, "benchmarks/databrain/tasks.v3.json");
const v4Path = join(repoRoot, "benchmarks/databrain/tasks.v4.json");

/** The frozen v3 digest every graph-surface pre-registration so far pins. */
const V3_DIGEST =
  "7a317232cfb4f7c13db3e4c8c4f9bfd3f8eb26dd6f02dccc519b04ad77a9c2a7";

const REVISED = {
  "real-answer-index-pr-limits": {
    added: ["alrescha:begin", "alrescha begin"],
    factIndex: 1,
  },
  "real-answer-receipt-statement": {
    added: [
      "https://arr-app-web.vercel.app/receipt/v1",
      "arr-app-web.vercel.app/receipt/v1",
    ],
    factIndex: 1,
  },
} as const;

describe("tasks.v4.json — the frozen question set with post-rename aliases (OQ-070 ⑴)", () => {
  it("leaves v3 frozen and gives v4 a new digest", async () => {
    const v3 = await loadBenchmarkManifest(v3Path);
    const v4 = await loadBenchmarkManifest(v4Path);
    expect(benchmarkManifestDigest(v3)).toBe(V3_DIGEST);
    expect(benchmarkManifestDigest(v4)).not.toBe(V3_DIGEST);
    expect(v4.schemaVersion).toBe(2);
    expect(v4.tasks).toHaveLength(v3.tasks.length);
    expect(v4.schemaVersion === 2 && v4.models).toEqual(
      v3.schemaVersion === 2 ? v3.models : null,
    );
  });

  it("differs from v3 only by the added aliases on the two renamed facts — nothing removed, nothing else touched", async () => {
    const v3 = await loadBenchmarkManifest(v3Path);
    const v4 = await loadBenchmarkManifest(v4Path);
    for (const [index, task] of v3.tasks.entries()) {
      const revised = v4.tasks[index]!;
      const change = REVISED[task.id as keyof typeof REVISED];
      if (!change) {
        expect(revised, task.id).toEqual(task);
        continue;
      }
      expect({ ...revised, grader: null }).toEqual({ ...task, grader: null });
      expect(task.grader.kind).toBe("answer-manifest");
      expect(revised.grader.kind).toBe("answer-manifest");
      if (
        task.grader.kind !== "answer-manifest" ||
        revised.grader.kind !== "answer-manifest"
      ) {
        return;
      }
      for (const [factIndex, aliases] of task.grader.requiredFacts.entries()) {
        const revisedAliases = revised.grader.requiredFacts[factIndex]!;
        // Every v3 alias survives, in place.
        expect(revisedAliases.slice(0, aliases.length)).toEqual(aliases);
        expect(revisedAliases.slice(aliases.length)).toEqual(
          factIndex === change.factIndex ? [...change.added] : [],
        );
      }
    }
  });

  it("the added aliases are the strings the source carries today", () => {
    const receipts = readFileSync(
      join(repoRoot, "packages/core/src/assurance/receipts.ts"),
      "utf8",
    );
    expect(receipts).toContain("https://arr-app-web.vercel.app/receipt/v1");
    const minimalIndex = readFileSync(
      join(repoRoot, "packages/core/src/context/minimal-index.ts"),
      "utf8",
    );
    expect(minimalIndex).toContain("<!-- ALRESCHA:BEGIN");
  });

  it("an answer quoting today's strings passes under v4 and tops out at 2/3 under v3", async () => {
    const v3 = await loadBenchmarkManifest(v3Path);
    const v4 = await loadBenchmarkManifest(v4Path);
    const answers = {
      "real-answer-index-pr-limits":
        "The only write path is the advisory PR proposal; the managed section begins with `<!-- ALRESCHA:BEGIN (managed — do not edit inside) -->` and may hold at most 30 lines.",
      "real-answer-receipt-statement":
        "Statement type https://in-toto.io/Statement/v1, predicate type https://arr-app-web.vercel.app/receipt/v1; re-verification recomputes the SHA-256 digest.",
    } as const;
    for (const [id, answer] of Object.entries(answers)) {
      const output = { answer, files: [], findings: [] };
      const under3 = await gradeBenchmarkOutput({
        output,
        task: v3.tasks.find((task) => task.id === id)!,
      });
      const under4 = await gradeBenchmarkOutput({
        output,
        task: v4.tasks.find((task) => task.id === id)!,
      });
      expect(under3.passed, `${id} under v3`).toBe(false);
      expect(under3.score).toBeCloseTo(2 / 3, 5);
      expect(under4.passed, `${id} under v4`).toBe(true);
    }
  });

  it("a graph-surface pre-registration can name tasks.v4.json and pin its digest; the wrong digest refuses", async () => {
    const v4 = await loadBenchmarkManifest(v4Path);
    const directory = mkdtempSync(join(tmpdir(), "graph-surface-v4-"));
    try {
      const base = JSON.parse(
        readFileSync(
          join(repoRoot, "benchmarks/graph-surface/preregistration.v3.json"),
          "utf8",
        ),
      ) as { questionSource: Record<string, unknown> };
      base.questionSource = {
        ...base.questionSource,
        manifest: "benchmarks/databrain/tasks.v4.json",
        manifestDigest: benchmarkManifestDigest(v4),
      };
      const named = join(directory, "v4.json");
      writeFileSync(named, JSON.stringify(base), "utf8");
      const loaded = await loadGraphSurfaceBenchmark({
        preregistrationPath: named,
        repositoryRoot: repoRoot,
        v3ManifestPath: v3Path,
      });
      expect(loaded.preregistration.questionSource.manifest).toBe(
        "benchmarks/databrain/tasks.v4.json",
      );
      expect(loaded.tasks).toHaveLength(12);
      const receipt = loaded.tasks.find(
        ({ id }) => id === "real-answer-receipt-statement",
      )!;
      expect(
        receipt.grader.kind === "answer-manifest" &&
          receipt.grader.requiredFacts[1],
      ).toContain("arr-app-web.vercel.app/receipt/v1");

      // Without a root the named manifest cannot be resolved: refuse, never
      // fall back to v3 and grade the wrong set.
      await expect(
        loadGraphSurfaceBenchmark({
          preregistrationPath: named,
          v3ManifestPath: v3Path,
        }),
      ).rejects.toThrow(/no repository root/);

      // The v3 digest against the v4 file is a mismatch, not a run.
      base.questionSource = {
        ...base.questionSource,
        manifestDigest: V3_DIGEST,
      };
      const stale = join(directory, "stale.json");
      writeFileSync(stale, JSON.stringify(base), "utf8");
      await expect(
        loadGraphSurfaceBenchmark({
          preregistrationPath: stale,
          repositoryRoot: repoRoot,
          v3ManifestPath: v3Path,
        }),
      ).rejects.toThrow(/does not match the pre-registered/);
    } finally {
      rmSync(directory, { recursive: true });
    }
  });

  it("the committed v1–v3 pre-registrations still resolve tasks.v3.json by name", async () => {
    for (const file of [
      "preregistration.v1.json",
      "preregistration.v2.json",
      "preregistration.v3.json",
    ]) {
      const loaded = await loadGraphSurfaceBenchmark({
        preregistrationPath: join(repoRoot, "benchmarks/graph-surface", file),
        repositoryRoot: repoRoot,
        v3ManifestPath: v3Path,
      });
      expect(loaded.preregistration.questionSource.manifest).toBe(
        "benchmarks/databrain/tasks.v3.json",
      );
      expect(loaded.preregistration.questionSource.manifestDigest).toBe(
        V3_DIGEST,
      );
    }
    expect(createHash("sha256").update("").digest("hex")).toHaveLength(64);
  });
});
