/**
 * Local ingest contract (Phase 2B todo 3, ADR-013).
 *
 * The CLI scans locally with the same `scanRepository` the GitHub path uses
 * and uploads only the resulting plan — metadata by construction. Every object
 * here is a zod strict object: a payload smuggling any extra field (a file
 * body under any name included) fails validation instead of being ignored.
 */

import { z } from "zod";

const sha1Schema = z.string().regex(/^[0-9a-f]{40}$/);
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);

const exportedSymbolSchema = z.strictObject({
  endColumn: z.number().int().nonnegative(),
  endLine: z.number().int().positive(),
  kind: z.string().min(1).max(80),
  name: z.string().min(1).max(400),
  startColumn: z.number().int().nonnegative(),
  startLine: z.number().int().positive(),
});

const markdownSpanSchema = z.strictObject({
  endByte: z.number().int().nonnegative(),
  endColumn: z.number().int().nonnegative(),
  endLine: z.number().int().positive(),
  path: z.string().min(1).max(1000),
  startByte: z.number().int().nonnegative(),
  startColumn: z.number().int().nonnegative(),
  startLine: z.number().int().positive(),
});

const todoItemSchema = z.strictObject({
  source: z.strictObject({
    kind: z.literal("document"),
    path: z.string().min(1).max(1000),
    span: markdownSpanSchema,
  }),
  sourceKey: z.string().min(1).max(400),
  status: z.enum(["open", "done"]),
  title: z.string().min(1).max(240),
});

const rationaleNoteSchema = z.strictObject({
  adrRef: z
    .string()
    .regex(/^ADR-\d{1,4}$/)
    .nullable(),
  kind: z.enum(["adr-reference", "note", "why"]),
  line: z.number().int().positive(),
  sourceKey: z.string().min(1).max(400),
  text: z.string().min(1).max(240),
});

const scannedArtifactSchema = z.strictObject({
  classification: z.enum([
    "adr",
    "agents",
    "claude",
    "code_metadata",
    "cursor_rule",
    "skill",
    "spec",
    "todo_progress",
  ]),
  digest: sha256Schema,
  exportedSymbols: z.array(exportedSymbolSchema).max(10_000),
  kind: z.enum(["adr", "code_metadata", "instruction", "spec", "todo"]),
  path: z.string().min(1).max(1000),
  rationales: z.array(rationaleNoteSchema).max(10_000),
  sizeBytes: z.number().int().nonnegative(),
  sourceBlobSha: sha1Schema,
  sourceCommitSha: sha1Schema,
  symbolEngine: z
    .enum(["go-structural", "python-structural", "typescript-ast"])
    .nullable(),
  todoItems: z.array(todoItemSchema).max(10_000),
});

const codeLinkSchema = z.strictObject({
  kind: z.enum(["calls", "imports"]),
  method: z.enum(["import-binding", "module-resolution", "name-match"]),
  sourcePath: z.string().min(1).max(1000),
  span: z.strictObject({
    endLine: z.number().int().positive(),
    startLine: z.number().int().positive(),
  }),
  symbols: z.array(z.string().min(1).max(400)).max(8),
  targetPath: z.string().min(1).max(1000),
  tier: z.enum(["reference", "resolved"]),
});

export const repositoryScanPlanSchema = z.strictObject({
  artifacts: z.array(scannedArtifactSchema).max(100_000),
  codeLinks: z.array(codeLinkSchema).max(200_000),
  commitSha: sha1Schema,
  removedPaths: z.array(z.string().min(1).max(1000)).max(100_000),
  skipped: z
    .array(
      z.strictObject({
        detail: z.string().max(1000),
        path: z.string().min(1).max(1000),
        reason: z.enum(["binary", "oversized", "submodule", "symlink"]),
      }),
    )
    .max(100_000),
  touchedRows: z.number().int().nonnegative(),
  treeSha: sha1Schema.nullable(),
  unchangedPaths: z.array(z.string().min(1).max(1000)).max(100_000),
});

export const localIngestPayloadSchema = z.strictObject({
  plan: repositoryScanPlanSchema,
  repositoryFullName: z
    .string()
    .regex(/^[\w.-]+\/[\w.-]+$/, "Expected owner/name"),
});

