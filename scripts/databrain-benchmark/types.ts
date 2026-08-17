export const BENCHMARK_ARMS = ["checkout", "full-dump", "data-brain"] as const;
/**
 * Schema-3 routing experiment (Phase 2B todo 5): grep-only retrieval vs
 * graph-only traversal vs the deterministic router picking per question.
 * `BENCHMARK_ARMS` stays byte-identical — the frozen v1/v2 manifests hash
 * over it.
 */
export const ROUTING_ARMS = ["grep-only", "graph-only", "routed"] as const;
export type RoutingArm = (typeof ROUTING_ARMS)[number];
export type BenchmarkArm = (typeof BENCHMARK_ARMS)[number] | RoutingArm;

export const BENCHMARK_PROVIDERS = ["anthropic", "openai"] as const;
export type BenchmarkProvider = (typeof BENCHMARK_PROVIDERS)[number];

export type BenchmarkTaskType =
  | "implementation"
  | "question-answering"
  | "drift-judgment"
  | "policy-audit";

export type BenchmarkCorpus = "fixture" | "realistic";

export type BenchmarkGrader =
  | { kind: "answer-manifest"; requiredFacts: string[][] }
  | { kind: "findings-manifest"; expectedFindings: string[] }
  | { kind: "test-pass"; testPath: string };

export interface BenchmarkTask {
  grader: BenchmarkGrader;
  id: string;
  prompt: string;
  repository: string;
  retrievalQuery: string;
  type: BenchmarkTaskType;
}

export interface BenchmarkModelSpec {
  id: string;
  provider: BenchmarkProvider;
}

/**
 * Schema 1 is the frozen pre-registration that produced the published
 * `results.real.json` release. Its object shape must never change: the release
 * digest is the SHA-256 of `JSON.stringify(manifest)`.
 */
export interface BenchmarkManifestV1 {
  arms: BenchmarkArm[];
  model: string;
  schemaVersion: 1;
  tasks: BenchmarkTask[];
  trialsPerArm: 3;
}

/** Schema 2 adds multi-model execution and raises repeats from 3 to 5. */
export interface BenchmarkManifestV2 {
  arms: BenchmarkArm[];
  models: BenchmarkModelSpec[];
  schemaVersion: 2;
  tasks: BenchmarkTask[];
  trialsPerArm: 5;
}

/**
 * Schema 3 — the routing experiment. Same interval-based gates as schema 2;
 * the hypothesis pairs `grep-only` (baseline) against `routed` (treatment).
 */
export interface BenchmarkManifestV3 {
  arms: RoutingArm[];
  models: BenchmarkModelSpec[];
  schemaVersion: 3;
  tasks: BenchmarkTask[];
  trialsPerArm: 5;
}

export type BenchmarkManifest =
  | BenchmarkManifestV1
  | BenchmarkManifestV2
  | BenchmarkManifestV3;

export interface BenchmarkModelOutput {
  answer: string;
  files: Array<{ content: string; path: string }>;
  findings: string[];
}

export interface BenchmarkGrade {
  passed: boolean;
  score: number;
  summary: string;
}

export interface ImplementationTestResult {
  output: string;
  passed: boolean;
}

export type ImplementationTestRunner = (input: {
  files: BenchmarkModelOutput["files"];
  task: BenchmarkTask;
}) => Promise<ImplementationTestResult>;

export interface BenchmarkModelResponse {
  inputTokens: number;
  output: BenchmarkModelOutput;
  outputTokens: number;
  responseId: string;
}

export interface BenchmarkModel {
  generate(input: {
    arm: BenchmarkArm;
    context: string;
    model: string;
    prompt: string;
    taskId: string;
    trial: number;
  }): Promise<BenchmarkModelResponse>;
}

export type BenchmarkTrialError =
  | "invalid_model_output"
  | "provider_failure"
  | "test_failure";

/** Frozen schema-1 trial record (published release, audit-only). */
export interface BenchmarkTrialResultV1 {
  arm: BenchmarkArm;
  error: BenchmarkTrialError | null;
  errorMessage: string | null;
  grade: BenchmarkGrade | null;
  inputTokens: number;
  model: string;
  output: BenchmarkModelOutput | null;
  outputTokens: number;
  promptDigest: string;
  responseId: string | null;
  status: "completed" | "failed";
  taskId: string;
  toolCalls: number;
  trial: number;
  wallTimeMs: number;
}

export interface BenchmarkTrialResult extends BenchmarkTrialResultV1 {
  provider: BenchmarkProvider;
}

