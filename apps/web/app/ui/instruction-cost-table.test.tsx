import { buildInstructionCostTable } from "@alrescha/core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { HARNESS } from "../../lib/strings";
import { InstructionCostTable } from "./instruction-cost-table";

const table = () =>
  buildInstructionCostTable([
    {
      classification: "agents",
      id: "a1",
      path: "AGENTS.md",
      repositoryId: "repo-1",
      sizeBytes: 2_600,
    },
    {
      classification: "claude",
      id: "a2",
      path: "CLAUDE.md",
      repositoryId: "repo-1",
      sizeBytes: 440,
    },
    {
      classification: "agents",
      id: "a3",
      path: "apps/web/AGENTS.md",
      repositoryId: "repo-1",
      sizeBytes: 680,
    },
    {
      classification: "cursor_rule",
      id: "a4",
      path: ".cursor/rules/testing.mdc",
      repositoryId: "repo-1",
      sizeBytes: 200,
    },
  ]);

describe("instruction cost table (WORK_SPEC §5.2-③ 표1)", () => {
  test("states the tokenizer assumption in the header", () => {
    const html = renderToStaticMarkup(
      createElement(InstructionCostTable, { table: table() }),
    );

    // The spec asks for the assumption in the header, and the number under it
    // is a byte count divided by four — saying so is the whole point.
    expect(html).toContain(HARNESS.cost.assumption(4));
    expect(html).toContain("측정이 아니라 추정");
  });

  test("totals only what is loaded unconditionally", () => {
    const html = renderToStaticMarkup(
      createElement(InstructionCostTable, { table: table() }),
    );

    // 650 + 110. The nested AGENTS.md (170) and the Cursor rule (50) are
    // shown, and shown out of the total.
    expect(html).toContain("760");
    // The footer bytes belong to the always rows only: 2,600 + 440. Showing
    // the table total there would read as "3,920 bytes cost 760 tokens".
    expect(html).toContain("3,040");
    expect(html).toContain(HARNESS.cost.totals.always);
    expect(html).toContain(HARNESS.cost.totals.excludedDetail(170, 0, 50));
    expect(html).toContain(HARNESS.cost.totals.alwaysFiles(2));
  });

  test("shows the loading rule beside every row rather than asking for trust", () => {
    const html = renderToStaticMarkup(
      createElement(InstructionCostTable, { table: table() }),
    );

    expect(html).toContain("Codex reads the AGENTS.md chain");
    expect(html).toContain("only while working under apps/web");
    expect(html).toContain(HARNESS.cost.modes.conditional);
  });

  test("marks an unreadable Cursor rule unknown instead of guessing it", () => {
    const html = renderToStaticMarkup(
      createElement(InstructionCostTable, { table: table() }),
    );

    expect(html).toContain(HARNESS.cost.modes.unknown);
    expect(html).toContain("alwaysApply");
    expect(html).toContain(HARNESS.cost.perLoader("Cursor", 0, 0, 1, 1));
  });

  test("renders nothing at all when the repository has no harness", () => {
    expect(
      renderToStaticMarkup(
        createElement(InstructionCostTable, {
          table: buildInstructionCostTable([]),
        }),
      ),
    ).toBe("");
  });
});
