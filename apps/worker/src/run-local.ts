/**
 * A local worker process (Phase 2C todo 5).
 *
 * `runWorkerOnce` has existed since Phase 2B but nothing ever called it outside
 * tests — there was no process, no entrypoint, and no handler table. The live
 * pilot is what made that visible: real webhooks enqueued real jobs and nothing
 * on this machine could drain them.
 *
 * This is the drain loop for local runs. It registers only the handlers that
 * are actually implemented; `analyze` and `pack` have none, so a claimed job of
 * those kinds fails with a plain message rather than being quietly skipped —
 * the gap belongs on the commit card where it can be seen, not in a silence.
 *
 * `WORKER_CONCURRENCY` (default 4) drain loops run side by side, each owning
 * a disjoint round-robin slice of the workspace list, so one long-running
 * job on one tenant no longer blocks every other tenant's queue — see
 * `drain-loop.ts`.
 *
 * Usage: node --import tsx apps/worker/src/run-local.ts [--once]
 */

import { createSign } from "node:crypto";
import { existsSync } from "node:fs";

import { requestInstallationToken } from "@arr/core";
import postgres from "postgres";

import { createAnalysisJobHandler } from "./analysis-job";
import { runDrainLoop } from "./drain-loop";
import { createEnrichJobHandler } from "./enrich-job";
import { GitHubRepositorySource } from "./github-repository-source";
import { PostgresAnalysisStore } from "./postgres-analysis-store";
import { PostgresEnrichJobStore } from "./postgres-enrich-store";
import { RepositoryScanStore } from "./repository-scan-store";
import { runRepositoryScan } from "./repository-scan";
import { createExpiringSourceCache, readTransientSource } from "./source-cache";
import { type JobHandler, type JobHandlers } from "./worker";
import { PostgresWorkerQueue } from "./queue";

const IDLE_SLEEP_MS = 2_000;

/** Concurrent drain loops when `WORKER_CONCURRENCY` is unset or invalid. */
const DEFAULT_CONCURRENCY = 4;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

/**
 * How many drain loops to run side by side (QW-3). `claim_next_job` is
 * already `FOR UPDATE SKIP LOCKED` with a lease, so concurrent loops are
 * safe — this only decides how many run at once. Falls back to the default
 * on anything that isn't a positive integer rather than crashing a worker
 * process over a malformed env var.
 */
function workerConcurrency(): number {
  const raw = process.env.WORKER_CONCURRENCY;
  if (!raw) return DEFAULT_CONCURRENCY;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_CONCURRENCY;
}

/**
 * App JWT. This duplicates `apps/web/lib/github/api.ts` — the signer lives in
 * the web app and @arr/core exposes none, so the worker cannot share it. When
 * the worker is productionised the signer should move into @arr/core and both
 * callers should use that one.
 */
