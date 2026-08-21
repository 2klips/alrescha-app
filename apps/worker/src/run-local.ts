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
 * Usage: node --import tsx apps/worker/src/run-local.ts [--once]
 */

import { createSign } from "node:crypto";

import { requestInstallationToken } from "@arr/core";
import postgres from "postgres";

import { GitHubRepositorySource } from "./github-repository-source";
import { RepositoryScanStore } from "./repository-scan-store";
import { runRepositoryScan } from "./repository-scan";
import { runWorkerOnce, type JobHandler, type JobHandlers } from "./worker";
import { PostgresWorkerQueue } from "./queue";

const IDLE_SLEEP_MS = 2_000;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
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

/** Scan reads the repository through a short-lived installation token. */
function createScanHandler(sql: postgres.Sql): JobHandler {
  const store = new RepositoryScanStore(sql);

  return async (job) => {
    const commitSha = (job.payload as { commitSha?: string }).commitSha;
    if (!commitSha) throw new Error("scan job payload has no commitSha");

    const rows = await sql<RepositoryRow[]>`
      select r.full_name, r.github_repository_id, i.github_installation_id
      from public.repositories r
      join public.github_installations i on i.id = r.installation_id
      where r.id = ${job.repositoryId} and r.workspace_id = ${job.workspaceId}
      limit 1
    `;
    const row = rows[0];
    if (!row)
      throw new Error(`repository ${job.repositoryId} is not connected`);

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

    const result = await runRepositoryScan({
      commitSha,
      repositoryId: job.repositoryId,
      source: new GitHubRepositorySource(owner, repository, token.token),
      store,
      workspaceId: job.workspaceId,
    });
    console.log(
      `  scan ${row.full_name}@${commitSha.slice(0, 7)} → ${result.touchedRows} rows`,
    );
  };
}

async function main(): Promise<void> {
  process.loadEnvFile("apps/web/.env.local");
  const sql = postgres(required("DATABASE_URL"));
  const queue = new PostgresWorkerQueue(sql);
  const workerId = `local-${process.pid}`;
  const once = process.argv.includes("--once");

  const handlers: JobHandlers = {
    analyze: notImplemented("analyze"),
    coach: notImplemented("coach"),
    judge: notImplemented("judge"),
    pack: notImplemented("pack"),
    scan: createScanHandler(sql),
  };

  const workspaces = await sql<{ id: string }[]>`
    select id from public.workspaces order by created_at
  `;
  console.log(
    `worker ${workerId} draining ${workspaces.length} workspace(s)${once ? " (once)" : ""}`,
  );

  let idleRounds = 0;
  for (;;) {
    let worked = false;
    for (const { id } of workspaces) {
      for (;;) {
        const outcome = await runWorkerOnce({
          handlers,
          queue,
          workerId,
          workspaceId: id,
        });
        if (outcome === "idle") break;
        worked = true;
        console.log(`  job → ${outcome}`);
      }
    }
    if (!worked) {
      idleRounds += 1;
      if (once || idleRounds >= 3) break;
      await new Promise((resolve) => setTimeout(resolve, IDLE_SLEEP_MS));
    } else {
      idleRounds = 0;
    }
  }

  await sql.end();
  console.log("worker idle — exiting");
}

await main();
