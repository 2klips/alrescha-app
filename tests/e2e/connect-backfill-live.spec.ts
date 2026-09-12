import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  createGitHubAppJwt,
  lookupGitHubRepositoryInstallation,
} from "../../apps/web/lib/github/api";
import {
  GITHUB_API_VERSION,
  LINK_SCHEMA_VERSION,
} from "../../packages/core/src/index";
import {
  createWorkspaceUser,
  deleteWorkspaceUser,
  optionalEnv,
  serviceRoleClient,
  signIn,
  signInExistingUser,
  type SignedInUser,
} from "./helpers/session";

/**
 * The live first run (Phase 4 Wave C todo 16, acceptance: "레포 연결 → 진행
 * 표시 → `/app/map` 노드 > 0", T2FV recorded).
 *
 * Everything else in the suite runs on fixtures. This one drives the product
 * path against the real GitHub App: the repository picker's form, the
 * installation token the connect mints, the default-branch read that keys
 * the backfill, the queue, the worker, and the two screens — and it times
 * the distance from the click to the first useful screen.
 *
 * It gates itself rather than failing: no App credentials, no network, an
 * App not installed on the pilot, a private pilot — each is a skip with the
 * reason, so the suite stays green on a machine that cannot run it and
 * says why. On a machine that can, it is the measurement.
 *
 * Whose workspace: `github_installations.github_installation_id` is unique,
 * so the installation can live in exactly one workspace. If this database
 * already holds it, the test signs in as that workspace's owner through a
 * magic link (nothing about the user is changed) and connects the pilot
 * there; the pair is then keyed by the *current* head, so a repository
 * connected before is scanned again at whatever the branch points at now.
 * On a clean database it seeds a harness user and deletes it afterwards.
 *
 * The worker is this repository's own `run-local.ts`, spawned with
 * `WORKER_WORKSPACE_IDS` so it drains only this workspace on a shared local
 * database, and with the AI provider keys replaced so nothing that is not a
 * scan or an analysis can spend anything.
 */

const PILOT =
  process.env.ALRESCHA_E2E_PILOT_REPOSITORY ?? "2klips/alrescha-app";
const EVIDENCE = path.resolve(".omo/evidence/phase4/todo-16");
const WORKER_DEADLINE_MS = 15 * 60_000;

test.use({ viewport: { height: 900, width: 1440 } });

async function githubPublic<T>(url: string): Promise<T | null> {
  const response = await fetch(url, {
    headers: { accept: "application/vnd.github+json" },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`GitHub answered ${response.status} for ${url}`);
  }
  return (await response.json()) as T;
}

async function githubAsApp<T>(url: string, appJwt: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${appJwt}`,
      "x-github-api-version": GITHUB_API_VERSION,
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub answered ${response.status} for ${url}`);
  }
  return (await response.json()) as T;
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Lines a reader needs, without anything a token or a path could leak in. */
function workerSummary(lines: readonly string[]): string[] {
  return lines.filter((line) =>
    /^\s*(scan @|ci evidence|worker |analyze @|job .* failed)/.test(line),
  );
}

