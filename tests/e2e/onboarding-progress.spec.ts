import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolve } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import {
  LINK_SCHEMA_VERSION,
  scanRepository,
} from "../../packages/core/src/index";
import { createLocalRepositorySource } from "../../packages/cli/src/local-source";
import { HOME } from "../../apps/web/lib/strings/home";
import { WORKSPACE_MAP } from "../../apps/web/lib/strings/map";
import { THEME_STORAGE_KEY } from "../../apps/web/lib/theme/theme-preference";
import {
  createWorkspaceUser,
  deleteWorkspaceUser,
  serviceRoleClient,
  signIn,
} from "./helpers/session";

/**
 * The first run, as the user watches it (Phase 4 Wave C todo 16, 보완 R-02).
 *
 * A connect queues a scan and its analysis; the home shows the two stages
 * from the queue's own rows and offers "다시 스캔" once a scan has landed.
 * This drives every state the screen can show without a GitHub round trip:
 * the rows are seeded through the service role and the queue function the
 * connect calls, and the job transitions the worker would make are applied
 * by hand — the live path, worker included, is `connect-backfill-live.spec`.
 *
 * What is asserted is the split the remedy asked for: structure ready and
 * analysis pending are two facts, the map opens on the first, and a failed
 * scan shows the queue's words rather than a spinner (WORK_SPEC §4.5).
 */

test.use({ colorScheme: "dark", viewport: { height: 900, width: 1440 } });

const HEAD = "a".repeat(40);
const DRIFTED_DEMO = resolve("fixtures/drifted-demo");
const EVIDENCE = path.resolve(".omo/evidence/phase4/todo-16");

/**
 * The stage list, its state chips and the error line are new surface on a
 * screen the axe sweep only ever sees empty (a fresh workspace has no
 * repository). Audited here, on the states that show them, both themes.
 */
async function auditHomeContrast(
  page: Page,
  theme: "dark" | "light",
  state: string,
): Promise<void> {
  await mkdir(EVIDENCE, { recursive: true });
  await page.evaluate(
    ([key, value]: readonly string[]) =>
      window.localStorage.setItem(key as string, value as string),
    [THEME_STORAGE_KEY, theme] as const,
  );
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.getAttribute("data-theme")),
    )
    .toBe(theme);
  await expect(page.getByTestId("scan-progress")).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2aa", "wcag21aa"])
    .withRules(["color-contrast"])
    .analyze();
  const violations = results.violations.flatMap((violation) =>
    violation.nodes.map((node) => ({
      html: node.html.slice(0, 220),
      message: node.any[0]?.message ?? "",
      target: node.target.map(String).join(" "),
    })),
  );
  await writeFile(
    path.join(EVIDENCE, `axe-contrast-home-${state}-${theme}.json`),
    `${JSON.stringify(
      {
        passes: results.passes.reduce(
          (sum, entry) => sum + entry.nodes.length,
          0,
        ),
        route: "/app",
        state,
        theme,
        violationCount: violations.length,
        violations,
      },
      null,
      2,
    )}\n`,
  );
  expect(violations, `${state} in ${theme}`).toEqual([]);
}

/** Unique across a shared database: the column is `unique`, and specs run in parallel. */
function installationNumber(): number {
  return Date.now() * 10 + (process.pid % 10);
}

