import type {
  BenchmarkGrade,
  BenchmarkModelOutput,
  BenchmarkTask,
  ImplementationTestRunner,
} from "./types";

function normalized(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, " ")
    .trim();
}

export async function gradeBenchmarkOutput(input: {
  output: BenchmarkModelOutput;
  runImplementationTests?: ImplementationTestRunner;
  task: BenchmarkTask;
}): Promise<BenchmarkGrade> {
  if (input.task.grader.kind === "test-pass") {
    if (!input.runImplementationTests) {
      throw new TypeError(
        "Implementation grading requires an isolated test runner.",
      );
    }
    const result = await input.runImplementationTests({
      files: input.output.files,
      task: input.task,
    });
    return {
      passed: result.passed,
      score: result.passed ? 1 : 0,
      summary: result.output,
    };
  }
  if (input.task.grader.kind === "findings-manifest") {
    const expected = new Set(
      input.task.grader.expectedFindings.map(normalized),
    );
    const actual = new Set(input.output.findings.map(normalized));
    const matched = [...expected].filter((finding) =>
      actual.has(finding),
    ).length;
    const unexpected = [...actual].filter(
      (finding) => !expected.has(finding),
    ).length;
    const precision = actual.size === 0 ? 0 : matched / actual.size;
    const recall = matched / expected.size;
    const score =
      precision + recall === 0
        ? 0
        : (2 * precision * recall) / (precision + recall);
    return {
      passed: matched === expected.size && unexpected === 0,
      score,
      summary: `${matched}/${expected.size} expected, ${unexpected} unexpected`,
    };
  }
  const answer = normalized(input.output.answer);
  const facts = input.task.grader.requiredFacts;
  const matched = facts.filter((aliases) =>
    aliases.some((alias) => answer.includes(normalized(alias))),
  ).length;
  const score = matched / facts.length;
  return {
    passed: score === 1,
    score,
    summary: `${matched}/${facts.length} required facts matched`,
  };
}
