import { describe, expect, test } from "vitest";

import {
  RECEIPT_TOOL,
  digestInTotoStatement,
  inTotoStatementSchema,
  type InTotoStatement,
  verifyInTotoStatement,
} from "./receipts";

const statement: InTotoStatement = {
  _type: "https://in-toto.io/Statement/v1",
  predicate: {
    analyzedAt: "2026-08-26T00:00:00.000Z",
    commitSha: "b".repeat(40),
    coverage: { implVerified: 2, requirements: 4, testVerified: 1 },
    evidence: { inferred: 1, verified: 3 },
    previousReceiptDigest: null,
    repository: "2klips/alrescha-app",
    runId: "run-fixture-12",
    tool: RECEIPT_TOOL,
  },
  predicateType: "https://arr-app-web.vercel.app/receipt/v1",
  subject: [
    { digest: { sha1: "b".repeat(40) }, name: "git:commit" },
    { digest: { sha256: "a".repeat(64) }, name: "2klips/alrescha-app" },
  ],
};

describe("in-toto-shaped assurance receipts", () => {
  test("validates the locked Statement v1 shape", () => {
    expect(inTotoStatementSchema.parse(statement)).toEqual(statement);
    expect(() =>
      inTotoStatementSchema.parse({
        ...statement,
        predicate: {
          ...statement.predicate,
          tool: { name: "arr", version: "0.1.0" },
        },
      }),
    ).toThrow();
    expect(() =>
      inTotoStatementSchema.parse({ ...statement, _type: "custom" }),
    ).toThrow();
    // Earlier predicate types died before the first production receipt — old
    // dev statements must no longer validate.
    expect(() =>
      inTotoStatementSchema.parse({
        ...statement,
        predicateType: "https://arr.dev/receipt/v1",
      }),
    ).toThrow();
    expect(() =>
      inTotoStatementSchema.parse({
        ...statement,
        predicateType: "https://arr.tools/receipt/v1",
      }),
    ).toThrow();
    // The git:commit subject carries a sha1; a sha256 there is not the
    // reserved shape.
    expect(() =>
      inTotoStatementSchema.parse({
        ...statement,
        subject: [{ digest: { sha1: "zz" }, name: "git:commit" }],
      }),
    ).toThrow();
  });

  test("verifies canonical SHA-256 digest and detects tampering", async () => {
    const digest = await digestInTotoStatement(statement);

    await expect(
      verifyInTotoStatement(statement, digest),
    ).resolves.toMatchObject({ state: "verified" });
    await expect(
      verifyInTotoStatement(
        {
          ...statement,
          predicate: {
            ...statement.predicate,
            evidence: { inferred: 99, verified: 3 },
          },
        },
        digest,
      ),
    ).resolves.toMatchObject({ state: "tampered" });
  });

  test("reads pre-rename `arr` receipts back as verifiable, without issuing them (OQ-022 ⑴)", async () => {
    const legacy = {
      ...statement,
      predicate: {
        ...statement.predicate,
        tool: { name: "arr", version: "0.1.0" },
      },
    };
    // The issuance path stays pinned to the current name …
    expect(() => inTotoStatementSchema.parse(legacy)).toThrow();
    await expect(
      digestInTotoStatement(legacy as InTotoStatement),
    ).rejects.toThrow();
    // … while the read path digests the statement exactly as stored: the
    // tool name is inside the digest, so a legacy receipt verifies against
    // its own digest and is reported as a legacy issuer.
    const probe = await verifyInTotoStatement(legacy, "0".repeat(64));
    expect(probe.state).toBe("tampered");
    const legacyDigest = (probe as { actualDigest: string }).actualDigest;
    expect(legacyDigest).not.toBe(await digestInTotoStatement(statement));
    await expect(verifyInTotoStatement(legacy, legacyDigest)).resolves.toEqual({
      actualDigest: legacyDigest,
      state: "verified",
      toolName: "arr",
    });
    await expect(
      verifyInTotoStatement(statement, await digestInTotoStatement(statement)),
    ).resolves.toMatchObject({ state: "verified", toolName: "alrescha" });
    // Only the two known issuer names — anything else is not a receipt.
    await expect(
      verifyInTotoStatement(
        {
          ...statement,
          predicate: {
            ...statement.predicate,
            tool: { name: "someone-else", version: "0.1.0" },
          },
        },
        legacyDigest,
      ),
    ).resolves.toMatchObject({ state: "invalid" });
  });

  test("does not produce a verdict for an invalid statement", async () => {
    await expect(
      verifyInTotoStatement({ predicate: {} }, "0".repeat(64)),
    ).resolves.toMatchObject({
      state: "invalid",
    });
  });
});
