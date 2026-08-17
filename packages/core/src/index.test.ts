import { describe, expect, it } from "vitest";

import { CORE_PACKAGE_NAME } from "./index";

describe("core package", () => {
  it("exposes a stable package identity", () => {
    expect(CORE_PACKAGE_NAME).toBe("@arr/core");
  });
});
