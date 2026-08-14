import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { AssuranceWorkspace } from "./assurance-workspace";

describe("assurance UI", () => {
  test("keeps inferred labels visible across a finding and its evidence chain", () => {
    const html = renderToStaticMarkup(createElement(AssuranceWorkspace, { surface: "findings" }));

    expect(html).toContain("Evidence chain");
    expect(html).toContain("grade-badge inferred");
    expect(html).toContain("Suggested next action");
  });

  test("shows lint assumptions and both contradiction source spans", () => {
    const html = renderToStaticMarkup(createElement(AssuranceWorkspace, { surface: "lint" }));

    expect(html).toContain("cl100k_base-compatible tokenizer");
    expect(html).toContain("AGENTS.md:18-20");
    expect(html).toContain("apps/web/AGENTS.md:7-9");
    expect(html).toContain("grade-badge inferred");
  });

  test("locks receipt verdict until digest verification", () => {
    const html = renderToStaticMarkup(createElement(AssuranceWorkspace, { surface: "receipts" }));

    expect(html).toContain("Not verified");
    expect(html).toContain("Verdict locked until digest verification succeeds.");
    expect(html).not.toContain("Verified receipt verdict");
  });
});
