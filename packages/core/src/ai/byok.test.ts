import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { decryptByokKey, encryptByokKey } from "./byok";

describe("BYOK key envelope", () => {
  it("round-trips a provider key while persisted fields contain no plaintext", () => {
    const masterKey = randomBytes(32).toString("base64");
    const providerKey = "provider-secret-that-must-never-be-stored";

    const envelope = encryptByokKey({ masterKey, providerKey });

    expect(JSON.stringify(envelope)).not.toContain(providerKey);
    expect(envelope.algorithm).toBe("aes-256-gcm");
    expect(decryptByokKey({ envelope, masterKey })).toBe(providerKey);
  });
});
