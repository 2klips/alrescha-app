import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type SupportedGitHubWebhook = "check_run" | "push" | "workflow_run";

export const MAX_GITHUB_WEBHOOK_BODY_BYTES = 1_048_576;

/**
 * One push commit's touched paths (Phase 3 Wave B todo 4). Only file paths
 * travel — never diffs or contents. Commits touching fewer than 2 or more
 * than {@link MAX_CO_CHANGE_PATHS} files are dropped at normalization: a
 * single-file commit has no pair and a bulk commit is churn, not coupling.
 */
export interface PushCommitFiles {
  readonly paths: readonly string[];
  readonly sha: string;
}

export const MAX_CO_CHANGE_PATHS = 50;

export interface NormalizedGitHubWebhookEvent {
  readonly action: string | null;
  readonly commitSha: string;
  /** Non-empty only for push events. */
  readonly commitFiles: readonly PushCommitFiles[];
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
  insertEvent(
    event: PersistedGitHubWebhookEvent,
  ): Promise<"duplicate" | "inserted">;
  resolveRepository(input: {
    installationId: number;
    repositoryFullName: string;
    repositoryGitHubId: number;
  }): Promise<{ id: string; workspaceId: string } | null>;
  revokeInstallation(input: {
    deliveryId: string;
    githubInstallationId: number;
    reason: "deleted" | "suspend";
  }): Promise<"duplicate" | "revoked" | "unknown">;
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

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

/** `body.commits[]` → per-commit touched paths, pair-worthy commits only. */
function normalizePushCommitFiles(value: unknown): PushCommitFiles[] {
  if (!Array.isArray(value)) return [];
  const commits: PushCommitFiles[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const commit = entry as JsonRecord;
    const sha = commit.id;
    if (typeof sha !== "string" || !/^[0-9a-f]{40}$/.test(sha)) continue;
    const paths = [
      ...new Set([
        ...stringArray(commit.added),
        ...stringArray(commit.modified),
        ...stringArray(commit.removed),
      ]),
    ].sort();
    if (paths.length < 2 || paths.length > MAX_CO_CHANGE_PATHS) continue;
    commits.push({ paths, sha });
  }
  return commits;
}

export function verifyGitHubWebhookSignature(
  secret: string,
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  if (!signatureHeader || !/^sha256=[0-9a-f]{64}$/.test(signatureHeader)) {
    return false;
  }

  const expected = Buffer.from(
    `sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`,
  );
  const actual = Buffer.from(signatureHeader);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function normalizeGitHubWebhook(
  eventHeader: string,
  deliveryId: string,
  rawBody: string,
): NormalizedGitHubWebhookEvent | null {
  if (
    eventHeader !== "push" &&
    eventHeader !== "check_run" &&
    eventHeader !== "workflow_run"
  ) {
    return null;
  }

  const body = record(JSON.parse(rawBody) as unknown, "webhook body");
  const repository = record(body.repository, "webhook body.repository");
  const installation = record(body.installation, "webhook body.installation");
  const action =
    eventHeader === "push" ? null : stringField(body, "action", "webhook body");

  if (eventHeader !== "push" && action !== "completed") {
    return null;
  }

  let commitSha: string;
  let conclusion: string | null = null;
  let commitFiles: PushCommitFiles[] = [];
  if (eventHeader === "push") {
    commitSha = stringField(body, "after", "webhook body");
    commitFiles = normalizePushCommitFiles(body.commits);
  } else {
    const run = record(body[eventHeader], `webhook body.${eventHeader}`);
    commitSha = stringField(run, "head_sha", `webhook body.${eventHeader}`);
    const result = run.conclusion;
    conclusion = typeof result === "string" ? result : null;
  }

  if (!/^[0-9a-f]{40}$/.test(commitSha)) {
    throw new TypeError(
      "Webhook commit SHA must contain 40 lowercase hexadecimal characters.",
    );
  }

  return {
    action,
    commitFiles,
    commitSha,
    conclusion,
    deliveryId,
    event: eventHeader,
    installationId: numberField(
      installation,
      "id",
      "webhook body.installation",
    ),
    payloadDigest: createHash("sha256").update(rawBody, "utf8").digest("hex"),
    repositoryFullName: stringField(
      repository,
      "full_name",
      "webhook body.repository",
    ),
    repositoryGitHubId: numberField(
      repository,
      "id",
      "webhook body.repository",
    ),
  };
}

function normalizeInstallationRevocation(
  eventHeader: string,
  deliveryId: string,
  rawBody: string,
): {
  deliveryId: string;
  githubInstallationId: number;
  reason: "deleted" | "suspend";
} | null {
  if (eventHeader !== "installation") return null;

  const body = record(JSON.parse(rawBody) as unknown, "webhook body");
  const action = stringField(body, "action", "webhook body");
  if (action !== "deleted" && action !== "suspend") return null;
  const installation = record(body.installation, "webhook body.installation");

  return {
    deliveryId,
    githubInstallationId: numberField(
      installation,
      "id",
      "webhook body.installation",
    ),
    reason: action,
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
  if (
    Buffer.byteLength(input.rawBody, "utf8") > MAX_GITHUB_WEBHOOK_BODY_BYTES
  ) {
    return { body: { error: "payload_too_large" }, status: 413 };
  }
  if (
    !verifyGitHubWebhookSignature(input.secret, input.rawBody, input.signature)
  ) {
    return { body: { error: "invalid_signature" }, status: 401 };
  }
  if (!input.deliveryId || !input.event) {
    return { body: { error: "missing_github_headers" }, status: 400 };
  }

  if (input.event === "installation") {
    let revocation: ReturnType<typeof normalizeInstallationRevocation>;
    try {
      revocation = normalizeInstallationRevocation(
        input.event,
        input.deliveryId,
        input.rawBody,
      );
    } catch {
      return { body: { error: "invalid_payload" }, status: 400 };
    }
    if (!revocation) return { body: { ignored: true }, status: 202 };

    const outcome = await input.store.revokeInstallation(revocation);
    if (outcome === "unknown") {
      return {
        body: { ignored: true, reason: "installation_not_linked" },
        status: 202,
      };
    }
    return {
      body: { duplicate: outcome === "duplicate", revoked: true },
      status: 200,
    };
  }

  let event: NormalizedGitHubWebhookEvent | null;
  try {
    event = normalizeGitHubWebhook(
      input.event,
      input.deliveryId,
      input.rawBody,
    );
  } catch {
    return { body: { error: "invalid_payload" }, status: 400 };
  }

  if (!event) {
    return { body: { ignored: true }, status: 202 };
  }

  const repository = await input.store.resolveRepository(event);
  if (!repository) {
    return {
      body: { ignored: true, reason: "repository_not_selected" },
      status: 202,
    };
  }

  const outcome = await input.store.insertEvent({
    ...event,
    repositoryId: repository.id,
    workspaceId: repository.workspaceId,
  });
  return {
    body: { duplicate: outcome === "duplicate", received: true },
    status: 200,
  };
}
