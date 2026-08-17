import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { VIBE_METRICS, vibeGateResultsSchema } from "../packages/core/src/index";
import {
  EXPERIMENT_NAME,
  HARNESS_VARIANTS,
  injectionInstruction,
  pendingGateResults,
  planInjectionJobs,
} from "../scripts/vibe-injection-experiment";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

describe("VIBE harness-injection experiment (todo 13)", () => {
  it("plans the full pre-registered grid: metrics × 2 harnesses × 2 models × tasks", () => {
    const models = [
      { id: "claude-sonnet-5", provider: "anthropic" as const },
      { id: "gpt-5.6-luna", provider: "openai" as const },
    ];
    const tasks = Array.from({ length: 4 }, (_, index) => ({
      grader: { kind: "answer-manifest" as const, requiredFacts: [["x"]] },
      id: `hidden-${index}`,
      prompt: "질문",
      repository: "fixtures/drifted-demo",
      retrievalQuery: "auth",
      type: "question-answering" as const,
    }));
    const jobs = planInjectionJobs(models, tasks);
    expect(jobs).toHaveLength(VIBE_METRICS.length * 2 * 2 * 4);
    // Every metric appears in both harness variants for both models.
    for (const metric of VIBE_METRICS) {
      for (const variant of HARNESS_VARIANTS) {
        for (const model of models) {
          expect(
            jobs.filter(
              (job) =>
                job.metric === metric &&
                job.variant === variant &&
                job.model.id === model.id,
            ),
          ).toHaveLength(4);
        }
      }
    }
  });

  it("gives every metric a concrete injection instruction", () => {
    const instructions = VIBE_METRICS.map(injectionInstruction);
    expect(new Set(instructions).size).toBe(VIBE_METRICS.length);
    for (const instruction of instructions) {
      expect(instruction).toMatch(/높여라|늘려라/);
    }
  });

  it("publishes a pending verdict per metric until real models run — never a fabricated pass", () => {
    const results = pendingGateResults();
    expect(results.experiment).toBe(EXPERIMENT_NAME);
    expect(results.verdicts).toHaveLength(VIBE_METRICS.length);
    for (const verdict of results.verdicts) {
      expect(verdict.status).toBe("pending");
      expect(verdict.detail).toContain("지표↑ AND 숨긴 정답 정확도↑");
    }
  });

  it("the committed gate file parses, matches the schema, and drives todo 12", () => {
    const published = vibeGateResultsSchema.parse(
      JSON.parse(
        readFileSync(`${repoRoot}/benchmarks/vibe/gate-results.json`, "utf8"),
      ),
    );
    expect(published.verdicts.map(({ metric }) => metric).sort()).toEqual(
      [...VIBE_METRICS].sort(),
    );
    const markdown = readFileSync(
      `${repoRoot}/benchmarks/vibe/vibe-injection.dry-run.md`,
      "utf8",
    );
    // The verdict record is public regardless of outcome (ADR-011-7).
    expect(markdown).toContain("판정 기록");
    expect(markdown).toContain("112 시행");
  });
});
