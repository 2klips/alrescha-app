import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

import type {
  ImplementationTestResult,
  ImplementationTestRunner,
} from "./types";

const execFileAsync = promisify(execFile);

function resolveInside(base: string, candidate: string, label: string): string {
  const absolute = resolve(base, candidate);
  const pathFromBase = relative(base, absolute);
  if (
    pathFromBase === "" ||
    (!pathFromBase.startsWith(`..${sep}`) &&
      pathFromBase !== ".." &&
      !isAbsolute(pathFromBase))
  ) {
    return absolute;
  }
  throw new TypeError(`${label} escapes its allowed directory: ${candidate}`);
}

function validateOutputPath(path: string): void {
  const normalized = path.replaceAll("\\", "/");
  if (
    isAbsolute(path) ||
    normalized === "src" ||
    !normalized.startsWith("src/") ||
    normalized.split("/").includes("..")
  ) {
    throw new TypeError(
      `Benchmark implementation may only write files under src/: ${path}`,
    );
  }
}

export async function runIsolatedImplementationTests(
  input: Parameters<ImplementationTestRunner>[0],
  repositoryRoot: string,
): Promise<ImplementationTestResult> {
  if (input.task.grader.kind !== "test-pass") {
    throw new TypeError(
      `Task ${input.task.id} does not use a test-pass grader.`,
    );
  }

  const resolvedRoot = resolve(repositoryRoot);
  const sourceRepository = resolveInside(
    resolvedRoot,
    input.task.repository,
    "Repository",
  );
  const graderSource = resolveInside(
    resolvedRoot,
    input.task.grader.testPath,
    "Grader",
  );
  await readFile(graderSource, "utf8");

  const temporaryParent = resolve(resolvedRoot, "node_modules");
  await mkdir(temporaryParent, { recursive: true });
  const temporaryRepository = await mkdtemp(
    resolve(temporaryParent, ".arr-databrain-benchmark-"),
  );

  try {
    await cp(sourceRepository, temporaryRepository, {
      filter(source) {
        const name = source.replaceAll("\\", "/");
        return (
          !name.includes("/node_modules/") &&
          !name.endsWith("/node_modules") &&
          !name.includes("/.reports/") &&
          !name.endsWith("/.reports")
        );
      },
      recursive: true,
    });

    for (const file of input.files) {
      validateOutputPath(file.path);
      const target = resolveInside(
        temporaryRepository,
        file.path,
        "Model output",
      );
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.content, "utf8");
    }

    const graderTarget = resolve(
      temporaryRepository,
      "tests/databrain-benchmark.test.ts",
    );
    await mkdir(dirname(graderTarget), { recursive: true });
    await cp(graderSource, graderTarget);

    const vitestEntry = resolve(resolvedRoot, "node_modules/vitest/vitest.mjs");
    try {
      await execFileAsync(
        process.execPath,
        [
          vitestEntry,
          "run",
          graderTarget,
          "--config",
          resolve(temporaryRepository, "vitest.config.ts"),
        ],
        {
          cwd: temporaryRepository,
          encoding: "utf8",
          maxBuffer: 2 * 1024 * 1024,
          timeout: 30_000,
        },
      );
      return { output: "passed", passed: true };
    } catch {
      return { output: "failed", passed: false };
    }
  } finally {
    const allowedPrefix = `${temporaryParent}${sep}`;
    if (temporaryRepository.startsWith(allowedPrefix)) {
      await rm(temporaryRepository, { force: true, recursive: true });
    }
  }
}