test("a GitHub connect shows its stages, its failure, and offers a rescan once landed", async ({
  context,
  page,
}) => {
  test.setTimeout(120_000);
  const user = await createWorkspaceUser("progress-github");
  const service = serviceRoleClient();
  try {
    await signIn(context, user);

    // 1. A connected repository, exactly as the connect flow stores it.
    const installation = await service
      .from("github_installations")
      .insert({
        account_id: 7,
        account_login: "arr-e2e",
        github_installation_id: installationNumber(),
        workspace_id: user.workspaceId,
      })
      .select("id")
      .single();
    expect(installation.error).toBeNull();
    const repository = await service
      .from("repositories")
      .insert({
        default_branch: "main",
        full_name: "arr-e2e/progress",
        github_repository_id: 4242,
        installation_id: installation.data?.id,
        selected_at: new Date().toISOString(),
        workspace_id: user.workspaceId,
      })
      .select("id")
      .single();
    expect(repository.error).toBeNull();
    const repositoryId = String(repository.data?.id);

    // 2. A connect that could not read the head queues nothing and says so.
    await page.goto("/app?github=pending&backfill=unscheduled");
    await expect(page.getByTestId("journey-graph")).toHaveAttribute(
      "data-step-state",
      "active",
    );
    await expect(page.getByTestId("backfill-unscheduled")).toContainText(
      HOME.journey.graph.notScheduled,
    );
    const stages = page
      .getByTestId("scan-progress")
      .locator(".home-scan-stages");
    await expect(stages).toHaveAttribute("data-structure", "idle");
    await expect(
      page
        .getByTestId("scan-progress")
        .locator("[data-rescan='never-scanned']"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: HOME.scan.rescan.cta }),
    ).toHaveCount(0);

    // 3. The backfill the connect queues: scan and analysis, both waiting.
    const queued = await service.rpc("enqueue_backfill_scan", {
      head_commit_sha: HEAD,
      target_repository_id: repositoryId,
      target_workspace_id: user.workspaceId,
    });
    expect(queued.error).toBeNull();
    const scanJobId = String(queued.data);

    await page.goto("/app?github=pending&backfill=scheduled");
    await expect(page.getByTestId("journey-graph")).toContainText(
      HOME.journey.graph.scanning,
    );
    await expect(stages).toHaveAttribute("data-structure", "queued");
    await expect(stages).toHaveAttribute("data-analysis", "queued");
    await expect(
      page.getByTestId("scan-progress").locator(".home-scan-commit code"),
    ).toHaveText(HEAD.slice(0, 7));
    // Nothing to rescan while the first scan is in the queue.
    await expect(
      page.getByRole("button", { name: HOME.scan.rescan.busy }),
    ).toBeDisabled();

    // The map opens on structure, and until then it says "scanning" rather
    // than asking the user to connect again.
    await page.goto("/app/map");
    const empty = page.getByTestId("workspace-map-empty");
    await expect(empty).toHaveAttribute("data-map-empty", "scanning");
    await expect(empty).toContainText(
      WORKSPACE_MAP.empty.scanningTitle("arr-e2e/progress"),
    );
    await expect(
      empty.getByRole("link", { name: WORKSPACE_MAP.empty.progress }),
    ).toHaveAttribute("href", "/app");
    await expect(page.getByTestId("brain-map-stage")).toHaveCount(0);

    // 4. The scan fails for good: the queue's words reach the screen.
    const failed = await service
      .from("jobs")
      .update({
        attempt_count: 3,
        completed_at: new Date().toISOString(),
        last_error: "GitHub repository request failed: 403 (rate limited)",
        status: "failed",
      })
      .eq("id", scanJobId);
    expect(failed.error).toBeNull();

    await page.goto("/app");
    await expect(stages).toHaveAttribute("data-structure", "failed");
    await expect(
      stages.locator("[data-stage='structure'] .home-scan-error"),
    ).toContainText("GitHub repository request failed: 403 (rate limited)");
    // The analysis is still queued — its own state, not the scan's.
    await expect(stages).toHaveAttribute("data-analysis", "queued");
    // The failed chip, the error line and the queued chip, audited in dark.
    await auditHomeContrast(page, "dark", "scan-failed");

    // 4b. A first scan that failed for good can be asked for again (PR #9
    // follow-up, 202609120004): the button is there, worded as what it is,
    // and it queues a new scan at the head the connect read — a new row
    // under the next generation of the key, the failed row untouched, and
    // the still-queued analysis reused rather than duplicated.
    await expect(
      page.getByTestId("scan-progress").locator("[data-rescan='retry']"),
    ).toBeVisible();
    await page.getByRole("button", { name: HOME.scan.rescan.retryCta }).click();
    await expect(page).toHaveURL(/rescan=first-scan/);
    await expect(page.getByTestId("rescan-outcome")).toHaveAttribute(
      "data-outcome",
      "first-scan",
    );
    await expect(page.getByTestId("rescan-outcome")).toContainText(
      HOME.scan.rescan.outcomes.firstScan,
    );
    await expect(stages).toHaveAttribute("data-structure", "queued");
    await expect(stages).toHaveAttribute("data-analysis", "queued");

    const backfillJobs = await service
      .from("jobs")
      .select("id,kind,status,credit_cost,idempotency_key")
      .eq("workspace_id", user.workspaceId)
      .like("idempotency_key", "backfill:%")
      .order("idempotency_key");
    expect(backfillJobs.error).toBeNull();
    expect(
      (backfillJobs.data ?? []).map(
        ({ credit_cost, idempotency_key, kind, status }) => [
          idempotency_key.replace(`backfill:${repositoryId}:${HEAD}`, "…"),
          kind,
          status,
          credit_cost,
        ],
      ),
    ).toEqual([
      ["…", "scan", "failed", 0],
      ["…:analyze", "analyze", "queued", 0],
      ["…:r1", "scan", "queued", 0],
    ]);
    const retriedScanJobId = String(
      (backfillJobs.data ?? []).find(({ idempotency_key }) =>
        idempotency_key.endsWith(":r1"),
      )?.id,
    );

    // 5. The retried scan lands (what the worker would have written).
    // Structure is ready while the analysis has not caught up: two states,
    // and the button is back.
    const landed = await service
      .from("repositories")
      .update({
        last_scanned_commit_sha: HEAD,
        link_schema_version: LINK_SCHEMA_VERSION,
      })
      .eq("id", repositoryId);
    expect(landed.error).toBeNull();
    const succeeded = await service
      .from("jobs")
      .update({ last_error: null, status: "succeeded" })
      .eq("id", retriedScanJobId);
    expect(succeeded.error).toBeNull();

    await page.goto("/app");
    await expect(stages).toHaveAttribute("data-structure", "ready");
    await expect(stages).toHaveAttribute("data-analysis", "queued");
    await expect(
      stages.locator("[data-stage='structure'] .home-scan-error"),
    ).toHaveCount(0);
    // The ready chip, the queued chip and the button, audited in light.
    await auditHomeContrast(page, "light", "structure-ready");

    // 6. "다시 스캔" queues the same pair again, free, and the page says so.
    await page.getByRole("button", { name: HOME.scan.rescan.cta }).click();
    await expect(page).toHaveURL(/rescan=scheduled/);
    await expect(page.getByTestId("rescan-outcome")).toHaveAttribute(
      "data-outcome",
      "scheduled",
    );
    await expect(page.getByTestId("rescan-outcome")).toContainText(
      HOME.scan.rescan.outcomes.scheduled,
    );
    await expect(stages).toHaveAttribute("data-structure", "queued");
    await expect(
      page.getByRole("button", { name: HOME.scan.rescan.busy }),
    ).toBeDisabled();

    const rescanJobs = await service
      .from("jobs")
      .select("kind,credit_cost,idempotency_key")
      .eq("workspace_id", user.workspaceId)
      .like("idempotency_key", "rescan:%")
      .order("idempotency_key");
    expect(rescanJobs.error).toBeNull();
    expect(
      (rescanJobs.data ?? []).map(({ credit_cost, kind }) => [
        kind,
        credit_cost,
      ]),
    ).toEqual([
      ["scan", 0],
      ["analyze", 0],
    ]);
  } finally {
    await deleteWorkspaceUser(user.userId);
  }
});

