import { z } from "zod";

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);

export const inTotoSubjectSchema = z.strictObject({
  digest: z.strictObject({ sha256: sha256Schema }),
  name: z.string().min(1),
});

export const arrReceiptPredicateSchema = z.strictObject({
  commitSha: z.string().regex(/^[0-9a-f]{40}$/),
  evidence: z.strictObject({
    inferred: z.number().int().nonnegative(),
    verified: z.number().int().nonnegative(),
  }),
  previousReceiptDigest: sha256Schema.nullable(),
  repository: z.string().regex(/^[^/]+\/[^/]+$/),
  runId: z.string().min(1),
});

export const inTotoStatementSchema = z.strictObject({
  _type: z.literal("https://in-toto.io/Statement/v1"),
  predicate: arrReceiptPredicateSchema,
  predicateType: z.literal("https://arr.dev/receipt/v1"),
  subject: z.array(inTotoSubjectSchema).min(1),
});

export type InTotoStatement = z.infer<typeof inTotoStatementSchema>;

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([left], [right]) => left.localeCompare(right),
  );
  return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${canonicalize(child)}`).join(",")}}`;
}

export async function digestInTotoStatement(
  statement: InTotoStatement,
): Promise<string> {
  const parsed = inTotoStatementSchema.parse(statement);
  const encoded = new TextEncoder().encode(canonicalize(parsed));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export type ReceiptVerification =
  | { actualDigest: string; state: "verified" }
  | { actualDigest: string; expectedDigest: string; state: "tampered" }
  | { issues: readonly string[]; state: "invalid" };

export async function verifyInTotoStatement(
  statement: unknown,
  expectedDigest: string,
): Promise<ReceiptVerification> {
  const parsed = inTotoStatementSchema.safeParse(statement);
  if (!parsed.success) {
    return {
      issues: parsed.error.issues.map((issue) => issue.message),
      state: "invalid",
    };
  }
  const actualDigest = await digestInTotoStatement(parsed.data);
  return actualDigest === expectedDigest
    ? { actualDigest, state: "verified" }
    : { actualDigest, expectedDigest, state: "tampered" };
}
