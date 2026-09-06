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
    const sources = html.match(new RegExp(INSPECTION.sourcePrefix, "g"));
    // Seven widgets, seven sources — the risk map joined them in todo 21.
    expect(sources).toHaveLength(7);
    expect(html).toContain("npm audit --json ingest");
    expect(html).toContain("deterministic drift rules");
    expect(html).toContain("append-only ruled-out log");
    expect(html).toContain(
      "open findings, test edges, imports/calls fan-in, co-change",
    );
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

  it("ranks the files worth opening first, each with its reasons", () => {
    const html = render("busy");
    const entries = [
      ...html.matchAll(
        /class="inspection-risk-entry" data-level="([a-z]+)" data-score="([\d.]+)"/g,
      ),
    ];

    expect(entries.length).toBeGreaterThan(0);
    // Ranked, and the ranking is checkable: scores descend down the list.
    const scores = entries.map(([, , score]) => Number(score));
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    // The file two open findings anchor on, with no test edge, that three
    // others import, is the one the demo puts first.
    expect(html.indexOf("apps/web/lib/auth/tokens.ts")).toBeLessThan(
      html.indexOf("apps/web/lib/db/client.ts"),
    );
    // Every factor kind the map can produce is on the screen, in Korean, and
    // every entry carries at least one — a score with no reasons would be an
    // opinion with a decimal point.
    for (const label of Object.values(INSPECTION.risk.factors)) {
      expect(html).toContain(label);
    }
    expect(
      html.match(/class="inspection-risk-factor"/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(entries.length);
    // Never a verdict: the map is a place to look (ADR-001).
    expect(html).not.toContain(GRADE.verified);
    // …and the cut is stated rather than silent.
    expect(html).toContain(
      INSPECTION.risk.showing(
        entries.length,
        buildDemoInspectionDashboard("busy").risk.entries.length,
      ),
    );
  });

  it("greys the signal nobody measured instead of scoring it zero", () => {
    const html = render("busy");
    const grey = html.slice(html.indexOf('class="inspection-unmeasured"'));

    expect(grey).toContain(INSPECTION.risk.unmeasuredTitle);
    // No coverage report has been read for the demo workspace, and the
    // screen says so. "Measured, and clean" and "nobody looked" are
    // different answers, and only one of them is reassuring.
    expect(grey).toContain(INSPECTION.risk.unmeasured.coverage);
    // One signal on the grey line, not two: the audit *was* read, and the
    // widget beside this one is showing what it found.
    expect(
      buildDemoInspectionDashboard("busy").risk.unmeasured.map(
        ({ signal }) => signal,
      ),
    ).toEqual(["coverage"]);
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
    const insufficient = html.match(new RegExp(INSPECTION.insufficient, "g"));
    expect(insufficient).toHaveLength(7);
    // No fabricated numbers appear in the empty state.
    expect(html).not.toContain("0%");
    expect(html).not.toContain("0 / 0");
  });
});