/**
 * Two connected repositories (PR #9 follow-up, OQ-042 interim rule). The
 * home and the header are about the repository the user last *selected*,
 * not the one created last — production showed one repository's old failed
 * backfill while the other's fresh pair had just succeeded. Selection is
 * the connect picker's existing act; the home says there are others and
 * points at it.
 */
test("the home and the header follow the repository last selected, not the newest", async ({
  context,
  page,
}) => {
  const user = await createWorkspaceUser("progress-selection");
  const service = serviceRoleClient();
  try {
    await signIn(context, user);
    const installation = await service
      .from("github_installations")
      .insert({
        account_id: 8,
        account_login: "arr-e2e",
        github_installation_id: installationNumber(),
        workspace_id: user.workspaceId,
      })
      .select("id")
      .single();
    expect(installation.error).toBeNull();
    const installationId = String(installation.data?.id);

    // Connected first, selected again most recently — and analysed.
    const anHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const selected = await service
      .from("repositories")
      .insert({
        default_branch: "main",
        full_name: "arr-e2e/selected-again",
        github_repository_id: 4343,
        installation_id: installationId,
        last_analyzed_commit_sha: HEAD,
        last_scanned_commit_sha: HEAD,
        link_schema_version: LINK_SCHEMA_VERSION,
        selected_at: new Date().toISOString(),
        workspace_id: user.workspaceId,
      })
      .select("id")
      .single();
    expect(selected.error).toBeNull();
    // Connected after it (a newer row), but selected earlier — and failed.
    const later = await service
      .from("repositories")
      .insert({
        default_branch: "main",
        full_name: "arr-e2e/connected-later",
        github_repository_id: 4344,
        installation_id: installationId,
        selected_at: anHourAgo,
        workspace_id: user.workspaceId,
      })
      .select("id")
      .single();
    expect(later.error).toBeNull();

    await page.goto("/app");
    await expect(page.getByTestId("journey-connect")).toContainText(
      HOME.journey.connect.done("arr-e2e/selected-again"),
    );
    await expect(
      page.locator(".repository-header .repository-identity strong"),
    ).toHaveText("arr-e2e/selected-again");
    const stages = page
      .getByTestId("scan-progress")
      .locator(".home-scan-stages");
    await expect(stages).toHaveAttribute("data-structure", "ready");
    await expect(stages).toHaveAttribute("data-analysis", "ready");
    await expect(
      page.getByRole("button", { name: HOME.scan.rescan.cta }),
    ).toBeVisible();
    const others = page.getByTestId("repository-others");
    await expect(others).toContainText(HOME.journey.connect.others(2));
    await expect(
      others.getByRole("link", { name: HOME.journey.connect.switchCta }),
    ).toHaveAttribute(
      "href",
      `/app/connect/github/repositories?installation=${installationId}`,
    );
  } finally {
    await deleteWorkspaceUser(user.userId);
  }
});

