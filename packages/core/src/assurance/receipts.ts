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

/** The issuing tool identity recorded in every receipt issued from now on. */
export const RECEIPT_TOOL = { name: "alrescha", version: "0.1.0" } as const;

/**
 * Tool names a stored receipt may carry (OQ-022 ⑴). Production issued twelve
 * receipts as `"arr"` before the Alrescha rename; the tool name is inside the
 * digested statement, so those rows cannot be rewritten and must stay
 * verifiable (WORK_SPEC §13). Issuance stays pinned to RECEIPT_TOOL — only
 * the read side accepts the legacy name.
 */
export const RECEIPT_TOOL_NAMES = ["arr", RECEIPT_TOOL.name] as const;
export type ReceiptToolName = (typeof RECEIPT_TOOL_NAMES)[number];

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

const receiptPredicateBase = z.strictObject({
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
});

const toolSchema = <Name extends z.ZodType<string>>(name: Name) =>
  z.strictObject({ name, version: z.string().min(1) });

const statementSchema = <Predicate extends z.ZodType>(predicate: Predicate) =>
  z.strictObject({
    _type: z.literal("https://in-toto.io/Statement/v1"),
    predicate,
    predicateType: z.literal(RECEIPT_PREDICATE_TYPE),
    subject: z.array(inTotoSubjectSchema).min(1),
  });

/** What this build issues: the tool name is pinned to RECEIPT_TOOL. */
export const alreschaReceiptPredicateSchema = receiptPredicateBase.extend({
  tool: toolSchema(z.literal(RECEIPT_TOOL.name)),
});

export const inTotoStatementSchema = statementSchema(
  alreschaReceiptPredicateSchema,
);

export type InTotoStatement = z.infer<typeof inTotoStatementSchema>;

/**
 * What a stored receipt may look like: the issuance shape plus the legacy
 * tool name. Used only to read receipts back — never to issue one.
 */
export const storedReceiptPredicateSchema = receiptPredicateBase.extend({
  tool: toolSchema(z.enum(RECEIPT_TOOL_NAMES)),
});

export const storedInTotoStatementSchema = statementSchema(
  storedReceiptPredicateSchema,
);

export type StoredInTotoStatement = z.infer<typeof storedInTotoStatementSchema>;

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([left], [right]) => left.localeCompare(right),
  );
  return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${canonicalize(child)}`).join(",")}}`;
}

async function digestCanonical(
  statement: StoredInTotoStatement,
): Promise<string> {
  const encoded = new TextEncoder().encode(canonicalize(statement));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Digest a statement this build may issue (rejects the legacy tool name). */
export async function digestInTotoStatement(
  statement: InTotoStatement,
): Promise<string> {
  return digestCanonical(inTotoStatementSchema.parse(statement));
}

export type ReceiptVerification =
  | { actualDigest: string; state: "verified"; toolName: ReceiptToolName }
  | {
      actualDigest: string;
      expectedDigest: string;
      state: "tampered";
      toolName: ReceiptToolName;
    }
  | { issues: readonly string[]; state: "invalid" };

/**
 * Verify a stored receipt against its stored digest. Reads with the stored
 * shape, so pre-rename `"arr"` receipts verify like current ones; `toolName`
 * tells the caller which issuer name the statement carries.
 */
export async function verifyInTotoStatement(
  statement: unknown,
  expectedDigest: string,
): Promise<ReceiptVerification> {
  const parsed = storedInTotoStatementSchema.safeParse(statement);
  if (!parsed.success) {
    return {
      issues: parsed.error.issues.map((issue) => issue.message),
      state: "invalid",
    };
  }
  const actualDigest = await digestCanonical(parsed.data);
  const toolName = parsed.data.predicate.tool.name;
  return actualDigest === expectedDigest
    ? { actualDigest, state: "verified", toolName }
    : { actualDigest, expectedDigest, state: "tampered", toolName };
}
