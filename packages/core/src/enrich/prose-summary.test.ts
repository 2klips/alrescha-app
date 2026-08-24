import { describe, expect, it } from "vitest";

import {
  EnrichValidationError,
  SUMMARY_INPUT_MAX_CHARS,
  clipSummaryInput,
  selectFilesForSummarization,
  validateProseSummary,
} from "./prose-summary";

const SOURCE = [
  "import { createSession } from './session';",
  "",
  "export function loginWithGitHub(code: string) {",
  "  return createSession(exchangeCodeForToken(code));",
  "}",
].join("\n");

const PROSE =
  "This module owns the GitHub login flow: it exchanges the OAuth code for " +
  "a token and opens a session through the session module. It exports one " +
  "function and keeps no state of its own.";

describe("selectFilesForSummarization — the blob-hash cache predicate", () => {
  it("keeps files whose summary was computed from a different blob", () => {
    const picked = selectFilesForSummarization([
      { path: "a.ts", sourceBlobSha: "1", summaryBlobSha: "1" },
      { path: "b.ts", sourceBlobSha: "2", summaryBlobSha: "old" },
      { path: "c.ts", sourceBlobSha: "3", summaryBlobSha: null },
    ]);
    expect(picked.map(({ path }) => path)).toEqual(["b.ts", "c.ts"]);
  });

  it("selects nothing when every file is cached — the zero-credit case", () => {
    expect(
      selectFilesForSummarization([
        { path: "a.ts", sourceBlobSha: "1", summaryBlobSha: "1" },
      ]),
    ).toEqual([]);
  });
});

describe("clipSummaryInput", () => {
  it("passes short sources through untouched", () => {
    expect(clipSummaryInput("short")).toEqual({
      clipped: "short",
      truncated: false,
    });
  });

  it("clips at the cap and says so", () => {
    const long = "x".repeat(SUMMARY_INPUT_MAX_CHARS + 10);
    const result = clipSummaryInput(long);
    expect(result.clipped).toHaveLength(SUMMARY_INPUT_MAX_CHARS);
    expect(result.truncated).toBe(true);
  });
});

describe("validateProseSummary — prose only, never source", () => {
  it("accepts a plain prose paragraph", () => {
    expect(
      validateProseSummary({
        path: "a.ts",
        raw: { summary: PROSE },
        source: SOURCE,
      }),
    ).toBe(PROSE);
  });

  it("rejects output that misses the {summary} schema", () => {
    for (const raw of [null, "text", { summary: 7 }, {}]) {
      expect(() =>
        validateProseSummary({ path: "a.ts", raw, source: SOURCE }),
      ).toThrow(EnrichValidationError);
    }
  });

  it("rejects a summary that quotes a source line verbatim", () => {
    const smuggled = `${PROSE} The key line is import { createSession } from './session'; as shown.`;
    expect(() =>
      validateProseSummary({
        path: "a.ts",
        raw: { summary: smuggled },
        source: SOURCE,
      }),
    ).toThrow(/verbatim/);
  });

  it("rejects code fences and multi-line output", () => {
    expect(() =>
      validateProseSummary({
        path: "a.ts",
        raw: { summary: `${PROSE} \`\`\`ts code\`\`\`` },
        source: SOURCE,
      }),
    ).toThrow(/code fence/);
    expect(() =>
      validateProseSummary({
        path: "a.ts",
        raw: { summary: `${PROSE}\nSecond paragraph.` },
        source: SOURCE,
      }),
    ).toThrow(/single prose paragraph/);
  });

  it("soft-trims an overlong summary at a sentence boundary", () => {
    const sentence = "This sentence describes one more aspect of the module. ";
    const long = sentence.repeat(40).trim(); // ~2240 chars, sentence-shaped
    const trimmed = validateProseSummary({
      path: "a.ts",
      raw: { summary: long },
      source: SOURCE,
    });
    expect(trimmed.length).toBeLessThanOrEqual(1500);
    expect(trimmed.endsWith(".")).toBe(true);
  });

  it("rejects degenerate lengths in both directions", () => {
    expect(() =>
      validateProseSummary({
        path: "a.ts",
        raw: { summary: "Too short." },
        source: SOURCE,
      }),
    ).toThrow(/too short/);
    expect(() =>
      validateProseSummary({
        path: "a.ts",
        raw: { summary: "word ".repeat(400) },
        source: SOURCE,
      }),
    ).toThrow(/exceeds/);
  });

  it("carries the never-billed marker", () => {
    try {
      validateProseSummary({ path: "a.ts", raw: null, source: SOURCE });
      expect.unreachable();
    } catch (error) {
      expect((error as EnrichValidationError).code).toBe("schema_invalid");
    }
  });
});
