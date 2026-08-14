import { readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MANIFEST_PATTERN =
  /<!-- specproof-coverage:start -->\s*```json\s*([\s\S]*?)\s*```\s*<!-- specproof-coverage:end -->/;
const REQUIRED_BOUNDARIES = [
  "no-raw-code-storage",
  "no-inlining",
  "no-deprecated-mcp",
  "advisory-only-writes",
  "verified-inferred-separation",
  "no-charge-on-failure",
] as const;
const WORK_SPEC_BOUNDARIES = [
  ...REQUIRED_BOUNDARIES,
  "provenance-required",
  "no-false-precision",
  "minimal-github-permissions",
  "quality-gates-unsuppressed",
] as const;

type Proof = {
  assertion?: string;
  contains: string;
  kind: "test" | "browser-qa";
  path: string;
};

type MustHave = {
  id: string;
  proof: Proof;
  requirement: string;
  todo: number;
};

type MustNot = {
  boundary: string;
  id: string;
  proof: Proof & { assertion: string };
};

type TodoEvidence = {
  path: string;
  todo: number;
};

type CoverageManifest = {
  mustHaves: MustHave[];
  mustNots: MustNot[];
  schemaVersion: 1;
  todoEvidence: TodoEvidence[];
};

export type PlanCoverageReport = {
  evidenceCount: number;
  failures: string[];
  mustHaveCount: number;
  mustNotCount: number;
  requiredBoundaryCount: number;
  status: "fail" | "pass";
};

function safeProjectPath(
  root: string,
  path: string,
  failures: string[],
  label: string,
) {
  if (isAbsolute(path)) {
    failures.push(`${label}: path must be project-relative: ${path}`);
    return null;
  }

  const absolute = resolve(root, path);
  const projectRelative = relative(root, absolute);
  if (projectRelative.startsWith("..") || isAbsolute(projectRelative)) {
    failures.push(`${label}: path escapes project root: ${path}`);
    return null;
  }
  return absolute;
}

async function readableFile(path: string) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

async function nonEmptyFile(path: string) {
  try {
    return (await stat(path)).isFile() && (await stat(path)).size > 0;
  } catch {
    return false;
  }
}

function duplicateValues(values: string[]) {
  return values.filter((value, index) => values.indexOf(value) !== index);
}

export async function verifyPlanCoverage(
  planPath: string,
  projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url))),
): Promise<PlanCoverageReport> {
  const failures: string[] = [];
  const plan = await readableFile(planPath);
  let manifest: CoverageManifest | null = null;

  if (plan === null) {
    failures.push(`plan: file not found or unreadable: ${planPath}`);
  } else {
    const match = plan.match(MANIFEST_PATTERN);
    if (!match?.[1]) {
      failures.push("plan: missing specproof coverage JSON manifest");
    } else {
      try {
        manifest = JSON.parse(match[1]) as CoverageManifest;
      } catch (error) {
        failures.push(`plan: invalid coverage JSON: ${String(error)}`);
      }
    }
  }

  if (
    manifest === null ||
    manifest.schemaVersion !== 1 ||
    !Array.isArray(manifest.mustHaves) ||
    !Array.isArray(manifest.mustNots) ||
    !Array.isArray(manifest.todoEvidence)
  ) {
    if (manifest !== null)
      failures.push("plan: unsupported or incomplete coverage manifest");
    return {
      evidenceCount: 0,
      failures,
      mustHaveCount: 0,
      mustNotCount: 0,
      requiredBoundaryCount: 0,
      status: "fail",
    };
  }

  const expectedTodos = Array.from({ length: 22 }, (_, index) => index + 1);
  const mustHaveTodos = manifest.mustHaves.map(({ todo }) => todo);
  const evidenceTodos = manifest.todoEvidence.map(({ todo }) => todo);

  if (duplicateValues(manifest.mustHaves.map(({ id }) => id)).length > 0) {
    failures.push("must-haves: duplicate IDs");
  }
  if (
    manifest.mustHaves.length !== 22 ||
    expectedTodos.some((todo) => !mustHaveTodos.includes(todo))
  ) {
    failures.push("must-haves: todos 1-22 must each map to at least one proof");
  }

  for (const item of manifest.mustHaves) {
    const label = `must-have ${item.id}`;
    if (!item.requirement || !item.proof?.contains || !item.proof?.path) {
      failures.push(`${label}: incomplete proof mapping`);
      continue;
    }
    if (item.proof.kind !== "test" && item.proof.kind !== "browser-qa") {
      failures.push(`${label}: invalid proof kind: ${String(item.proof.kind)}`);
    }
    const proofPath = safeProjectPath(
      projectRoot,
      item.proof.path,
      failures,
      label,
    );
    if (proofPath === null) continue;
    const proof = await readableFile(proofPath);
    if (proof === null)
      failures.push(`${label}: proof file missing: ${item.proof.path}`);
    else if (!proof.includes(item.proof.contains)) {
      failures.push(
        `${label}: proof text missing in ${item.proof.path}: ${item.proof.contains}`,
      );
    }
  }

  if (duplicateValues(manifest.mustNots.map(({ id }) => id)).length > 0) {
    failures.push("must-nots: duplicate IDs");
  }

  const boundaryIds = new Set(manifest.mustNots.map(({ id }) => id));
  if (manifest.mustNots.length !== WORK_SPEC_BOUNDARIES.length) {
    failures.push(
      `must-nots: expected ${WORK_SPEC_BOUNDARIES.length} WORK_SPEC guardrails, found ${manifest.mustNots.length}`,
    );
  }
  for (const boundary of WORK_SPEC_BOUNDARIES) {
    if (!boundaryIds.has(boundary)) {
      failures.push(`must-not: WORK_SPEC boundary missing: ${boundary}`);
    }
  }

  for (const item of manifest.mustNots) {
    const label = `must-not ${item.id}`;
    if (
      !item.boundary ||
      !item.proof?.contains ||
      !item.proof?.assertion ||
      !item.proof?.path
    ) {
      failures.push(`${label}: incomplete negative assertion mapping`);
      continue;
    }
    if (item.proof.kind !== "test") {
      failures.push(`${label}: negative assertion proof must be a test`);
    }
    const proofPath = safeProjectPath(
      projectRoot,
      item.proof.path,
      failures,
      label,
    );
    if (proofPath === null) continue;
    const proof = await readableFile(proofPath);
    if (proof === null)
      failures.push(`${label}: proof file missing: ${item.proof.path}`);
    else {
      if (!proof.includes(item.proof.contains)) {
        failures.push(
          `${label}: scenario missing in ${item.proof.path}: ${item.proof.contains}`,
        );
      }
      if (!proof.includes(item.proof.assertion)) {
        failures.push(
          `${label}: negative assertion missing in ${item.proof.path}: ${item.proof.assertion}`,
        );
      }
    }
  }

  if (
    manifest.todoEvidence.length !== 22 ||
    expectedTodos.some((todo) => !evidenceTodos.includes(todo))
  ) {
    failures.push("evidence: todos 1-22 must each map to one evidence file");
  }
  if (
    duplicateValues(manifest.todoEvidence.map(({ todo }) => String(todo)))
      .length > 0
  ) {
    failures.push("evidence: duplicate todo mappings");
  }

  let evidenceCount = 0;
  for (const item of manifest.todoEvidence) {
    const label = `evidence todo ${item.todo}`;
    const evidencePath = safeProjectPath(
      projectRoot,
      item.path,
      failures,
      label,
    );
    if (evidencePath !== null && (await nonEmptyFile(evidencePath)))
      evidenceCount += 1;
    else if (evidencePath !== null)
      failures.push(`${label}: file missing or empty: ${item.path}`);
  }

  const buildPlanPath = resolve(projectRoot, "spec/BUILD_PLAN.md");
  const buildPlan = await readableFile(buildPlanPath);
  if (buildPlan === null) {
    failures.push("build-plan: spec/BUILD_PLAN.md missing");
  } else {
    for (const todo of expectedTodos) {
      if (!new RegExp(`- \\[x\\] ${todo}\\.`).test(buildPlan)) {
        failures.push(`build-plan: todo ${todo} is not checked`);
      }
    }
  }

  const requiredBoundaryCount = REQUIRED_BOUNDARIES.filter((id) =>
    boundaryIds.has(id),
  ).length;
  return {
    evidenceCount,
    failures,
    mustHaveCount: manifest.mustHaves.length,
    mustNotCount: manifest.mustNots.length,
    requiredBoundaryCount,
    status: failures.length === 0 ? "pass" : "fail",
  };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const planArgument = process.argv[2];
  if (!planArgument) {
    console.error("Usage: tsx scripts/verify-plan-coverage.ts <plan-path>");
    process.exitCode = 1;
  } else {
    const projectRoot = process.cwd();
    const report = await verifyPlanCoverage(
      resolve(projectRoot, planArgument),
      projectRoot,
    );
    if (report.status === "pass") {
      console.log(
        `PASS plan coverage: ${report.mustHaveCount} must-haves, ${report.mustNotCount} must-nots, ${report.evidenceCount} evidence files`,
      );
    } else {
      console.error(`FAIL plan coverage (${report.failures.length})`);
      for (const failure of report.failures) console.error(`- ${failure}`);
      process.exitCode = 1;
    }
  }
}
