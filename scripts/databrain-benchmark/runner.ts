import { createHash } from "node:crypto";

import { gradeBenchmarkOutput } from "./grading";
import type { ArmContext } from "./context";
import type {
  BenchmarkModel,
  BenchmarkTask,
  BenchmarkTrialResult,
  ImplementationTestRunner,
} from "./types";

function promptDigest(prompt: string): string {
  return createHash("sha256").update(prompt, "utf8").digest("hex");
}

export async function runBenchmarkTrial(input: {
  armContext: ArmContext;
  model: BenchmarkModel;
  modelName: string;
  now?: () => number;
  runImplementationTests: ImplementationTestRunner;
  task: BenchmarkTask;
  trial: number;
}): Promise<BenchmarkTrialResult> {
  const now = input.now ?? Date.now;
  const startedAt = now();
  const base = {
    arm: input.armContext.arm,
    model: input.modelName,
    promptDigest: promptDigest(input.task.prompt),
    taskId: input.task.id,
    toolCalls: input.armContext.toolNames.length,
    trial: input.trial,
  } as const;

  let response;
  try {
    response = await input.model.generate({
      arm: input.armContext.arm,
      context: input.armContext.text,
      model: input.modelName,
      prompt: input.task.prompt,
      taskId: input.task.id,
      trial: input.trial,
    });
  } catch (error) {
    return {
      ...base,
      error: "provider_failure",
      errorMessage:
        error instanceof Error
          ? error.message.slice(0, 300)
          : "Unknown provider failure",
      grade: null,
      inputTokens: 0,
      output: null,
      outputTokens: 0,
      responseId: null,
      status: "failed",
      wallTimeMs: Math.max(0, now() - startedAt),
    };
  }

  try {
    const grade = await gradeBenchmarkOutput({
      output: response.output,
      runImplementationTests: input.runImplementationTests,
      task: input.task,
    });
    return {
      ...base,
      error: null,
      errorMessage: null,
      grade,
      inputTokens: response.inputTokens,
      output: response.output,
      outputTokens: response.outputTokens,
      responseId: response.responseId,
      status: "completed",
      wallTimeMs: Math.max(0, now() - startedAt),
    };
  } catch (error) {
    return {
      ...base,
      error: "test_failure",
      errorMessage:
        error instanceof Error
          ? error.message.slice(0, 300)
          : "Unknown grading failure",
      grade: null,
      inputTokens: response.inputTokens,
      output: response.output,
      outputTokens: response.outputTokens,
      responseId: response.responseId,
      status: "failed",
      wallTimeMs: Math.max(0, now() - startedAt),
    };
  }
}
