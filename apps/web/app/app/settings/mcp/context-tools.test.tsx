import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ContextTools } from "./context-tools";

describe("context and index settings", () => {
  it("renders the pack composer and permission fallback with a diff-only proposal", () => {
    const html = renderToStaticMarkup(
      createElement(ContextTools, {
        initialContextState: { error: null, pack: null },
        initialProposalState: {
          error: null,
          files: [
            {
              after:
                "<!-- SPECPROOF:BEGIN (managed — do not edit inside) -->\nindex\n<!-- SPECPROOF:END -->\n",
              before: null,
              path: "AGENTS.md",
            },
          ],
          missingPermission: "pull_requests:write",
          repository: "2klips/specproof-app",
          status: "permission_required",
          url: null,
        },
      }),
    );

    expect(html).toContain("Compose context pack");
    expect(html).toContain('name="targetAgent"');
    expect(html).toContain('value="claude-code"');
    expect(html).toContain('value="codex"');
    expect(html).toContain('value="cursor"');
    expect(html).toContain("Create advisory PR");
    expect(html).toContain("Diff-only proposal");
    expect(html).toContain("Grant pull request permission");
    expect(html).toContain("Copy files manually");
    expect(html).toContain("AGENTS.md");
    expect(html).not.toContain("commit to main");
  });
});
