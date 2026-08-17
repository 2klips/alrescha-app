import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { verifyBenchmarkRelease } from "../scripts/verify-benchmark-report";
import { summarizeBenchmark } from "../scripts/databrain-benchmark/benchmark";
import {
  benchmarkManifestDigest,
  loadBenchmarkManifest,
} from "../scripts/databrain-benchmark/manifest";
import { renderBenchmarkMarkdown } from "../scripts/databrain-benchmark/report";
import { BOOTSTRAP_METHOD_DESCRIPTION } from "../scripts/databrain-benchmark/statistics";
import type {
  BenchmarkManifestV2,
  BenchmarkReport,
  BenchmarkReportV2,
  BenchmarkTrialResult,
} from "../scripts/databrain-benchmark/types";

const REPOSITORY_ROOT = resolve(import.meta.dirname, "..");
const V3_MANIFEST_PATH = join(
  REPOSITORY_ROOT,
  "benchmarks/databrain/tasks.v3.json",
);
const V3_TOKEN_ASSUMPTION =
  "Each provider's own reported usage.input_tokens and usage.output_tokens are authoritative (OpenAI Responses API, Anthropic Messages API); no local tokenizer estimate is substituted.";

async function loadV3Manifest(): Promise<BenchmarkManifestV2> {
  const manifest = await loadBenchmarkManifest(V3_MANIFEST_PATH);
  if (manifest.schemaVersion !== 2) throw new Error("expected schema 2");
  return manifest;
}

/**
 * Builds a complete, internally consistent schema-2 release. The negative
 * tests below seed exactly one defect into it, so a finding can only come from
 * that defect.
 */
async function seedV3Release(
  options: { skipAnthropic?: boolean | undefined } = {},
): Promise<{ manifest: BenchmarkManifestV2; report: BenchmarkReportV2 }> {
  const manifest = await loadV3Manifest();
  const models = options.skipAnthropic
    ? manifest.models.filter(({ provider }) => provider !== "anthropic")
    : manifest.models;
  const trials: BenchmarkTrialResult[] = [];

  for (const [taskIndex, task] of manifest.tasks.entries()) {
    const promptDigest = createHash("sha256")
      .update(task.prompt, "utf8")
      .digest("hex");

    for (const arm of manifest.arms) {
      for (const model of models) {
        for (let trial = 1; trial <= manifest.trialsPerArm; trial += 1) {
          const jitter =
            arm === "data-brain"
              ? ((taskIndex + trial) % 3) * 0.05
              : ((taskIndex + 2 * trial) % 3) * 0.05;
          const base =
            arm === "checkout" ? 0.5 : arm === "full-dump" ? 0.4 : 0.75;
          const inputTokens =
            arm === "checkout" ? 900 : arm === "full-dump" ? 3_000 : 220;
          trials.push({
            arm,
            error: null,
            errorMessage: null,
            grade: {
              passed: base + jitter >= 0.9,
              score: Number((base + jitter).toFixed(6)),
              summary: "seeded",
            },
            inputTokens: inputTokens + taskIndex,
            model: model.id,
            output: null,
            outputTokens: 30,
            promptDigest,
            provider: model.provider,
            responseId: `seed-${task.id}-${arm}-${model.id}-${trial}`,
            status: "completed",
            taskId: task.id,
            toolCalls: arm === "full-dump" ? 0 : 4,
            trial,
            wallTimeMs: 1_000,
          });
        }
      }
    }
  }

  const { aggregates, hypotheses } = summarizeBenchmark(
    trials,
    manifest.arms,
    models.map(({ id }) => id),
  );

  return {
    manifest,
    report: {
      aggregates,
      hypotheses,
      protocol: {
        arms: [...manifest.arms],
        expectedTrialCount:
          manifest.tasks.length *
          manifest.arms.length *
          manifest.trialsPerArm *
          models.length,
        fixtureTaskCount: manifest.tasks.filter(({ repository }) =>
          repository.startsWith("fixtures/"),
        ).length,
        realisticTaskCount: manifest.tasks.filter(
          ({ repository }) => !repository.startsWith("fixtures/"),
        ).length,
        registeredTrialCount:
          manifest.tasks.length *
          manifest.arms.length *
          manifest.trialsPerArm *
          manifest.models.length,
        taskCount: manifest.tasks.length,
        trialsPerArm: manifest.trialsPerArm,
      },
      run: {
        confidenceMethod: BOOTSTRAP_METHOD_DESCRIPTION,
        corpusCommit: "0123456789abcdef0123456789abcdef01234567",
        generatedAt: "2026-08-17T00:00:00.000Z",
        manifestDigest: benchmarkManifestDigest(manifest),
        mode: "real",
        models: manifest.models.map((spec) =>
          models.some(({ id }) => id === spec.id)
            ? {
                id: spec.id,
                provider: spec.provider,
                reason: null,
                status: "executed" as const,
              }
            : {
                id: spec.id,
                provider: spec.provider,
                reason: "ANTHROPIC_API_KEY was not present for this run.",
                status: "skipped" as const,
              },
        ),
        overrides: [],
        resultsBasename: "results.v3.real",
        tokenizerAssumption: V3_TOKEN_ASSUMPTION,
      },
      schemaVersion: 2,
      trials,
    },
  };
}

