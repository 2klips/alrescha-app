import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type SupportedGitHubWebhook = "check_run" | "push" | "workflow_run";

export interface NormalizedGitHubWebhookEvent {
  readonly action: string | null;
  readonly commitSha: string;
  readonly conclusion: string | null;
  readonly deliveryId: string;
  readonly event: SupportedGitHubWebhook;
  readonly installationId: number;
  readonly payloadDigest: string;
  readonly repositoryFullName: string;
  readonly repositoryGitHubId: number;
}

export interface PersistedGitHubWebhookEvent extends NormalizedGitHubWebhookEvent {
  readonly repositoryId: string;
  readonly workspaceId: string;
}

export interface GitHubWebhookStore {
  insertEvent(event: PersistedGitHubWebhookEvent): Promise<"duplicate" | "inserted">;
  resolveRepository(input: {
    installationId: number;
    repositoryFullName: string;
    repositoryGitHubId: number;
  }): Promise<{ id: string; workspaceId: string } | null>;
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown, label: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value as JsonRecord;
}

function stringField(value: JsonRecord, field: string, label: string): string {
  const result = value[field];
  if (typeof result !== "string" || result.length === 0) {
    throw new TypeError(`${label}.${field} must be a non-empty string.`);
  }
  return result;
}

function numberField(value: JsonRecord, field: string, label: string): number {
  const result = value[field];
  if (typeof result !== "number" || !Number.isSafeInteger(result)) {
    throw new TypeError(`${label}.${field} must be a safe integer.`);
  }
  return result;
}

export function verifyGitHubWebhookSignature(
  secret: string,
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  if (!signatureHeader || !/^sha256=[0-9a-f]{64}$/.test(signatureHeader)) {
    return false;
  }

  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`);
  const actual = Buffer.from(signatureHeader);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function normalizeGitHubWebhook(
  eventHeader: string,
  deliveryId: string,
  rawBody: string,
): NormalizedGitHubWebhookEvent | null {
  if (eventHeader !== "push" && eventHeader !== "check_run" && eventHeader !== "workflow_run") {
    return null;
  }

  const body = record(JSON.parse(rawBody) as unknown, "webhook body");
  const repository = record(body.repository, "webhook body.repository");
  const installation = record(body.installation, "webhook body.installation");
  const action = eventHeader === "push" ? null : stringField(body, "action", "webhook body");

  if (eventHeader !== "push" && action !== "completed") {
    return null;
  }

  let commitSha: string;
  let conclusion: string | null = null;
  if (eventHeader === "push") {
    commitSha = stringField(body, "after", "webhook body");
  } else {
    const run = record(body[eventHeader], `webhook body.${eventHeader}`);
    commitSha = stringField(run, "head_sha", `webhook body.${eventHeader}`);
    const result = run.conclusion;
    conclusion = typeof result === "string" ? result : null;
  }

  if (!/^[0-9a-f]{40}$/.test(commitSha)) {
    throw new TypeError("Webhook commit SHA must contain 40 lowercase hexadecimal characters.");
  }

  return {
    action,
    commitSha,
    conclusion,
    deliveryId,
    event: eventHeader,
    installationId: numberField(installation, "id", "webhook body.installation"),
    payloadDigest: createHash("sha256").update(rawBody, "utf8").digest("hex"),
    repositoryFullName: stringField(repository, "full_name", "webhook body.repository"),
    repositoryGitHubId: numberField(repository, "id", "webhook body.repository"),
  };
}

export async function handleGitHubWebhook(input: {
  readonly deliveryId: string | null;
  readonly event: string | null;
  readonly rawBody: string;
  readonly secret: string;
  readonly signature: string | null;
  readonly store: GitHubWebhookStore;
}): Promise<{ body: Readonly<Record<string, unknown>>; status: number }> {
  if (!verifyGitHubWebhookSignature(input.secret, input.rawBody, input.signature)) {
    return { body: { error: "invalid_signature" }, status: 401 };
  }
  if (!input.deliveryId || !input.event) {
    return { body: { error: "missing_github_headers" }, status: 400 };
  }

  let event: NormalizedGitHubWebhookEvent | null;
  try {
    event = normalizeGitHubWebhook(input.event, input.deliveryId, input.rawBody);
  } catch {
    return { body: { error: "invalid_payload" }, status: 400 };
  }

  if (!event) {
    return { body: { ignored: true }, status: 202 };
  }

  const repository = await input.store.resolveRepository(event);
  if (!repository) {
    return { body: { ignored: true, reason: "repository_not_selected" }, status: 202 };
  }

  const outcome = await input.store.insertEvent({
    ...event,
    repositoryId: repository.id,
    workspaceId: repository.workspaceId,
  });
  return { body: { duplicate: outcome === "duplicate", received: true }, status: 200 };
}
