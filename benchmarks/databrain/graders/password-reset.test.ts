import { describe, expect, it } from "vitest";

import { createPasswordResetRequest } from "../src/password-reset";

describe("benchmark password reset request", () => {
  it("normalizes identity and expires after 15 minutes", () => {
    expect(createPasswordResetRequest(" USER@Example.COM ", 1_000)).toEqual({
      email: "user@example.com",
      expiresAt: 901_000,
    });
    expect(() => createPasswordResetRequest("   ", 1_000)).toThrow();
  });
});
