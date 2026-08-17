/**
 * `arr push` — scan locally, upload metadata only (Phase 2B todo 3, ADR-013).
 *
 * The pipeline is the GitHub path's own: the server hands back the previous
 * scan state, `scanRepository` (the shared deterministic scanner) computes the
 * plan against it, and the plan — already body-free by type — is validated
 * against the strict payload schema before it leaves the machine.
 */

import {
  localIngestPayloadSchema,
  scanRepository,
  type PreviousScannedArtifact,
} from "@arr/core";

import { createLocalRepositorySource } from "./local-source";

export type PushOutcome =
  | {
      readonly status: "uploaded";
      readonly artifactCount: number;
      readonly commitSha: string;
      readonly removedCount: number;
      readonly skippedCount: number;
      readonly touchedRows: number;
      readonly unchangedCount: number;
    }
  | { readonly status: "unchanged"; readonly commitSha: string }
  | { readonly status: "auth-failed" }
  | { readonly status: "invalid-payload"; readonly detail: string }
  | { readonly status: "offline"; readonly detail: string }
  | {
      readonly status: "server-error";
      readonly detail: string;
      readonly httpStatus: number;
    };

export interface PushOptions {
  readonly baseUrl: string;
  readonly fetchImplementation?: typeof fetch;
  readonly repositoryFullName: string;
  readonly rootDir: string;
  readonly token: string;
}

interface PreviousStateResponse {
  readonly previous: {
    readonly artifacts: readonly PreviousScannedArtifact[];
    readonly commitSha: string | null;
  };
}

function networkDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function pushLocalProject(
  options: PushOptions,
): Promise<PushOutcome> {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const headers = { authorization: `Bearer ${options.token}` };
  const previousUrl = new URL("/api/ingest/local", options.baseUrl);
  previousUrl.searchParams.set("repository", options.repositoryFullName);

  let previousResponse: Response;
  try {
    previousResponse = await fetchImplementation(previousUrl, { headers });
  } catch (error) {
    return { detail: networkDetail(error), status: "offline" };
  }
  if (previousResponse.status === 401 || previousResponse.status === 403) {
    return { status: "auth-failed" };
  }
  if (!previousResponse.ok) {
    return {
      detail: await previousResponse.text(),
      httpStatus: previousResponse.status,
      status: "server-error",
    };
  }
  const { previous } = (await previousResponse.json()) as PreviousStateResponse;

  const snapshot = await createLocalRepositorySource(options.rootDir);
  const plan = await scanRepository({
    commitSha: snapshot.commitSha,
    previousArtifacts: previous.artifacts,
    previousCommitSha: previous.commitSha,
    source: snapshot.source,
  });

  if (plan.treeSha === null && plan.touchedRows === 0) {
    return { commitSha: plan.commitSha, status: "unchanged" };
  }

  // Self-check against the shared strict schema: the exact bytes that go on
  // the wire must parse as metadata-only, or nothing is sent at all.
  const validated = localIngestPayloadSchema.safeParse({
    plan,
    repositoryFullName: options.repositoryFullName,
  });
  if (!validated.success) {
    return {
      detail: validated.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; "),
      status: "invalid-payload",
    };
  }

  let uploadResponse: Response;
  try {
    uploadResponse = await fetchImplementation(
      new URL("/api/ingest/local", options.baseUrl),
      {
        body: JSON.stringify(validated.data),
        headers: { ...headers, "content-type": "application/json" },
        method: "POST",
      },
    );
  } catch (error) {
    return { detail: networkDetail(error), status: "offline" };
  }
  if (uploadResponse.status === 401 || uploadResponse.status === 403) {
    return { status: "auth-failed" };
  }
  if (!uploadResponse.ok) {
    return {
      detail: await uploadResponse.text(),
      httpStatus: uploadResponse.status,
      status: "server-error",
    };
  }
  const applied = (await uploadResponse.json()) as { touchedRows: number };

  return {
    artifactCount: plan.artifacts.length,
    commitSha: plan.commitSha,
    removedCount: plan.removedPaths.length,
    skippedCount: plan.skipped.length,
    status: "uploaded",
    touchedRows: applied.touchedRows,
    unchangedCount: plan.unchangedPaths.length,
  };
}
