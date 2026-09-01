import { describe, expect, it } from "vitest";

import { resolveMcpUrlEnvironment } from "./environment";

describe("resolveMcpUrlEnvironment", () => {
  it("reads the canonical Alrescha variable", () => {
    expect(
      resolveMcpUrlEnvironment({
        ALRESCHA_MCP_URL: "https://mcp.alrescha.test",
      }),
    ).toBe("https://mcp.alrescha.test");
  });

  it("ignores the removed Arr variable", () => {
    expect(
      resolveMcpUrlEnvironment({ ARR_MCP_URL: "https://mcp.arr.test" }),
    ).toBeUndefined();
  });
});
