import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

// A raw NUL byte makes grep (and every tool built on it) classify a source file
// as binary and skip it without a word, which on a code-search product silently
// drops files from our own searches. A separator belongs in a string literal as
// the six-character escape "\u0000", never as the byte itself.
const REPO_ROOT = resolve(import.meta.dirname, "..");

function trackedSourceFiles(): string[] {
  const listing = execFileSync(
    "git",
    ["ls-files", "-z", "--", "*.ts", "*.tsx"],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  return listing.split("\u0000").filter((path) => path.length > 0);
}

function nulOffsets(path: string): number[] {
  const bytes = readFileSync(resolve(REPO_ROOT, path));
  const offsets: number[] = [];
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] === 0) offsets.push(index);
  }
  return offsets;
}

describe("source text integrity", () => {
  it("tracks at least one TypeScript file to scan", () => {
    expect(trackedSourceFiles().length).toBeGreaterThan(0);
  });

  it("has no tracked .ts/.tsx file containing a raw NUL byte", () => {
    const offenders = trackedSourceFiles()
      .map((path) => ({ path, offsets: nulOffsets(path) }))
      .filter((entry) => entry.offsets.length > 0)
      .map(
        (entry) =>
          `${entry.path} (${entry.offsets.length} at byte ${entry.offsets[0]})`,
      );

    expect(offenders).toEqual([]);
  });
});
