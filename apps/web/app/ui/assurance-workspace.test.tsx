import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { ASSURANCE } from "../../lib/strings";
import { AssuranceWorkspace } from "./assurance-workspace";

describe("assurance UI", () => {
  test("keeps inferred labels visible across a finding and its evidence chain", () => {
    const html = renderToStaticMarkup(
      createElement(AssuranceWorkspace, { surface: "findings" }),
    );

    expect(html).toContain(ASSURANCE.findings.chain.title);
    expect(html).toContain("grade-badge inferred");
    expect(html).toContain(ASSURANCE.findings.action.label);
  });

  test("shows lint assumptions and both contradiction source spans", () => {
    const html = renderToStaticMarkup(
      createElement(AssuranceWorkspace, { surface: "lint" }),
    );

    expect(html).toContain("cl100k_base-compatible tokenizer");
    expect(html).toContain("AGENTS.md:18-20");
    expect(html).toContain("apps/web/AGENTS.md:7-9");
    expect(html).toContain("grade-badge inferred");
  });

  test("locks receipt verdict until digest verification", () => {
    const html = renderToStaticMarkup(
      createElement(AssuranceWorkspace, { surface: "receipts" }),
    );

    expect(html).toContain(ASSURANCE.receipts.verification.pending);
    expect(html).toContain(ASSURANCE.receipts.verdict.locked);
    expect(html).not.toContain(ASSURANCE.receipts.verdict.label);
  });
});