/** Frozen schema-1 aggregate (published release, audit-only). */
export interface BenchmarkAggregateV1 {
  arm: BenchmarkArm;
  failedTrials: number;
  meanScore: number;
  passedTrials: number;
  passRate: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalToolCalls: number;
  totalWallTimeMs: number;
  trialCount: number;
}

export interface BenchmarkAggregate {
  arm: BenchmarkArm;
  failedTrials: number;
  meanScore: number;
  meanScoreCiLower: number | null;
  meanScoreCiUpper: number | null;
  /** `null` aggregates every executed model; otherwise a single model id. */
  model: string | null;
  passRate: number;
  passedTrials: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalToolCalls: number;
  totalWallTimeMs: number;
  trialCount: number;
}

export interface BenchmarkHypothesisV1 {
  accuracyDeltaPercentagePoints: number | null;
  accuracyNonInferior: boolean;
  baselineArm: "checkout";
  dataBrainArm: "data-brain";
  targetTokenReductionPercent: 30;
  tokenReductionPercent: number | null;
  tokenTargetMet: boolean;
}

/**
 * Schema 2 evaluates the gate against the confidence interval rather than the
 * point estimate: non-inferiority requires the accuracy delta lower bound to
 * clear the -5pp margin, the improvement goal requires it to clear +5pp, and
 * the token target requires the token-reduction lower bound to clear 30%.
 */
export interface BenchmarkHypothesis {
  accuracyDeltaCiLowerPercentagePoints: number | null;
  accuracyDeltaCiUpperPercentagePoints: number | null;
  accuracyDeltaPercentagePoints: number | null;
  accuracyImprovementGoalMet: boolean;
  accuracyNonInferior: boolean;
  /** "checkout" for schema 1/2 runs; "grep-only" for the routing experiment. */
  baselineArm: BenchmarkArm;
  /** "data-brain" for schema 1/2 runs; "routed" for the routing experiment. */
  dataBrainArm: BenchmarkArm;
  /** `null` pools every executed model; otherwise a single model id. */
  model: string | null;
  pairedUnitCount: number;
  targetTokenReductionPercent: 30;
  tokenReductionCiLowerPercent: number | null;
  tokenReductionCiUpperPercent: number | null;
  tokenReductionPercent: number | null;
  tokenTargetMet: boolean;
}

export interface BenchmarkRunModel {
  id: string;
  provider: BenchmarkProvider;
  /** Non-null only when the model was skipped. */
  reason: string | null;
  status: "executed" | "skipped";
}

/** Frozen schema-1 report (published release, audit-only). */
export interface BenchmarkReportV1 {
  aggregates: BenchmarkAggregateV1[];
  hypothesis: BenchmarkHypothesisV1;
  protocol: {
    arms: BenchmarkArm[];
    expectedTrialCount: number;
    taskCount: number;
    trialsPerArm: number;
  };
  run: {
    generatedAt: string;
    manifestDigest: string;
    mode: "dry-run" | "real";
    model: string;
    tokenizerAssumption: string;
  };
  schemaVersion: 1;
  trials: BenchmarkTrialResultV1[];
}

export interface BenchmarkReportV2 {
  /** Pooled arm rows first, then one block per executed model. */
  aggregates: BenchmarkAggregate[];
  /** Pooled hypothesis first, then one per executed model. */
  hypotheses: BenchmarkHypothesis[];
  protocol: {
    arms: BenchmarkArm[];
    /** Trials actually scheduled after model skips and CLI overrides. */
    expectedTrialCount: number;
    fixtureTaskCount: number;
    realisticTaskCount: number;
    /** Trials the pre-registered manifest defines for every model. */
    registeredTrialCount: number;
    taskCount: number;
    trialsPerArm: number;
  };
  run: {
    confidenceMethod: string;
    /**
     * `git rev-parse HEAD` of the working tree the realistic-repository
     * context was read from (ADR-012 §6). Null only when git is unavailable;
     * the F5 audit rejects a release without it.
     */
    corpusCommit: string | null;
    generatedAt: string;
    manifestDigest: string;
    mode: "dry-run" | "real";
    models: BenchmarkRunModel[];
    /** Human-readable CLI narrowing; empty for a publishable release run. */
    overrides: string[];
    resultsBasename: string;
    tokenizerAssumption: string;
  };
  schemaVersion: 2;
  trials: BenchmarkTrialResult[];
}

export type BenchmarkReport = BenchmarkReportV1 | BenchmarkReportV2;
