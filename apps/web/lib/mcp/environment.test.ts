import { describe, expect, it } from "vitest";

import { resolveMcpUrlEnvironment } from "./environment";

describe("resolveMcpUrlEnvironment", () => {
  it("prefers the canonical Alrescha variable", () => {
    expect(
      resolveMcpUrlEnvironment({
        ALRESCHA_MCP_URL: "https://mcp.alrescha.test",
        ARR_MCP_URL: "https://mcp.arr.test",
      }),
    ).toBe("https://mcp.alrescha.test");
  });

  it("accepts the legacy Arr variable during migration", () => {
    expect(
      resolveMcpUrlEnvironment({ ARR_MCP_URL: "https://mcp.arr.test" }),
    ).toBe("https://mcp.arr.test");
  });
});
