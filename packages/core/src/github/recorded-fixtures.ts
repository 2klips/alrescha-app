export type RecordedWebhookKind = "check_run" | "push" | "workflow_run";

export interface NormalizedGitHubTree {
  readonly paths: readonly string[];
  readonly treeSha: string;
  readonly truncated: boolean;
}

export interface NormalizedGitHubContent {
  readonly content: string;
  readonly encoding: "base64";
  readonly path: string;
  readonly sha: string;
}

export interface NormalizedGitHubWebhook {
  readonly commitSha: string;
  readonly deliveryId: string;
  readonly installationId: number;
  readonly kind: RecordedWebhookKind;
  readonly repository: string;
}

export interface NormalizedGitHubArtifact {
  readonly archiveDownloadUrl: string;
  readonly expired: boolean;
  readonly id: number;
  readonly name: string;
  readonly workflowRunId: number;
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

function booleanField(
  value: JsonRecord,
  field: string,
  label: string,
): boolean {
  const result = value[field];

  if (typeof result !== "boolean") {
    throw new TypeError(`${label}.${field} must be a boolean.`);
  }

  return result;
}

export function normalizeRecordedTree(input: unknown): NormalizedGitHubTree {
  const treeResponse = record(input, "tree response");
  const treeSha = stringField(treeResponse, "sha", "tree response");
  const tree = treeResponse.tree;

  if (!Array.isArray(tree)) {
    throw new TypeError("tree response.tree must be an array.");
  }

  const paths = tree.map((entry, index) =>
    stringField(record(entry, `tree[${index}]`), "path", `tree[${index}]`),
  );

  return {
    paths: [...paths].sort(),
    treeSha,
    truncated: booleanField(treeResponse, "truncated", "tree response"),
  };
}

export function normalizeRecordedContent(
  input: unknown,
): NormalizedGitHubContent {
  const contentResponse = record(input, "content response");
  const encoding = stringField(contentResponse, "encoding", "content response");

  if (encoding !== "base64") {
    throw new TypeError("content response.encoding must be base64.");
  }

  return {
    content: stringField(
      contentResponse,
      "content",
      "content response",
    ).replaceAll("\n", ""),
    encoding,
    path: stringField(contentResponse, "path", "content response"),
    sha: stringField(contentResponse, "sha", "content response"),
  };
}

export function normalizeRecordedWebhook(
  input: unknown,
): NormalizedGitHubWebhook {
  const recording = record(input, "webhook recording");
  const headers = record(recording.headers, "webhook recording.headers");
  const body = record(recording.body, "webhook recording.body");
  const kind = stringField(
    headers,
    "x-github-event",
    "webhook recording.headers",
  );

  if (kind !== "push" && kind !== "check_run" && kind !== "workflow_run") {
    throw new TypeError(`Unsupported recorded webhook event: ${kind}.`);
  }

  const repository = record(
    body.repository,
    "webhook recording.body.repository",
  );
  const installation = record(
    body.installation,
    "webhook recording.body.installation",
  );
  let commitSha: string;

  if (kind === "push") {
    commitSha = stringField(body, "after", "webhook recording.body");
  } else {
    const run = record(body[kind], `webhook recording.body.${kind}`);
    commitSha = stringField(run, "head_sha", `webhook recording.body.${kind}`);
  }

  return {
    commitSha,
    deliveryId: stringField(
      headers,
      "x-github-delivery",
      "webhook recording.headers",
    ),
    installationId: numberField(
      installation,
      "id",
      "webhook recording.body.installation",
    ),
    kind,
    repository: stringField(
      repository,
      "full_name",
      "webhook recording.body.repository",
    ),
  };
}

export function normalizeRecordedArtifacts(
  input: unknown,
): readonly NormalizedGitHubArtifact[] {
  const response = record(input, "artifacts response");

  if (!Array.isArray(response.artifacts)) {
    throw new TypeError("artifacts response.artifacts must be an array.");
  }

  return response.artifacts.map((artifact, index) => {
    const item = record(artifact, `artifacts[${index}]`);
    const workflowRun = record(
      item.workflow_run,
      `artifacts[${index}].workflow_run`,
    );

    return {
      archiveDownloadUrl: stringField(
        item,
        "archive_download_url",
        `artifacts[${index}]`,
      ),
      expired: booleanField(item, "expired", `artifacts[${index}]`),
      id: numberField(item, "id", `artifacts[${index}]`),
      name: stringField(item, "name", `artifacts[${index}]`),
      workflowRunId: numberField(
        workflowRun,
        "id",
        `artifacts[${index}].workflow_run`,
      ),
    };
  });
}