function appJwt(appId: string, privateKey: string, now = Date.now()): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const issuedAt = Math.floor(now / 1000) - 60;
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
    exp: issuedAt + 10 * 60,
    iat: issuedAt,
    iss: appId,
  })}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${signer.sign(privateKey).toString("base64url")}`;
}

function notImplemented(kind: string): JobHandler {
  return async () => {
    throw new Error(
      `No worker handler is implemented for '${kind}' jobs. The rules engine ` +
        "exists in @arr/core but nothing wires it to the queue yet.",
    );
  };
}

interface RepositoryRow {
  readonly full_name: string;
  readonly github_installation_id: string;
  readonly github_repository_id: string;
}

/**
 * A repository source on a short-lived installation token, cached per
 * repository. Analysis reads a body per file, and minting a token for each of
 * them would be both slow and pointless — but the token does NOT outlive a
 * long-running worker: it expires after ~1h, so the cache re-mints ahead of
 * expiry and evicts failed builds (perf research MT-1; the previous
 * forever-cache silently mass-resolved findings once the token died).
 */
function createSourceFactory(sql: postgres.Sql) {
  return createExpiringSourceCache(async (workspaceId, repositoryId) => {
    const rows = await sql<RepositoryRow[]>`
      select r.full_name, r.github_repository_id, i.github_installation_id
      from public.repositories r
      join public.github_installations i on i.id = r.installation_id
      where r.id = ${repositoryId} and r.workspace_id = ${workspaceId}
      limit 1
    `;
    const row = rows[0];
    if (!row) throw new Error(`repository ${repositoryId} is not connected`);

    const [owner, repository] = row.full_name.split("/");
    if (!owner || !repository) {
      throw new Error(`repository name '${row.full_name}' is malformed`);
    }

    const token = await requestInstallationToken({
      appJwt: appJwt(
        required("GITHUB_APP_ID"),
        required("GITHUB_APP_PRIVATE_KEY").replaceAll("\\n", "\n"),
      ),
      installationId: Number(row.github_installation_id),
      // The token is scoped to this one repository — the product's own promise
      // on the connect screen, enforced by the API rather than by the copy.
      repositoryIds: [Number(row.github_repository_id)],
    });
    return {
      expiresAt: token.expiresAt,
      source: new GitHubRepositorySource(owner, repository, token.token),
    };
  });
}

type SourceFactory = ReturnType<typeof createSourceFactory>;

function createScanHandler(
  sql: postgres.Sql,
  sourceFor: SourceFactory,
): JobHandler {
  const store = new RepositoryScanStore(sql);

  return async (job) => {
    const commitSha = (job.payload as { commitSha?: string }).commitSha;
    if (!commitSha) throw new Error("scan job payload has no commitSha");

    const result = await runRepositoryScan({
      commitSha,
      repositoryId: job.repositoryId,
      source: await sourceFor(job.workspaceId, job.repositoryId),
      store,
      workspaceId: job.workspaceId,
    });
    console.log(
      `  scan @${commitSha.slice(0, 7)} → ${result.touchedRows} rows`,
    );
  };
}

async function main(): Promise<void> {
  // Local runs use these files; hosted workers receive the same values from
  // their secret store and intentionally ship without either file.
  for (const path of ["apps/web/.env.local", ".env.local"]) {
    if (existsSync(path)) process.loadEnvFile(path);
  }
  const sql = postgres(required("DATABASE_URL"));
  const queue = new PostgresWorkerQueue(sql);
  const baseWorkerId = `local-${process.pid}`;
  const concurrency = workerConcurrency();
  const once = process.argv.includes("--once");

  const sourceFor = createSourceFactory(sql);

  const handlers: JobHandlers = {
    analyze: createAnalysisJobHandler({
      // Transient: the body is decoded, handed to the rules, and dropped.
      // Only a 404 reads as "file vanished" — any other failure (dead token,
      // throttling) fails the job into the retry path instead of letting the
      // findings reconciler mistake an outage for deletions (MT-1).
      readSource: async ({ commitSha, path, repositoryId, workspaceId }) =>
        readTransientSource(
          await sourceFor(workspaceId, repositoryId),
          path,
          commitSha,
        ),
      store: new PostgresAnalysisStore(sql),
    }),
    coach: notImplemented("coach"),
    enrich: createEnrichJobHandler({
      // Transient, like analysis: fetched, clipped, summarized, dropped.
      readSource: async ({ commitSha, path, repositoryId, workspaceId }) =>
        readTransientSource(
          await sourceFor(workspaceId, repositoryId),
          path,
          commitSha,
        ),
      store: new PostgresEnrichJobStore(sql, {
        masterKey: process.env.BYOK_ENCRYPTION_KEY ?? "",
        platformKeys: {
          ...(process.env.ANTHROPIC_API_KEY
            ? { anthropic: process.env.ANTHROPIC_API_KEY }
            : {}),
          ...(process.env.OPENAI_API_KEY
            ? { openai: process.env.OPENAI_API_KEY }
            : {}),
        },
      }),
    }),
    judge: notImplemented("judge"),
    pack: notImplemented("pack"),
    scan: createScanHandler(sql, sourceFor),
  };

  let lastWorkspaceCount: number | undefined;
  for (;;) {
    // Workspaces can be created after the hosted worker starts, so refresh the
    // list on every idle polling cycle instead of freezing the startup view.
    const workspaces = await sql<{ id: string }[]>`
      select id from public.workspaces order by created_at
    `;
    if (workspaces.length !== lastWorkspaceCount) {
      console.log(
        `worker ${baseWorkerId} draining ${workspaces.length} workspace(s) across ${concurrency} loop(s)${once ? " (once)" : ""}`,
      );
      lastWorkspaceCount = workspaces.length;
    }

    // N loops, each a disjoint round-robin slice of `workspaces` (loop i =
    // indices i, i+concurrency, i+2*concurrency, …) — see drain-loop.ts. A
    // full poll cycle is idle only once every loop reports no work.
    const results = await Promise.all(
      Array.from({ length: concurrency }, (_, loopIndex) =>
        runDrainLoop({
          concurrency,
          handlers,
          loopIndex,
          queue,
          workerId: `${baseWorkerId}-${loopIndex}`,
          workspaces,
        }),
      ),
    );
    const worked = results.some(Boolean);
    if (!worked) {
      if (once) break;
      await new Promise((resolve) => setTimeout(resolve, IDLE_SLEEP_MS));
    }
  }

  await sql.end();
  console.log("worker idle — exiting");
}

await main();
