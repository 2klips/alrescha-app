import { describe, expect, test } from "vitest";

import {
  digestInTotoStatement,
  inTotoStatementSchema,
  type InTotoStatement,
  verifyInTotoStatement,
} from "./receipts";

const statement: InTotoStatement = {
  _type: "https://in-toto.io/Statement/v1",
  predicate: {
    commitSha: "b".repeat(40),
    evidence: { inferred: 1, verified: 3 },
    previousReceiptDigest: null,
    repository: "2klips/arr-app",
    runId: "run-fixture-12",
  },
  predicateType: "https://arr.dev/receipt/v1",
  subject: [{ digest: { sha256: "a".repeat(64) }, name: "2klips/arr-app" }],
};

describe("in-toto-shaped assurance receipts", () => {
  test("validates the locked Statement v1 shape", () => {
    expect(inTotoStatementSchema.parse(statement)).toEqual(statement);
    expect(() =>
      inTotoStatementSchema.parse({ ...statement, _type: "custom" }),
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

  test("does not produce a verdict for an invalid statement", async () => {
    await expect(
      verifyInTotoStatement({ predicate: {} }, "0".repeat(64)),
    ).resolves.toMatchObject({
      state: "invalid",
    });
  });
});