/**
 * Writes both releases into a scratch root: the frozen schema-1 publication
 * and a seeded schema-2 publication, with the Markdown rendered *after* the
 * mutation so a seeded defect is never masked by a Markdown mismatch.
 */
async function withV3Fixture(
  mutate: (report: BenchmarkReportV2) => void,
  run: (root: string) => Promise<void>,
  options: {
    skipAnthropic?: boolean | undefined;
    tamperMarkdown?: boolean | undefined;
  } = {},
) {
  const root = await mkdtemp(join(tmpdir(), "arr-benchmark-v3-audit-"));

  try {
    const benchmarkDirectory = join(root, "benchmarks/databrain");
    await mkdir(benchmarkDirectory, { recursive: true });
    const [v1Manifest, v1Report, v1Markdown, v3Manifest] = await Promise.all([
      readFile(
        join(REPOSITORY_ROOT, "benchmarks/databrain/tasks.json"),
        "utf8",
      ),
      readFile(
        join(REPOSITORY_ROOT, "benchmarks/databrain/results.real.json"),
        "utf8",
      ),
      readFile(
        join(REPOSITORY_ROOT, "benchmarks/databrain/results.real.md"),
        "utf8",
      ),
      readFile(V3_MANIFEST_PATH, "utf8"),
    ]);
    const { report } = await seedV3Release({
      skipAnthropic: options.skipAnthropic,
    });
    mutate(report);
    const markdown = options.tamperMarkdown
      ? renderBenchmarkMarkdown(report).replace(
          "## Model coverage",
          "## Models",
        )
      : renderBenchmarkMarkdown(report);

    await Promise.all([
      writeFile(join(benchmarkDirectory, "tasks.json"), v1Manifest, "utf8"),
      writeFile(
        join(benchmarkDirectory, "results.real.json"),
        v1Report,
        "utf8",
      ),
      writeFile(
        join(benchmarkDirectory, "results.real.md"),
        v1Markdown,
        "utf8",
      ),
      writeFile(join(benchmarkDirectory, "tasks.v3.json"), v3Manifest, "utf8"),
      writeFile(
        join(benchmarkDirectory, "results.v3.real.json"),
        `${JSON.stringify(report, null, 2)}\n`,
        "utf8",
      ),
      writeFile(
        join(benchmarkDirectory, "results.v3.real.md"),
        markdown,
        "utf8",
      ),
    ]);

    await run(root);
  } finally {
    await rm(root, { recursive: true });
  }
}

