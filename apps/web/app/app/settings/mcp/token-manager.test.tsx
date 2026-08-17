import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SETTINGS } from "../../../../lib/strings";
import { McpTokenManager } from "./token-manager";

describe("MCP token settings", () => {
  it("renders scoped issuance controls without exposing stored token secrets", () => {
    const html = renderToStaticMarkup(
      createElement(McpTokenManager, {
        tokens: [
          {
            createdAt: "2026-08-11T10:00:00.000Z",
            expiresAt: null,
            id: "01J0000000000000000000000M",
            lastUsedAt: "2026-08-11T10:01:00.000Z",
            name: "Codex",
            revokedAt: null,
            scopes: ["mcp:read", "mcp:write"],
            tokenPrefix: "sp_mcp_demo",
            userId: "user-owner",
            workspaceId: "workspace-owner",
          },
          {
            createdAt: "2026-08-10T10:00:00.000Z",
            expiresAt: null,
            id: "01J0000000000000000000000N",
            lastUsedAt: null,
            name: "Old agent",
            revokedAt: "2026-08-11T09:00:00.000Z",
            scopes: ["mcp:read"],
            tokenPrefix: "sp_mcp_old1",
            userId: "user-owner",
            workspaceId: "workspace-owner",
          },
        ],
      }),
    );

    expect(html).toContain(SETTINGS.mcp.tokens.issueTitle);
    expect(html).toContain('name="scopes"');
    expect(html).toContain('value="mcp:read"');
    expect(html).toContain('value="mcp:write"');
    expect(html).toContain("sp_mcp_demo…");
    expect(html).toContain(
      SETTINGS.mcp.tokens.lastUsed(
        SETTINGS.mcp.tokens.withUtc("2026-08-11 10:01"),
      ),
    );
    expect(html).toContain(SETTINGS.mcp.tokens.revoked);
    expect(html).not.toContain("tokenHash");
    expect(html).not.toContain("sp_mcp_demo_secret");
  });
});
