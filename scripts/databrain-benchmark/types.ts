export const BENCHMARK_ARMS = ["checkout", "full-dump", "data-brain"] as const;
export type BenchmarkArm = (typeof BENCHMARK_ARMS)[number];

export type BenchmarkTaskType =
  "implementation" | "question-answering" | "drift-judgment";

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

export interface BenchmarkManifest {
  arms: BenchmarkArm[];
  model: string;
  schemaVersion: 1;
  tasks: BenchmarkTask[];
  trialsPerArm: number;
}

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

export interface BenchmarkTrialResult {
  arm: BenchmarkArm;
  error: "invalid_model_output" | "provider_failure" | "test_failure" | null;
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

export interface BenchmarkAggregate {
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

export interface BenchmarkReport {
  aggregates: BenchmarkAggregate[];
  hypothesis: {
    accuracyDeltaPercentagePoints: number | null;
    accuracyNonInferior: boolean;
    baselineArm: "checkout";
    dataBrainArm: "data-brain";
    targetTokenReductionPercent: 30;
    tokenReductionPercent: number | null;
    tokenTargetMet: boolean;
  };
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
  trials: BenchmarkTrialResult[];
}
