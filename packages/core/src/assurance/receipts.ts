import { z } from "zod";

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const sha1Schema = z.string().regex(/^[0-9a-f]{40}$/);

/**
 * The production predicate type, adopted 2026-08-26 when the first Vercel
 * production deployment assigned arr-app-web.vercel.app (OQ-010 /
 * WORK_SPEC §13 "Wave 4"). Changing this
 * breaks every stored receipt digest — dev receipts issued under the
 * earlier predicate types were discarded in the same change (see the
 * discard receipt migrations); production must never change it again without
 * a full receipt migration decision.
 */
export const RECEIPT_PREDICATE_TYPE =
  "https://arr-app-web.vercel.app/receipt/v1" as const;

/** The issuing tool identity recorded in every receipt. */
export const RECEIPT_TOOL = { name: "alrescha", version: "0.1.0" } as const;
export const LEGACY_RECEIPT_TOOL_NAME = "arr" as const;

/**
 * File subjects carry the scan's sha256 blob digests; the analyzed commit
 * itself is a subject under the canonical `git:commit` name with its sha1 —
 * the WORK_SPEC §13 reserved entry.
 */
export const inTotoSubjectSchema = z.union([
  z.strictObject({
    digest: z.strictObject({ sha256: sha256Schema }),
    name: z.string().min(1),
  }),
  z.strictObject({
    digest: z.strictObject({ sha1: sha1Schema }),
    name: z.literal("git:commit"),
  }),
]);

export const alreschaReceiptPredicateSchema = z.strictObject({
  analyzedAt: z.iso.datetime(),
  commitSha: z.string().regex(/^[0-9a-f]{40}$/),
  coverage: z.strictObject({
    implVerified: z.number().int().nonnegative(),
    requirements: z.number().int().nonnegative(),
    testVerified: z.number().int().nonnegative(),
  }),
  evidence: z.strictObject({
    inferred: z.number().int().nonnegative(),
    verified: z.number().int().nonnegative(),
  }),
  previousReceiptDigest: sha256Schema.nullable(),
  repository: z.string().regex(/^[^/]+\/[^/]+$/),
  runId: z.string().min(1),
  tool: z.strictObject({
    name: z.enum([RECEIPT_TOOL.name, LEGACY_RECEIPT_TOOL_NAME]),
    version: z.string().min(1),
  }),
});

export const inTotoStatementSchema = z.strictObject({
  _type: z.literal("https://in-toto.io/Statement/v1"),
  predicate: alreschaReceiptPredicateSchema,
  predicateType: z.literal(RECEIPT_PREDICATE_TYPE),
  subject: z.array(inTotoSubjectSchema).min(1),
});

export type InTotoStatement = z.infer<typeof inTotoStatementSchema>;

/** @deprecated Use alreschaReceiptPredicateSchema. */
export const arrReceiptPredicateSchema = alreschaReceiptPredicateSchema;

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
