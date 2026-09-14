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
    // Eight widgets, eight sources — the risk map joined them in todo 21,
    // the dismissed board in todo 19 ⑷.
    expect(sources).toHaveLength(8);
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

describe("InspectionView — finding detail and dismissal (todo 19 ⑶ ⑷)", () => {
  it("renders the stored detail of a finding: spans, confidence with its grade, reason, action", () => {
    const html = render("busy");
    expect(html).toContain("docs/auth.md:12");
    expect(html).toContain(INSPECTION.findings.detail.confidence(98));
    expect(html).toContain("deterministic stale-doc rule");
    expect(html).toContain("문서의 경로·심볼 참조를 갱신하거나 지우세요.");
    expect(html).toContain(INSPECTION.findings.detail.spanLabel);
    expect(html).toContain(INSPECTION.findings.detail.actionLabel);
    // A finding whose row carries no provenance shows no detail block of its
    // own — nothing is computed on the screen.
    const claim = html.slice(
      html.indexOf('data-finding-id="finding-claim"'),
      html.indexOf('data-finding-id="finding-stale"'),
    );
    expect(claim).not.toContain("inspection-finding-detail");
  });

  it("keeps a dismissed finding on the board with its reason, apart from the open ones", () => {
    const html = render("busy");
    const dismissed = html.slice(
      html.indexOf('data-testid="inspection-dismissed"'),
    );
    expect(dismissed).toContain(INSPECTION.dismissed.title);
    expect(dismissed).toContain(INSPECTION.dismissed.count(1));
    expect(dismissed).toContain(
      "docs/runbook.md가 어떤 노드와도 연결되지 않았습니다",
    );
    expect(dismissed).toContain(INSPECTION.dismissed.reasonLabel);
    expect(dismissed).toContain("운영 런북은 코드와 링크하지 않기로 했습니다");
    // The open-findings widget does not list it; the resolved one is not
    // dismissed either.
    const open = html.slice(
      html.indexOf('data-testid="inspection-findings"'),
      html.indexOf('data-testid="inspection-dismissed"'),
    );
    expect(open).not.toContain("docs/runbook.md");
    expect(open).toContain(INSPECTION.findings.count(3));
  });

  it("says 제외한 발견 없음 rather than 증거 부족 when nobody dismissed anything", () => {
    const html = render("empty");
    expect(html).toContain(INSPECTION.dismissed.empty);
    // Seven widgets short of evidence, and the eighth is simply empty.
    expect(html.match(/inspection-insufficient/g)).toHaveLength(7);
  });
});