test("a locally pushed repository is ready on structure and analysed on its own machine", async ({
  context,
  page,
}) => {
  const user = await createWorkspaceUser("progress-local");
  try {
    await signIn(context, user);

    // Seeded through the shared persistence function — what `alrescha push`
    // stores, minus the HTTP hop that `local-ingest-card.spec` already walks.
    const service = serviceRoleClient();
    const repository = await service.rpc("ensure_local_repository", {
      target_full_name: "local/progress",
      target_workspace_id: user.workspaceId,
    });
    expect(repository.error).toBeNull();
    const { commitSha, source } =
      await createLocalRepositorySource(DRIFTED_DEMO);
    const plan = await scanRepository({ commitSha, source });
    const applied = await service.rpc("apply_repository_scan", {
      plan,
      target_repository_id: String(repository.data),
      target_workspace_id: user.workspaceId,
    });
    expect(applied.error).toBeNull();

    await page.goto("/app");
    const stages = page
      .getByTestId("scan-progress")
      .locator(".home-scan-stages");
    await expect(stages).toHaveAttribute("data-structure", "ready");
    // The hosted worker never analyses a local repository (todo 17, hard
    // rule ③): the stage says where the analysis happens instead.
    await expect(stages).toHaveAttribute("data-analysis", "local");
    await expect(stages.locator("[data-stage='analysis']")).toContainText(
      HOME.scan.states.local,
    );
    await expect(
      page.getByTestId("scan-progress").locator("[data-rescan='local']"),
    ).toContainText(HOME.scan.rescan.local);
    await expect(
      page.getByRole("button", { name: HOME.scan.rescan.cta }),
    ).toHaveCount(0);

    // Structure ready is what opens the map.
    await page.goto("/app/map");
    const stage = page.getByTestId("brain-map-stage");
    await expect(stage).toBeVisible();
    expect(
      Number(await stage.getAttribute("data-canvas-nodes")),
    ).toBeGreaterThan(0);
    await expect(page.getByTestId("workspace-map-empty")).toHaveCount(0);
  } finally {
    await deleteWorkspaceUser(user.userId);
  }
});
