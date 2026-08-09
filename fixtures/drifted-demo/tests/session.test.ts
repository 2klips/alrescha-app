import { describe, expect, it } from "vitest";

import { isSessionExpired, SESSION_TIMEOUT_MS } from "../src/session";

describe("REQ-AUTH-002 session expiry", () => {
  it("REQ-AUTH-002 expires at the exact 30-minute boundary", () => {
    const lastActivityAt = 1_700_000_000_000;

    expect(isSessionExpired({ lastActivityAt }, lastActivityAt + SESSION_TIMEOUT_MS - 1)).toBe(
      false,
    );
    expect(isSessionExpired({ lastActivityAt }, lastActivityAt + SESSION_TIMEOUT_MS)).toBe(true);
  });
});

