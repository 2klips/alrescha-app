import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { verifyBenchmarkRelease } from "../scripts/verify-benchmark-report";
import type { BenchmarkReport } from "../scripts/databrain-benchmark/types";

const REPOSITORY_ROOT = resolve(import.meta.dirname, "..");

async function withBenchmarkFixture(
  mutate: (report: BenchmarkReport) => void,
  run: (root: string) => Promise<void>,
) {
  const root = await mkdtemp(join(tmpdir(), "specproof-benchmark-audit-"));

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
});