test("connect → progress → map on the live GitHub App, with T2FV measured", async ({
  context,
  page,
}) => {
  test.setTimeout(WORKER_DEADLINE_MS + 5 * 60_000);

  const appId = optionalEnv("GITHUB_APP_ID");
  const privateKey = optionalEnv("GITHUB_APP_PRIVATE_KEY")?.replaceAll(
    "\\n",
    "\n",
  );
  test.skip(
    !appId || !privateKey,
    "GitHub App credentials are not configured (G2 shut on this machine)",
  );
  const appJwt = createGitHubAppJwt(appId!, privateKey!);

  let githubInstallationId: number | null = null;
  let unreachable: string | null = null;
  try {
    githubInstallationId =
      (await lookupGitHubRepositoryInstallation(PILOT, appJwt))
        ?.githubInstallationId ?? null;
  } catch (error) {
    unreachable = error instanceof Error ? error.message : String(error);
  }
  test.skip(unreachable !== null, `GitHub is unreachable: ${unreachable}`);
  test.skip(
    githubInstallationId === null,
    `the GitHub App is not installed on ${PILOT}`,
  );

  const repo = await githubPublic<{ default_branch: string; id: number }>(
    `https://api.github.com/repos/${PILOT}`,
  );
  test.skip(
    repo === null,
    `${PILOT} is not readable anonymously; point ALRESCHA_E2E_PILOT_REPOSITORY at a public repository the App is installed on`,
  );
  const branch = await githubPublic<{ commit: { sha: string } }>(
    `https://api.github.com/repos/${PILOT}/branches/${encodeURIComponent(repo!.default_branch)}`,
  );
  expect(branch?.commit.sha).toMatch(/^[0-9a-f]{40}$/);
  const head = branch!.commit.sha;

  const service = serviceRoleClient();
  const linked = await service
    .from("github_installations")
    .select("id, workspace_id")
    .eq("github_installation_id", githubInstallationId!)
    .maybeSingle();
  expect(linked.error).toBeNull();

  let user: SignedInUser;
  let createdUserId: string | null = null;
  let installationRowId: string;
  if (linked.data) {
    const workspace = await service
      .from("workspaces")
      .select("owner_user_id")
      .eq("id", linked.data.workspace_id)
      .single();
    expect(workspace.error).toBeNull();
    const owner = await service.auth.admin.getUserById(
      String(workspace.data?.owner_user_id),
    );
    expect(owner.error).toBeNull();
    user = await signInExistingUser(context, String(owner.data.user?.email));
    installationRowId = String(linked.data.id);
  } else {
    const fresh = await createWorkspaceUser("connect-live");
    createdUserId = fresh.userId;
    user = await signIn(context, fresh);
    const installation = await githubAsApp<{
      account: { id: number; login: string };
      permissions: Record<string, string>;
    }>(
      `https://api.github.com/app/installations/${githubInstallationId}`,
      appJwt,
    );
    const inserted = await service
      .from("github_installations")
      .insert({
        account_id: installation.account.id,
        account_login: installation.account.login,
        github_installation_id: githubInstallationId,
        permission_mode:
          installation.permissions.pull_requests === "write"
            ? "read_with_pr_proposals"
            : "read_only",
        workspace_id: user.workspaceId,
      })
      .select("id")
      .single();
    expect(inserted.error).toBeNull();
    installationRowId = String(inserted.data?.id);
  }

  let worker: ChildProcess | null = null;
  const workerLines: string[] = [];
  try {
    // What the OAuth callback stores for the picker to list.
    const available = await service
      .from("github_available_repositories")
      .upsert(
        {
          default_branch: repo!.default_branch,
          full_name: PILOT,
          github_repository_id: repo!.id,
          installation_id: installationRowId,
          observed_at: new Date().toISOString(),
          workspace_id: user.workspaceId,
        },
        { onConflict: "workspace_id,installation_id,github_repository_id" },
      );
    expect(available.error).toBeNull();

    await mkdir(EVIDENCE, { recursive: true });

    // 1. Connect through the real picker. The redirect carries whether the
    // head was read and the pair queued — `unscheduled` here is the failure
    // this whole todo existed to remove.
    await page.goto(
      `/app/connect/github/repositories?installation=${installationRowId}`,
    );
    const connectAt = Date.now();
    await page.getByRole("button", { exact: true, name: PILOT }).click();
    await expect(page).toHaveURL(/\/app\?github=pending&backfill=scheduled$/, {
      timeout: 60_000,
    });

    const repository = await service
      .from("repositories")
      .select("id")
      .eq("workspace_id", user.workspaceId)
      .eq("full_name", PILOT)
      .single();
    expect(repository.error).toBeNull();
    const repositoryId = String(repository.data?.id);
    const queued = await service
      .from("jobs")
      .select("id,kind,credit_cost,status")
      .eq("workspace_id", user.workspaceId)
      .in("idempotency_key", [
        `backfill:${repositoryId}:${head}`,
        `backfill:${repositoryId}:${head}:analyze`,
      ]);
    expect(queued.error).toBeNull();
    expect(
      (queued.data ?? [])
        .map(({ credit_cost, kind }) => [kind, credit_cost])
        .sort(),
    ).toEqual([
      ["analyze", 0],
      ["scan", 0],
    ]);
    let scanJobId = String(
      queued.data?.find(({ kind }) => kind === "scan")?.id,
    );
    let analyzeJobId = String(
      queued.data?.find(({ kind }) => kind === "analyze")?.id,
    );

    // The pair is keyed by the head. A reused workspace that already
    // backfilled this very head gets the same, finished pair back — honest
    // idempotency, and nothing to time. The measured run is then a full
    // relink at the same head through the same queue function the button
    // calls: the same fetches, the same apply, the same analysis. The
    // evidence says which of the two it timed.
    let measured: "backfill" | "rescan-full" = "backfill";
    let measureFrom = connectAt;
    if (
      queued.data?.find(({ kind }) => kind === "scan")?.status === "succeeded"
    ) {
      const rescan = await service.rpc("enqueue_repository_rescan", {
        expected_link_schema_version: LINK_SCHEMA_VERSION,
        requested_mode: "full",
        target_repository_id: repositoryId,
        target_workspace_id: user.workspaceId,
      });
      expect(rescan.error).toBeNull();
      const outcome = rescan.data as {
        jobId: string | null;
        scheduled: boolean;
      };
      expect(outcome.scheduled).toBe(true);
      measured = "rescan-full";
      measureFrom = Date.now();
      scanJobId = String(outcome.jobId);
      const partner = await service
        .from("jobs")
        .select("id")
        .eq("workspace_id", user.workspaceId)
        .eq("idempotency_key", `rescan:${repositoryId}:${head}:full:analyze`)
        .single();
      expect(partner.error).toBeNull();
      analyzeJobId = String(partner.data?.id);
    }
    const jobStatus = async (id: string) =>
      (
        await service
          .from("jobs")
          .select("status,last_error")
          .eq("id", id)
          .single()
      ).data as { last_error: string | null; status: string } | null;

    // 2. The home shows the pair in the queue, at the live head.
    await page.goto("/app");
    const stages = page
      .getByTestId("scan-progress")
      .locator(".home-scan-stages");
    await expect(stages).toHaveAttribute("data-structure", /queued|running/);
    await expect(
      page.getByTestId("scan-progress").locator(".home-scan-commit code"),
    ).toHaveText(head.slice(0, 7));
    await page.screenshot({
      fullPage: true,
      path: path.join(EVIDENCE, "live-home-queued.png"),
    });

    // 3. The worker, on this workspace only.
    worker = spawn(
      process.execPath,
      ["--import", "tsx", "apps/worker/src/run-local.ts", "--once"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          // Nothing but scan and analyze may do work in this run: a stale
          // AI job in the same workspace fails on these instead of spending.
          ANTHROPIC_API_KEY: "e2e-disabled",
          OPENAI_API_KEY: "e2e-disabled",
          WORKER_CONCURRENCY: "1",
          WORKER_WORKSPACE_IDS: user.workspaceId,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let exitCode: number | null = null;
    const exited = new Promise<number | null>((resolve) => {
      worker!.on("exit", (code) => {
        exitCode = code;
        resolve(code);
      });
    });
    for (const stream of [worker.stdout, worker.stderr]) {
      stream?.on("data", (chunk: Buffer) => {
        for (const line of chunk.toString("utf8").split(/\r?\n/)) {
          if (line.trim()) workerLines.push(line);
        }
      });
    }

    // 4. Structure ready at the head: the first useful screen.
    let structureReadyAt: number | null = null;
    const deadline = Date.now() + WORKER_DEADLINE_MS;
    while (Date.now() < deadline) {
      const scan = await jobStatus(scanJobId);
      const row = await service
        .from("repositories")
        .select("last_scanned_commit_sha")
        .eq("id", repositoryId)
        .single();
      if (
        scan?.status === "succeeded" &&
        row.data?.last_scanned_commit_sha === head
      ) {
        structureReadyAt = Date.now();
        break;
      }
      if (exitCode !== null) break;
      await sleep(3_000);
    }
    expect(
      structureReadyAt,
      `the scan did not land at ${head.slice(0, 7)}; scan job: ${JSON.stringify(await jobStatus(scanJobId))}; worker said:\n${workerSummary(workerLines).join("\n")}`,
    ).not.toBeNull();

    await page.goto("/app");
    await expect(stages).toHaveAttribute("data-structure", "ready");
    await expect(
      page.getByTestId("scan-progress").locator(".home-scan-commit code"),
    ).toHaveText(head.slice(0, 7));
    await page.screenshot({
      fullPage: true,
      path: path.join(EVIDENCE, "live-home-structure-ready.png"),
    });

    await page.goto("/app/map");
    const stage = page.getByTestId("brain-map-stage");
    await expect(stage).toBeVisible();
    const nodeCount = Number(await stage.getAttribute("data-canvas-nodes"));
    expect(nodeCount).toBeGreaterThan(0);
    await expect(page.locator(".arr-proof-heading .arr-kicker")).toContainText(
      head.slice(0, 7),
    );
    await expect(stage).toHaveAttribute("data-settled", "true", {
      timeout: 60_000,
    });
    const mapVisibleAt = Date.now();
    await page.screenshot({
      fullPage: true,
      path: path.join(EVIDENCE, "live-map.png"),
    });

    // 5. The analysis follows; wait for the worker to go idle.
    const remaining = deadline - Date.now();
    const code = await Promise.race([
      exited,
      sleep(Math.max(remaining, 0)).then(() => "timeout" as const),
    ]);
    const workerIdleAt = Date.now();
    const after = await service
      .from("repositories")
      .select("last_analyzed_commit_sha")
      .eq("id", repositoryId)
      .single();
    const analyzeJob = await jobStatus(analyzeJobId);
    await page.goto("/app");
    const analysis = await stages.getAttribute("data-analysis");
    await page.screenshot({
      fullPage: true,
      path: path.join(EVIDENCE, "live-home-analysis.png"),
    });

    const seconds = (from: number, to: number) =>
      Math.round(((to - from) / 1000) * 10) / 10;
    const measurement = {
      analysisAtHead: after.data?.last_analyzed_commit_sha === head,
      analysisJob: analyzeJob,
      analysisStage: analysis,
      head,
      mapNodeCount: nodeCount,
      measured,
      measuredAt: new Date().toISOString(),
      pilot: PILOT,
      startToMapVisibleSeconds: seconds(measureFrom, mapVisibleAt),
      startToStructureReadySeconds: seconds(measureFrom, structureReadyAt!),
      startToWorkerIdleSeconds:
        code === "timeout" ? null : seconds(measureFrom, workerIdleAt),
      structureStage: "ready",
      workerExitCode: code === "timeout" ? "timeout" : code,
      workerSummary: workerSummary(workerLines),
      workspaceReused: Boolean(linked.data),
    };
    await writeFile(
      path.join(EVIDENCE, "t2fv-live.json"),
      `${JSON.stringify(measurement, null, 2)}\n`,
    );
    expect(code, "the worker did not go idle within the deadline").not.toBe(
      "timeout",
    );
  } finally {
    if (worker && worker.exitCode === null) worker.kill();
    if (createdUserId) await deleteWorkspaceUser(createdUserId);
  }
});