async function withBenchmarkFixture(
  mutate: (report: BenchmarkReport) => void,
  run: (root: string) => Promise<void>,
) {
  const root = await mkdtemp(join(tmpdir(), "arr-benchmark-audit-"));

  try {
    const benchmarkDirectory = join(root, "benchmarks/databrain");
    await mkdir(benchmarkDirectory, { recursive: true });

    const [manifest, reportJson, markdown] = await Promise.all([
      readFile(
        join(REPOSITORY_ROOT, "benchmarks/databrain/tasks.json"),
        "utf8",
      ),
      readFile(
        join(REPOSITORY_ROOT, "benchmarks/databrain/results.real.json"),
        "utf8",
      ),
      readFile(
        join(REPOSITORY_ROOT, "benchmarks/databrain/results.real.md"),
        "utf8",
      ),
    ]);
    const report = JSON.parse(reportJson) as BenchmarkReport;
    mutate(report);

    await Promise.all([
      writeFile(join(benchmarkDirectory, "tasks.json"), manifest, "utf8"),
      writeFile(
        join(benchmarkDirectory, "results.real.json"),
        `${JSON.stringify(report, null, 2)}\n`,
        "utf8",
      ),
      writeFile(join(benchmarkDirectory, "results.real.md"), markdown, "utf8"),
    ]);

    await run(root);
  } finally {
    await rm(root, { recursive: true });
  }
}

describe("F5 efficacy benchmark audit", () => {
  it("rejects a real report missing a pre-registered trial", async () => {
    await withBenchmarkFixture(
      (report) => {
        report.trials.pop();
      },
      async (root) => {
        const audit = await verifyBenchmarkRelease(root);

        expect(audit.findings).toContainEqual(
          expect.objectContaining({ kind: "trial-coverage" }),
        );
        expect(audit.status).toBe("fail");
      },
    );
  });

  it("rejects a report that is not a real manifest-matched run", async () => {
    await withBenchmarkFixture(
      (report) => {
        report.run.mode = "dry-run";
      },
      async (root) => {
        const audit = await verifyBenchmarkRelease(root);

        expect(audit.findings).toContainEqual(
          expect.objectContaining({ kind: "run-contract" }),
        );
        expect(audit.status).toBe("fail");
      },
    );
  });

  it("rejects a trial run with a different model", async () => {
    await withBenchmarkFixture(
      (report) => {
        report.trials[0]!.model = "different-model";
      },
      async (root) => {
        const audit = await verifyBenchmarkRelease(root);

        expect(audit.findings).toContainEqual(
          expect.objectContaining({ kind: "trial-integrity" }),
        );
        expect(audit.status).toBe("fail");
      },
    );
  });

  it("rejects aggregate measurements that do not match raw trials", async () => {
    await withBenchmarkFixture(
      (report) => {
        report.aggregates[0]!.totalTokens += 1;
      },
      async (root) => {
        const audit = await verifyBenchmarkRelease(root);

        expect(audit.findings).toContainEqual(
          expect.objectContaining({ kind: "measurement-integrity" }),
        );
        expect(audit.status).toBe("fail");
      },
    );
  });

  it("rejects a publication missing its tokenizer assumption", async () => {
    await withBenchmarkFixture(
      (report) => {
        report.run.tokenizerAssumption = "";
      },
      async (root) => {
        const audit = await verifyBenchmarkRelease(root);

        expect(audit.findings).toContainEqual(
          expect.objectContaining({ kind: "publication-integrity" }),
        );
        expect(audit.status).toBe("fail");
      },
    );
  });

  it("rejects an efficiency claim without a committed-report link", async () => {
    await withBenchmarkFixture(
      () => undefined,
      async (root) => {
        const page = join(root, "apps/web/app/page.tsx");
        await mkdir(resolve(page, ".."), { recursive: true });
        await writeFile(
          page,
          `export default function Page() {
            return <p>Data Brain uses fewer tokens for the same task.</p>;
          }`,
          "utf8",
        );

        const audit = await verifyBenchmarkRelease(root);

        expect(audit.findings).toContainEqual(
          expect.objectContaining({ kind: "claim-traceability" }),
        );
        expect(audit.status).toBe("fail");
      },
    );
  });

  it("rejects a token-savings claim above the measured result", async () => {
    await withBenchmarkFixture(
      () => undefined,
      async (root) => {
        const page = join(root, "apps/web/app/page.tsx");
        await mkdir(resolve(page, ".."), { recursive: true });
        await writeFile(
          page,
          `export default function Page() {
            return <p>60% fewer tokens. <a href="/benchmarks/databrain/results.real.md">Report</a></p>;
          }`,
          "utf8",
        );

        const audit = await verifyBenchmarkRelease(root);

        expect(audit.findings).toContainEqual(
          expect.objectContaining({ kind: "claim-accuracy" }),
        );
        expect(audit.status).toBe("fail");
      },
    );
  });

  it("rejects an accuracy claim above the measured result", async () => {
    await withBenchmarkFixture(
      () => undefined,
      async (root) => {
        const page = join(root, "apps/web/app/page.tsx");
        await mkdir(resolve(page, ".."), { recursive: true });
        await writeFile(
          page,
          `export default function Page() {
            return <p>99pp higher accuracy. <a href="/benchmarks/databrain/results.real.md">Report</a></p>;
          }`,
          "utf8",
        );

        const audit = await verifyBenchmarkRelease(root);

        expect(audit.findings).toContainEqual(
          expect.objectContaining({ kind: "claim-accuracy" }),
        );
        expect(audit.status).toBe("fail");
      },
    );
  });

  it("accepts the committed complete real benchmark", async () => {
    const audit = await verifyBenchmarkRelease(REPOSITORY_ROOT);

    expect(audit).toMatchObject({
      accuracyDeltaPercentagePoints: expect.any(Number),
      actualTrialCount: 108,
      expectedTrialCount: 108,
      model: "gpt-5-nano-2025-08-07",
      status: "pass",
      tokenReductionPercent: expect.any(Number),
    });
    expect(audit.claimFileCount).toBeGreaterThan(0);
    expect(audit.findings).toEqual([]);
  });

  it("reports the v3 pre-registration as pending until its real run exists", async () => {
    const audit = await verifyBenchmarkRelease(REPOSITORY_ROOT);

    expect(audit.pendingReleases).toEqual(["v3"]);
    expect(audit.releases.map(({ id }) => id)).toEqual(["v2"]);
  });
});

