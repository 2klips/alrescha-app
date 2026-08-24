import { describe, expect, it } from "vitest";

import type { EnrichValidationError } from "../index";
import {
  batchSummaries,
  conceptSynthesisDigest,
  mergeConceptBatches,
  slugifyConceptName,
  validateConceptSynthesis,
  type SynthesizedConcept,
} from "../index";

const KNOWN = new Set(["src/login.ts", "src/session.ts", "src/token.ts"]);

function rawConcept(overrides: Record<string, unknown> = {}) {
  return {
    kind: "concept",
    links: [],
    member_paths: ["src/login.ts"],
    name: "Auth Flow",
    summary: "Everything that turns an OAuth code into a live session.",
    ...overrides,
  };
}

describe("validateConceptSynthesis — the clean pass", () => {
  it("keeps a well-formed concept and resolves links to slugs and paths", () => {
    const concepts = validateConceptSynthesis({
      knownPaths: KNOWN,
      raw: {
        concepts: [
          rawConcept({
            links: [
              {
                relation: "uses",
                target_concept: null,
                target_path: "src/session.ts",
              },
              {
                relation: "part_of",
                target_concept: "Platform Core",
                target_path: null,
              },
            ],
          }),
          rawConcept({
            member_paths: ["src/token.ts"],
            name: "Platform Core",
          }),
        ],
      },
    });

    expect(concepts.map(({ slug }) => slug)).toEqual([
      "auth-flow",
      "platform-core",
    ]);
    expect(concepts[0]?.links).toEqual([
      { relation: "uses", target: { path: "src/session.ts" } },
      { relation: "part_of", target: { slug: "platform-core" } },
    ]);
  });

  it("discards open-vocabulary verbs, unknown paths, and anchorless concepts", () => {
    const concepts = validateConceptSynthesis({
      knownPaths: KNOWN,
      raw: {
        concepts: [
          rawConcept({
            links: [
              // Outside the closed seven → discarded, not guessed.
              {
                relation: "relates_to",
                target_concept: null,
                target_path: "src/session.ts",
              },
              // Unknown file → discarded.
              {
                relation: "uses",
                target_concept: null,
                target_path: "src/ghost.ts",
              },
            ],
          }),
          // No surviving members or links → the concept itself goes.
          rawConcept({ member_paths: ["src/ghost.ts"], name: "Ghost" }),
        ],
      },
    });

    expect(concepts).toHaveLength(1);
    expect(concepts[0]?.links).toEqual([]);
    expect(concepts[0]?.memberPaths).toEqual(["src/login.ts"]);
  });

  it("throws the never-billed marker on structural failure", () => {
    for (const raw of [null, "text", {}, { concepts: "nope" }]) {
      try {
        validateConceptSynthesis({ knownPaths: KNOWN, raw });
        expect.unreachable();
      } catch (error) {
        expect((error as EnrichValidationError).code).toBe("schema_invalid");
      }
    }
  });
});

describe("slug convergence", () => {
  it("slugifies deterministically across runs and spellings", () => {
    expect(slugifyConceptName("Auth Flow")).toBe("auth-flow");
    expect(slugifyConceptName("  AUTH   flow ")).toBe("auth-flow");
    expect(slugifyConceptName("결제 파이프라인")).toBe("결제-파이프라인");
  });

  it("merges batches by slug — no fragmentation at batch boundaries", () => {
    const half = (paths: string[], summary: string): SynthesizedConcept => ({
      kind: "concept",
      links: [],
      memberPaths: paths,
      name: "Auth Flow",
      slug: "auth-flow",
      summary,
    });
    const merged = mergeConceptBatches([
      [half(["src/login.ts"], "Short.")],
      [half(["src/session.ts"], "A longer summary that saw more files.")],
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.memberPaths).toEqual(["src/login.ts", "src/session.ts"]);
    expect(merged[0]?.summary).toContain("longer");
  });
});

describe("batching and freshness", () => {
  it("splits at the character cap without splitting a file", () => {
    const summaries = Array.from({ length: 6 }, (_, index) => ({
      blobSha: String(index),
      path: `src/f${index}.ts`,
      summary: "x".repeat(400),
    }));
    const batches = batchSummaries(summaries, 1_000);
    expect(batches.length).toBeGreaterThan(1);
    expect(batches.flat()).toHaveLength(6);
    for (const batch of batches) {
      const size = batch.reduce(
        (total, entry) => total + entry.path.length + entry.summary.length + 8,
        0,
      );
      expect(size).toBeLessThanOrEqual(1_000);
    }
  });

  it("digest is order-independent but blob-sensitive", () => {
    const a = { blobSha: "1", path: "a.ts", summary: "s" };
    const b = { blobSha: "2", path: "b.ts", summary: "s" };
    expect(conceptSynthesisDigest([a, b])).toBe(conceptSynthesisDigest([b, a]));
    expect(conceptSynthesisDigest([a, b])).not.toBe(
      conceptSynthesisDigest([{ ...a, blobSha: "9" }, b]),
    );
  });
});