export type LocalIngestPayload = z.infer<typeof localIngestPayloadSchema>;

export interface LocalIngestPrincipal {
  readonly scopes: readonly string[];
  readonly workspaceId: string;
}

export interface LocalIngestPreviousState {
  readonly artifacts: readonly unknown[];
  readonly commitSha: string | null;
}

/** Injected persistence boundary — implemented with supabase in the web app. */
export interface LocalIngestStore {
  authenticateToken(secret: string): Promise<LocalIngestPrincipal | null>;
  applyScanPlan(
    workspaceId: string,
    repositoryId: string,
    plan: LocalIngestPayload["plan"],
  ): Promise<number>;
  ensureRepository(workspaceId: string, fullName: string): Promise<string>;
  loadPreviousScan(
    workspaceId: string,
    repositoryId: string,
  ): Promise<LocalIngestPreviousState>;
  findRepository(workspaceId: string, fullName: string): Promise<string | null>;
  /**
   * Record the ingest as a run so the commit appears on the analysis cards.
   * `startedAt` is measured by the server at request entry — never supplied
   * by the client.
   */
  recordIngestRun(input: {
    commitSha: string;
    repositoryId: string;
    startedAt: string;
    workspaceId: string;
  }): Promise<string>;
}

export const MAX_LOCAL_INGEST_BODY_BYTES = 8 * 1024 * 1024;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function unauthorized(): Response {
  return json(401, { error: "invalid_token" });
}

async function authenticate(
  request: Request,
  store: LocalIngestStore,
  requiredScope: string,
): Promise<LocalIngestPrincipal | Response> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match?.[1]) {
    return unauthorized();
  }
  const principal = await store.authenticateToken(match[1]);
  if (!principal) {
    return unauthorized();
  }
  if (!principal.scopes.includes(requiredScope)) {
    return json(403, { error: "insufficient_scope", requiredScope });
  }
  return principal;
}

/**
 * GET — the previous scan state for a repository, so the CLI can hand
 * `scanRepository` the same `previousArtifacts` the worker path loads. The
 * response is the stored artifact metadata (never bodies; none are stored).
 */
export async function handleLocalIngestPreviousState(
  request: Request,
  store: LocalIngestStore,
): Promise<Response> {
  const principal = await authenticate(request, store, "mcp:read");
  if (principal instanceof Response) {
    return principal;
  }
  const fullName = new URL(request.url).searchParams.get("repository") ?? "";
  if (!/^[\w.-]+\/[\w.-]+$/.test(fullName)) {
    return json(400, { error: "invalid_repository" });
  }
  const repositoryId = await store.findRepository(
    principal.workspaceId,
    fullName,
  );
  if (repositoryId === null) {
    return json(200, { previous: { artifacts: [], commitSha: null } });
  }
  const previous = await store.loadPreviousScan(
    principal.workspaceId,
    repositoryId,
  );
  return json(200, { previous });
}

/** POST — validate the metadata-only payload strictly, then apply it. */
export async function handleLocalIngestUpload(
  request: Request,
  store: LocalIngestStore,
  now: () => Date = () => new Date(),
): Promise<Response> {
  const startedAt = now().toISOString();
  const principal = await authenticate(request, store, "mcp:write");
  if (principal instanceof Response) {
    return principal;
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_LOCAL_INGEST_BODY_BYTES) {
    return json(413, { error: "payload_too_large" });
  }
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(raw);
  } catch {
    return json(400, { error: "invalid_json" });
  }
  const parsed = localIngestPayloadSchema.safeParse(parsedBody);
  if (!parsed.success) {
    return json(400, {
      error: "invalid_payload",
      detail: parsed.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    });
  }
  const repositoryId = await store.ensureRepository(
    principal.workspaceId,
    parsed.data.repositoryFullName,
  );
  const touchedRows = await store.applyScanPlan(
    principal.workspaceId,
    repositoryId,
    parsed.data.plan,
  );
  const runId = await store.recordIngestRun({
    commitSha: parsed.data.plan.commitSha,
    repositoryId,
    startedAt,
    workspaceId: principal.workspaceId,
  });
  return json(200, {
    commitSha: parsed.data.plan.commitSha,
    repositoryId,
    runId,
    touchedRows,
  });
}
