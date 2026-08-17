import { z } from "zod";

export const ulidSchema = z
  .string()
  .regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, "Expected a ULID");
export const workspaceIdSchema = ulidSchema.brand<"WorkspaceId">();
export const repositoryIdSchema = ulidSchema.brand<"RepositoryId">();
export const graphNodeIdSchema = ulidSchema.brand<"GraphNodeId">();

const timestampSchema = z.string().datetime({ offset: true });
const sha1Schema = z.string().regex(/^[0-9a-f]{40}$/);
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const metadataSchema = z.record(z.string(), z.unknown());

export const sourceSpanSchema = z
  .strictObject({
    endColumn: z.number().int().positive().optional(),
    endLine: z.number().int().positive(),
    path: z.string().min(1),
    startColumn: z.number().int().positive().optional(),
    startLine: z.number().int().positive(),
  })
  .refine(({ endLine, startLine }) => endLine >= startLine, {
    message: "Span end must not precede start",
    path: ["endLine"],
  });

export const provenanceSchema = z.union([
  z.strictObject({
    sourceArtifactId: ulidSchema,
    span: sourceSpanSchema,
  }),
  z.strictObject({
    reason: z.string().trim().min(1),
  }),
]);

export const confidenceSchema = z.number().min(0).max(1);

const tenantRepositorySchema = {
  repositoryId: repositoryIdSchema,
  workspaceId: workspaceIdSchema,
} as const;

export const repositorySchema = z.strictObject({
  defaultBranch: z.string().min(1),
  fullName: z.string().regex(/^[^/]+\/[^/]+$/),
  githubRepositoryId: z.number().int().positive().nullable(),
  id: repositoryIdSchema,
  installationId: ulidSchema.nullable(),
  lastScannedCommitSha: sha1Schema.nullable(),
  selectedAt: timestampSchema.nullable(),
  workspaceId: workspaceIdSchema,
});

export const artifactSchema = z.strictObject({
  ...tenantRepositorySchema,
  digest: sha256Schema,
  id: graphNodeIdSchema,
  kind: z.enum([
    "instruction",
    "spec",
    "adr",
    "todo",
    "code_metadata",
    "test_report",
    "ci_run",
  ]),
  metadata: metadataSchema,
  path: z.string().min(1),
  sourceCommitSha: sha1Schema,
});

export const requirementSchema = z.strictObject({
  ...tenantRepositorySchema,
  id: graphNodeIdSchema,
  sourceArtifactId: ulidSchema,
  sourceSpan: sourceSpanSchema,
  statement: z.string().trim().min(1),
  status: z.enum(["active", "superseded", "withdrawn"]),
});

export const evidenceSchema = z.strictObject({
  ...tenantRepositorySchema,
  id: graphNodeIdSchema,
  kind: z.enum(["implementation", "test", "ci", "document", "decision"]),
  metadata: metadataSchema,
  sourceArtifactId: ulidSchema,
  sourceSpan: sourceSpanSchema.nullable(),
  verdict: z.enum(["supports", "contradicts", "unknown"]),
});

export const edgeSchema = z.strictObject({
  ...tenantRepositorySchema,
  confidence: confidenceSchema,
  id: ulidSchema,
  provenance: provenanceSchema,
  relation: z.enum([
    "requires",
    "implements",
    "tests",
    "supports",
    "contradicts",
    "supersedes",
    "references",
  ]),
  sourceNodeId: graphNodeIdSchema,
  targetNodeId: graphNodeIdSchema,
});

export const findingSchema = z.strictObject({
  ...tenantRepositorySchema,
  confidence: confidenceSchema,
  id: ulidSchema,
  kind: z.enum([
    "missing-implementation",
    "missing-test",
    "stale-doc",
    "contradicting-instructions",
    "orphan-doc",
    "unproven-claim",
  ]),
  provenance: provenanceSchema,
  severity: z.enum(["low", "medium", "high", "critical"]),
  sourceNodeId: graphNodeIdSchema.nullable(),
  status: z.enum(["open", "resolved", "dismissed"]),
  title: z.string().trim().min(1),
});

export const receiptSchema = z.strictObject({
  ...tenantRepositorySchema,
  commitSha: sha1Schema,
  digest: sha256Schema.nullable(),
  id: ulidSchema,
  runId: ulidSchema.nullable(),
  status: z.enum(["generated", "published", "invalidated"]),
  summary: metadataSchema,
});

export const runSchema = z.strictObject({
  ...tenantRepositorySchema,
  commitSha: sha1Schema.nullable(),
  id: ulidSchema,
  status: z.enum(["pending", "running", "succeeded", "failed", "cancelled"]),
  triggerKey: z.string().min(1),
  triggerKind: z.enum(["manual", "push", "check_run", "workflow_run"]),
});

export const jobSchema = z
  .strictObject({
    ...tenantRepositorySchema,
    attemptCount: z.number().int().nonnegative(),
    id: ulidSchema,
    idempotencyKey: z.string().min(1),
    kind: z.enum(["scan", "analyze", "judge", "pack"]),
    maxAttempts: z.number().int().min(1).max(10),
    payload: metadataSchema,
    runId: ulidSchema,
    status: z.enum(["queued", "running", "succeeded", "failed", "cancelled"]),
  })
  .refine(({ attemptCount, maxAttempts }) => attemptCount <= maxAttempts, {
    message: "attemptCount must not exceed maxAttempts",
    path: ["attemptCount"],
  });

export const creditLedgerEntrySchema = z.strictObject({
  amount: z.number().int(),
  event: z.enum(["grant", "reserve", "settle", "refund", "topup", "adjust"]),
  id: ulidSchema,
  idempotencyKey: z.string().min(1),
  jobId: ulidSchema.nullable(),
  metadata: metadataSchema,
  reservationId: ulidSchema.nullable(),
  workspaceId: workspaceIdSchema,
});

export const mcpTokenSchema = z.strictObject({
  expiresAt: timestampSchema.nullable(),
  id: ulidSchema,
  lastUsedAt: timestampSchema.nullable(),
  name: z.string().trim().min(1),
  tokenPrefix: z.string().min(6).max(16).nullable(),
  workspaceId: workspaceIdSchema,
});

export const githubInstallationSchema = z.strictObject({
  accountId: z.number().int().positive(),
  accountLogin: z.string().min(1),
  githubInstallationId: z.number().int().positive(),
  id: ulidSchema,
  permissionMode: z.enum(["read_only", "read_with_pr_proposals"]),
  revokedAt: timestampSchema.nullable(),
  revocationReason: z.enum(["deleted", "suspend"]).nullable(),
  workspaceId: workspaceIdSchema,
});

export const indexEntrySchema = z.strictObject({
  embedding: z.array(z.number()).nullable(),
  id: ulidSchema,
  neighborIds: z.array(graphNodeIdSchema),
  nodeId: graphNodeIdSchema,
  repositoryId: repositoryIdSchema,
  searchKey: z.string().trim().min(1),
  workspaceId: workspaceIdSchema,
});

export const accessEventSchema = z.strictObject({
  id: ulidSchema,
  occurredAt: timestampSchema,
  targetNodeIds: z.array(graphNodeIdSchema),
  tokenId: ulidSchema,
  tool: z.string().trim().min(1),
  workspaceId: workspaceIdSchema,
});

export type Edge = z.infer<typeof edgeSchema>;
export type Finding = z.infer<typeof findingSchema>;
export type Provenance = z.infer<typeof provenanceSchema>;
