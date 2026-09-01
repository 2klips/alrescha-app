import { describe, expect, it } from "vitest";

import { MCP_PACKAGE_NAME } from "./index";

describe("mcp package", () => {
  it("exposes a stable package identity", () => {
    expect(MCP_PACKAGE_NAME).toBe("@alrescha/mcp");
  });
});
