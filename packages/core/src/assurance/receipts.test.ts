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
    repository: "2klips/arr-app",
    runId: "run-fixture-12",
    tool: { name: "arr", version: "0.1.0" },
  },
  predicateType: "https://arr-app-web.vercel.app/receipt/v1",
  subject: [
    { digest: { sha1: "b".repeat(40) }, name: "git:commit" },
    { digest: { sha256: "a".repeat(64) }, name: "2klips/arr-app" },
  ],
};

describe("in-toto-shaped assurance receipts", () => {
  test("validates the locked Statement v1 shape", () => {
    const canonicalStatement: InTotoStatement = {
      ...statement,
      predicate: { ...statement.predicate, tool: RECEIPT_TOOL },
    };

    expect(inTotoStatementSchema.parse(canonicalStatement)).toEqual(
      canonicalStatement,
    );
    // Stored receipts issued before the rename remain verifiable.
    expect(inTotoStatementSchema.parse(statement)).toEqual(statement);
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

  test("does not produce a verdict for an invalid statement", async () => {
    await expect(
      verifyInTotoStatement({ predicate: {} }, "0".repeat(64)),
    ).resolves.toMatchObject({
      state: "invalid",
    });
  });
});
