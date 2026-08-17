import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { buildDemoInspectionDashboard } from "../../lib/inspection/fixtures";
import { GRADE, INSPECTION } from "../../lib/strings";
import { InspectionView } from "./inspection-view";

function render(state: "busy" | "empty"): string {
  return renderToStaticMarkup(
    createElement(InspectionView, {
      dashboard: buildDemoInspectionDashboard(state),
    }),
  );
}

describe("InspectionView", () => {
  it("labels every widget with its data source", () => {
    const html = render("busy");
    const sources = html.match(
      new RegExp(INSPECTION.sourcePrefix, "g"),
    );
    expect(sources).toHaveLength(6);
    expect(html).toContain("npm audit --json ingest");
    expect(html).toContain("deterministic drift rules");
    expect(html).toContain("append-only ruled-out log");
  });

  it("renders document summaries under the inferred badge only", () => {
    const html = render("busy");
    expect(html).toContain(GRADE.inferred);
    expect(html).toContain("에이전트 작업 규칙과 하네스 진입점을 정의합니다.");
    // A document without a summary says so instead of inventing one.
    expect(html).toContain(INSPECTION.documents.summaryMissing);
  });

  it("shows all three freshness labels from the demo data", () => {
    const html = render("busy");
    for (const label of Object.values(INSPECTION.documents.freshness)) {
      expect(html).toContain(label);
    }
  });

  it("renders the ingested audit with severity rows and the no-scanner note", () => {
    const html = render("busy");
    expect(html).toContain(INSPECTION.dependencyAudit.note);
    expect(html).toContain(INSPECTION.dependencyAudit.total(2));
    expect(html).toContain("minimist");
    expect(html).toContain("Prototype Pollution in minimist");
    expect(html).toContain(INSPECTION.dependencyAudit.fix.major);
  });

  it("keeps the repeated ruled-out hypothesis visible twice", () => {
    const html = render("busy");
    const occurrences = html.match(
      /워커 재시도 횟수를 올리면 스캔 실패가 사라진다/g,
    );
    expect(occurrences).toHaveLength(2);
  });

  it("shows 증거 부족 in every widget when nothing is stored", () => {
    const html = render("empty");
    const insufficient = html.match(
      new RegExp(INSPECTION.insufficient, "g"),
    );
    expect(insufficient).toHaveLength(6);
    // No fabricated numbers appear in the empty state.
    expect(html).not.toContain("0%");
    expect(html).not.toContain("0 / 0");
  });
});
