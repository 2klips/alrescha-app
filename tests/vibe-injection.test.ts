import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  VIBE_METRICS,
  vibeGateResultsSchema,
} from "../packages/core/src/index";
import {
  aggregateMetric,
  countCorpusCitations,
  EXPERIMENT_NAME,
  HARNESS_VARIANTS,
  injectionInstruction,
  judgeVerdicts,
  pendingGateResults,
  planInjectionJobs,
  type InjectionTrialRecord,
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

  const trial = (
    overrides: Partial<InjectionTrialRecord>,
  ): InjectionTrialRecord => ({
    citations: null,
    errorMessage: null,
    inputTokens: 100,
    metric: "V2-finding-resolution-rate",
    model: "claude-sonnet-5",
    outputTokens: 50,
    passed: true,
    provider: "anthropic",
    responseId: "msg_1",
    score: 1,
    status: "succeeded",
    taskId: "t1",
    variant: "control",
    ...overrides,
  });

  it("counts DISTINCT corpus paths cited in the answer (V1 observable)", () => {
    const corpus = {
      entries: [
        { content: "", path: "src/auth.ts" },
        { content: "", path: "docs/spec.md" },
        { content: "", path: "src/session.ts" },
      ],
      root: "/x",
    };
    expect(
      countCorpusCitations(
        "근거는 src/auth.ts와 docs/spec.md, 다시 src/auth.ts.",
        corpus,
      ),
    ).toBe(2);
    expect(countCorpusCitations("no citations here", corpus)).toBe(0);
  });

  it("pairs control/injected per (task, model), dropping pairs with a failed side", () => {
    const trials = [
      trial({ score: 0.5, taskId: "t1", variant: "control" }),
      trial({ score: 1, taskId: "t1", variant: "injected" }),
      trial({ score: 0, status: "failed", taskId: "t2", variant: "control" }),
      trial({ score: 1, taskId: "t2", variant: "injected" }),
    ];
    const aggregate = aggregateMetric("V2-finding-resolution-rate", trials);
    expect(aggregate.pairCount).toBe(1);
    expect(aggregate.registeredPairCount).toBe(2);
    expect(aggregate.accuracyDelta).toBe(0.5);
  });

  it("V1 verdicts follow the pre-registered rule: metric↑ AND accuracy↑ adopts, metric↑ alone rejects", () => {
    const v1 = "V1-verified-evidence-ratio" as const;
    const adopted = judgeVerdicts([
      {
        accuracyDelta: 0.1,
        citationDelta: 1.5,
        controlAccuracy: 0.5,
        controlCitations: 1,
        injectedAccuracy: 0.6,
        injectedCitations: 2.5,
        metric: v1,
        pairCount: 8,
        registeredPairCount: 8,
      },
    ]);
    expect(adopted.verdicts.find(({ metric }) => metric === v1)?.status).toBe(
      "adopted",
    );

    const goodhart = judgeVerdicts([
      {
        accuracyDelta: -0.05,
        citationDelta: 2,
        controlAccuracy: 0.6,
        controlCitations: 1,
        injectedAccuracy: 0.55,
        injectedCitations: 3,
        metric: v1,
        pairCount: 8,
        registeredPairCount: 8,
      },
    ]);
    expect(goodhart.verdicts.find(({ metric }) => metric === v1)?.status).toBe(
      "rejected",
    );

    const unmoved = judgeVerdicts([
      {
        accuracyDelta: 0.2,
        citationDelta: 0,
        controlAccuracy: 0.5,
        controlCitations: 2,
        injectedAccuracy: 0.7,
        injectedCitations: 2,
        metric: v1,
        pairCount: 8,
        registeredPairCount: 8,
      },
    ]);
    expect(unmoved.verdicts.find(({ metric }) => metric === v1)?.status).toBe(
      "pending",
    );
  });

  it("V2–V7 can be rejected on accuracy harm but never adopted here (OQ-020)", () => {
    const v5 = "V5-receipt-chain-continuity" as const;
    const harmful = judgeVerdicts([
      {
        accuracyDelta: -0.1,
        citationDelta: null,
        controlAccuracy: 0.7,
        controlCitations: null,
        injectedAccuracy: 0.6,
        injectedCitations: null,
        metric: v5,
        pairCount: 8,
        registeredPairCount: 8,
      },
    ]);
    expect(harmful.verdicts.find(({ metric }) => metric === v5)?.status).toBe(
      "rejected",
    );

    const improved = judgeVerdicts([
      {
        accuracyDelta: 0.3,
        citationDelta: null,
        controlAccuracy: 0.5,
        controlCitations: null,
        injectedAccuracy: 0.8,
        injectedCitations: null,
        metric: v5,
        pairCount: 8,
        registeredPairCount: 8,
      },
    ]);
    const verdict = improved.verdicts.find(({ metric }) => metric === v5);
    expect(verdict?.status).toBe("pending");
    expect(verdict?.detail).toContain("OQ-020");
  });

  it("metrics with zero valid pairs stay pending — a failed run never fabricates a verdict", () => {
    const results = judgeVerdicts([]);
    for (const verdict of results.verdicts) {
      expect(verdict.status).toBe("pending");
    }
  });
});
