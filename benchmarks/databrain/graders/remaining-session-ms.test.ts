import { describe, expect, it } from "vitest";

import { remainingSessionMs, SESSION_TIMEOUT_MS } from "../src/session";

describe("benchmark remainingSessionMs", () => {
  it("clamps remaining time at timeout", () => {
    const session = { lastActivityAt: 1_000 };
    expect(remainingSessionMs(session, 1_000)).toBe(SESSION_TIMEOUT_MS);
    expect(remainingSessionMs(session, 1_000 + SESSION_TIMEOUT_MS - 9)).toBe(9);
    expect(remainingSessionMs(session, 1_000 + SESSION_TIMEOUT_MS)).toBe(0);
    expect(remainingSessionMs(session, 1_000 + SESSION_TIMEOUT_MS + 1)).toBe(0);
  });
});
