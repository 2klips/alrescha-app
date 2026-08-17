import { describe, expect, test } from "vitest";

import {
  FINDINGS,
  TOKENIZER_ASSUMPTION,
  filterFindings,
  renderSourceSpan,
  sourceForFinding,
} from "../apps/web/lib/assurance/fixtures";

describe("assurance surface models", () => {
  test("filters findings by type and severity without hiding evidence grade", () => {
    const result = filterFindings(FINDINGS, {
      kind: "missing-test",
      severity: "high",
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      grade: "inferred",
      id: "finding-missing-ci",
    });
    expect(result[0]!.evidence.map((step) => step.grade)).toEqual([
      "verified",
      "inferred",
      "broken",
    ]);
  });

  test("renders exact source span lines from fetched commit content", () => {
    const finding = FINDINGS[0]!;
    const source = sourceForFinding(finding.id);
    expect(source).toBeDefined();

    const rendered = renderSourceSpan(source!, finding.source);
    expect(
      rendered
        .filter((line) => line.highlighted)
        .map((line) => line.lineNumber),
    ).toEqual([203, 204, 205, 206, 207, 208]);
    expect(rendered.find((line) => line.lineNumber === 203)?.line).toContain(
      "MUST map",
    );
  });

  test("labels the tokenizer assumptions behind every lint token number", () => {
    expect(TOKENIZER_ASSUMPTION).toContain("cl100k_base-compatible");
    expect(TOKENIZER_ASSUMPTION).toContain("±8%");
  });
});