describe("F5 efficacy benchmark audit — schema 2 release", () => {
  it("accepts a complete seeded schema-2 release", async () => {
    await withV3Fixture(
      () => undefined,
      async (root) => {
        const audit = await verifyBenchmarkRelease(root);

        expect(audit.findings).toEqual([]);
        expect(audit).toMatchObject({
          actualTrialCount: 600,
          expectedTrialCount: 600,
          model: "gpt-5.6-luna+claude-sonnet-5",
          status: "pass",
        });
        expect(audit.releases.map(({ id }) => id)).toEqual(["v2", "v3"]);
        expect(audit.pendingReleases).toEqual([]);
      },
    );
  }, 60_000);

  it("accepts a release whose model was skipped for a missing key and says so", async () => {
    await withV3Fixture(
      () => undefined,
      async (root) => {
        const audit = await verifyBenchmarkRelease(root);

        expect(audit.findings).toEqual([]);
        expect(audit).toMatchObject({
          actualTrialCount: 300,
          expectedTrialCount: 300,
          model: "gpt-5.6-luna",
          status: "pass",
        });
        const markdown = await readFile(
          join(root, "benchmarks/databrain/results.v3.real.md"),
          "utf8",
        );
        expect(markdown).toContain("Skipped model: `claude-sonnet-5`");
      },
      { skipAnthropic: true },
    );
  }, 60_000);

  it("rejects a schema-2 report missing a pre-registered model trial", async () => {
    await withV3Fixture(
      (report) => {
        report.trials.pop();
      },
      async (root) => {
        const audit = await verifyBenchmarkRelease(root);

        expect(audit.findings).toContainEqual(
          expect.objectContaining({ kind: "trial-coverage" }),
        );
        expect(audit.status).toBe("fail");
      },
    );
  }, 60_000);

  it("rejects a schema-2 trial whose provider contradicts the manifest", async () => {
    await withV3Fixture(
      (report) => {
        report.trials[0]!.provider =
          report.trials[0]!.provider === "openai" ? "anthropic" : "openai";
      },
      async (root) => {
        const audit = await verifyBenchmarkRelease(root);

        expect(audit.findings).toContainEqual(
          expect.objectContaining({ kind: "trial-integrity" }),
        );
        expect(audit.status).toBe("fail");
      },
    );
  }, 60_000);

  it("rejects a schema-2 confidence interval that was not measured", async () => {
    await withV3Fixture(
      (report) => {
        report.hypotheses[0]!.accuracyDeltaCiLowerPercentagePoints = 99;
        report.hypotheses[0]!.accuracyImprovementGoalMet = true;
      },
      async (root) => {
        const audit = await verifyBenchmarkRelease(root);

        expect(audit.findings).toContainEqual(
          expect.objectContaining({ kind: "measurement-integrity" }),
        );
        expect(audit.status).toBe("fail");
      },
    );
  }, 60_000);

  it("rejects schema-2 per-model aggregates that do not match raw trials", async () => {
    await withV3Fixture(
      (report) => {
        const perModel = report.aggregates.find(({ model }) => model !== null)!;
        perModel.totalTokens += 1;
      },
      async (root) => {
        const audit = await verifyBenchmarkRelease(root);

        expect(audit.findings).toContainEqual(
          expect.objectContaining({ kind: "measurement-integrity" }),
        );
        expect(audit.status).toBe("fail");
      },
    );
  }, 60_000);

  it("rejects a schema-2 release without a recorded corpus commit", async () => {
    await withV3Fixture(
      (report) => {
        report.run.corpusCommit = null;
      },
      async (root) => {
        const audit = await verifyBenchmarkRelease(root);

        expect(audit.findings).toContainEqual(
          expect.objectContaining({ kind: "run-contract" }),
        );
        expect(audit.status).toBe("fail");
      },
    );
  }, 60_000);

  it("rejects a schema-2 release that narrowed the pre-registered protocol", async () => {
    await withV3Fixture(
      (report) => {
        report.run.overrides = ["repeats=1"];
      },
      async (root) => {
        const audit = await verifyBenchmarkRelease(root);

        expect(audit.findings).toContainEqual(
          expect.objectContaining({ kind: "publication-integrity" }),
        );
        expect(audit.status).toBe("fail");
      },
    );
  }, 60_000);

  it("rejects a schema-2 skip without a recorded reason", async () => {
    await withV3Fixture(
      (report) => {
        report.run.models[1] = {
          ...report.run.models[1]!,
          reason: "",
        };
      },
      async (root) => {
        const audit = await verifyBenchmarkRelease(root);

        expect(audit.findings).toContainEqual(
          expect.objectContaining({ kind: "run-contract" }),
        );
        expect(audit.status).toBe("fail");
      },
      { skipAnthropic: true },
    );
  }, 60_000);

  it("rejects a schema-2 publication whose Markdown was edited by hand", async () => {
    await withV3Fixture(
      () => undefined,
      async (root) => {
        const audit = await verifyBenchmarkRelease(root);

        expect(audit.findings).toContainEqual(
          expect.objectContaining({ kind: "publication-integrity" }),
        );
        expect(audit.status).toBe("fail");
      },
      { tamperMarkdown: true },
    );
  }, 60_000);

  it("rejects a schema-2 report that is not a real run", async () => {
    await withV3Fixture(
      (report) => {
        report.run.mode = "dry-run";
      },
      async (root) => {
        const audit = await verifyBenchmarkRelease(root);

        expect(audit.findings).toContainEqual(
          expect.objectContaining({ kind: "run-contract" }),
        );
        expect(audit.status).toBe("fail");
      },
    );
  }, 60_000);
});
