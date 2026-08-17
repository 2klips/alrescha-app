import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { buildDemoCommitCards } from "../../lib/commits/fixtures";
import { COMMITS } from "../../lib/strings";
import { CommitAnalysisBoard } from "./commit-cards";

function render(state: "busy" | "empty", selectedRunId: string | null = null) {
  const cards = buildDemoCommitCards(state);
  return renderToStaticMarkup(
    createElement(CommitAnalysisBoard, {
      cards,
      selectedRunId: selectedRunId ?? cards[0]?.runId ?? null,
      stateQuery: state === "empty" ? "empty" : null,
    }),
  );
}

describe("CommitAnalysisBoard", () => {
  it("renders one card per demo run with every status represented", () => {
    const html = render("busy");
    for (const label of Object.values(COMMITS.statuses)) {
      expect(html).toContain(label);
    }
    expect(html).toContain('data-card-status="pending"');
    expect(html).toContain('data-card-status="analyzing"');
    expect(html).toContain('data-card-status="failed"');
    expect(html).toContain('data-card-status="completed"');
  });

  it("shows the stored failure reason verbatim on the failed card", () => {
    const html = render("busy", "run-03");
    expect(html).toContain(COMMITS.detail.failureLabel);
    expect(html).toContain("worker lease expired");
  });

  it("escapes markup inside a failure reason instead of interpreting it", () => {
    const cards = buildDemoCommitCards("busy").map((card) =>
      card.status === "failed"
        ? { ...card, failureReason: '<script>alert("x")</script> 502' }
        : card,
    );
    const failed = cards.find((card) => card.status === "failed")!;
    const html = renderToStaticMarkup(
      createElement(CommitAnalysisBoard, {
        cards,
        selectedRunId: failed.runId,
        stateQuery: null,
      }),
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("links the completed card to its receipt and shows the delta", () => {
    const html = render("busy", "run-02");
    expect(html).toContain("/receipts?receipt=receipt-current");
    expect(html).toContain(COMMITS.card.delta(3, 1));
    expect(html).toContain(COMMITS.card.openTotal(7));
  });

  it("does not fabricate a duration or delta for a pending card", () => {
    const html = render("busy", "run-05");
    expect(html).toContain(COMMITS.card.durationNotMeasured);
    expect(html).toContain(COMMITS.card.deltaPending);
  });

  it("renders the empty state without a card list", () => {
    const html = render("empty");
    expect(html).toContain(COMMITS.list.empty.title);
    expect(html).toContain(COMMITS.list.empty.body);
    expect(html).not.toContain("commit-card-list");
  });
});
