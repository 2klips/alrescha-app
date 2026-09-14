import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

import { ciEvidenceRecords } from "../../apps/worker/src/ci-evidence";
import { PostgresAnalysisStore } from "../../apps/worker/src/postgres-analysis-store";
import { THEME_STORAGE_KEY } from "../../apps/web/lib/theme/theme-preference";
import { GRADE } from "../../apps/web/lib/strings/common";
import {
  ingestCiTestReports,
  scanRepository,
} from "../../packages/core/src/index";
import { createLocalRepositorySource } from "../../packages/cli/src/local-source";
import {
  createWorkspaceUser,
  deleteWorkspaceUser,
  optionalEnv,
  serviceRoleClient,
  signIn,
} from "./helpers/session";

/**
 * The `verified` grade on the workspace map (Phase 4 Wave C todo 18).
 *
 * `tests/ci-evidence-persistence.test.ts` proves the promotion at the
 * database level: a CI report → an `evidence` row with a `supports` verdict
 * → a `tests` edge onto the test file → `verified` in the map model. What
 * it cannot show is the screen — the first `verified` node the product can
 * produce from stored rows, painted, with its hit target carrying the grade
 * a keyboard or a screen reader would read.
 *
 * Two facts, in order. First the negative: a scanned workspace with no
 * execution evidence has zero `verified` nodes, live, on the real canvas
 * (ADR-001 — the scan's import-derived `tests` edges promote nothing).
 * Then the positive: the recorded Actions run, written by the production
 * writer (`PostgresAnalysisStore.reconcileCiEvidence`, the one the analyze
 * job calls) through the real migrations, and the test file it names is
 * `verified` while the code it imports stays `inferred`.
 *
 * The evidence rows carry the recorded run's commit, as the persistence
 * test's do; the map grades nodes by the rows and edges, not by commit.
 */

test.use({ colorScheme: "dark", viewport: { height: 900, width: 1440 } });

const DRIFTED_DEMO = resolve("fixtures/drifted-demo");
const ACTIONS_ROOT = resolve("fixtures/drifted-demo/recordings/github/actions");
const EVIDENCE = path.resolve(".omo/evidence/phase4/todo-18");

/** The test file the recorded run executed, as the scan stores its path. */
const TEST_FILE = "tests/session.test.ts";
/** The code it imports — promoted by nothing (ADR-001). */
const CODE_FILE = "src/session.ts";

async function recordedRun() {
  const read = async (name: string) =>
    readFile(resolve(ACTIONS_ROOT, name), "utf8");
  const artifacts = JSON.parse(await read("artifacts.json")) as {
    artifacts: Array<{
      id: number;
      name: string;
      workflow_run: { head_sha: string };
    }>;
  };
  const checkRuns = JSON.parse(await read("check-runs.json")) as {
    check_runs: Array<{
      conclusion: string | null;
      head_sha: string;
      name: string;
      status: string;
    }>;
  };
  const headSha = artifacts.artifacts[0]!.workflow_run.head_sha;
  return {
    analyzedCommitSha: headSha,
    checkRuns: checkRuns.check_runs,
    reports: [
      {
        artifactId: artifacts.artifacts[0]!.id,
        artifactName: artifacts.artifacts[0]!.name,
        content: await read("junit.xml"),
        format: "junit" as const,
        headSha,
      },
      {
        artifactId: artifacts.artifacts[1]!.id,
        artifactName: artifacts.artifacts[1]!.name,
        content: await read("vitest.json"),
        format: "vitest-json" as const,
        headSha,
      },
    ],
  };
}

async function themeOf(page: Page): Promise<string | null> {
  return page.evaluate(() =>
    document.documentElement.getAttribute("data-theme"),
  );
}

test("a CI run makes its test file verified on the map — and nothing else", async ({
  context,
  page,
}) => {
  test.setTimeout(120_000);
  const databaseUrl = optionalEnv("DATABASE_URL");
  test.skip(
    databaseUrl === null,
    "DATABASE_URL is not in apps/web/.env.local; the production writer needs a direct connection",
  );

  const user = await createWorkspaceUser("map-verified");
  const service = serviceRoleClient();
  const sql = postgres(databaseUrl!, { max: 1 });
  try {
    await signIn(context, user);
    await mkdir(EVIDENCE, { recursive: true });

    // A scanned workspace, through the shared persistence function.
    const repository = await service.rpc("ensure_local_repository", {
      target_full_name: "local/map-verified",
      target_workspace_id: user.workspaceId,
    });
    expect(repository.error).toBeNull();
    const repositoryId = String(repository.data);
    const { commitSha, source } =
      await createLocalRepositorySource(DRIFTED_DEMO);
    const plan = await scanRepository({ commitSha, source });
    const applied = await service.rpc("apply_repository_scan", {
      plan,
      target_repository_id: repositoryId,
      target_workspace_id: user.workspaceId,
    });
    expect(applied.error).toBeNull();

    const artifacts = await service
      .from("artifacts")
      .select("id,path")
      .eq("workspace_id", user.workspaceId);
    expect(artifacts.error).toBeNull();
    const nodeByPath = new Map(
      (artifacts.data ?? []).map((row) => [String(row.path), String(row.id)]),
    );
    const testNodeId = nodeByPath.get(TEST_FILE);
    const codeNodeId = nodeByPath.get(CODE_FILE);
    expect(testNodeId, `${TEST_FILE} was not scanned`).toBeTruthy();
    expect(codeNodeId, `${CODE_FILE} was not scanned`).toBeTruthy();

    // 1. Without execution evidence: not one verified node, on the real stage.
    await page.goto("/app/map");
    const stage = page.getByTestId("brain-map-stage");
    await expect(stage).toBeVisible();
    await expect(stage).toHaveAttribute("data-settled", "true", {
      timeout: 30_000,
    });
    const hits = page.getByTestId("brain-map-hits").locator(".brain-map-hit");
    expect(
      Number(await stage.getAttribute("data-canvas-nodes")),
    ).toBeGreaterThan(5);
    await expect(
      hits.filter({ has: page.locator("[data-grade='verified']") }),
    ).toHaveCount(0);
    await expect(
      page.locator(`.brain-map-hit[data-node-id='${testNodeId}']`),
    ).toHaveAttribute("data-grade", "inferred");

    // 2. The recorded run, through the production writer.
    const run = await recordedRun();
    const ingestion = ingestCiTestReports(run);
    expect(ingestion.testFiles.length).toBeGreaterThan(0);
    const records = ciEvidenceRecords({
      analyzedCommitSha: run.analyzedCommitSha,
      measured: [],
      nodeByPath,
      // No analysis ran here, so no requirement node to support — the
      // test-file promotion is the one under test.
      requirementNodesByCode: new Map(),
      scope: { repositoryId, workspaceId: user.workspaceId },
      testFiles: ingestion.testFiles,
    });
    const store = new PostgresAnalysisStore(sql);
    const delta = await store.reconcileCiEvidence({
      ...records,
      repositoryId,
      workspaceId: user.workspaceId,
    });
    expect(delta).toMatchObject({ removed: 0, supporting: 1, written: 1 });

    // 3. The test file is verified; the code under it is not.
    await page.reload();
    await expect(stage).toBeVisible();
    await expect(stage).toHaveAttribute("data-settled", "true", {
      timeout: 30_000,
    });
    const verifiedHit = page.locator(
      `.brain-map-hit[data-node-id='${testNodeId}']`,
    );
    await expect(verifiedHit).toHaveAttribute("data-grade", "verified");
    await expect(verifiedHit).toHaveAttribute(
      "aria-label",
      new RegExp(`session\\.test\\.ts.*${GRADE.verified}`),
    );
    await expect(
      page.locator(`.brain-map-hit[data-node-id='${codeNodeId}']`),
    ).toHaveAttribute("data-grade", "inferred");
    // Exactly two verified nodes: the evidence node itself (execution
    // evidence is a node on the map) and the file its `tests` edge reaches.
    // Not the requirement (none was analysed), not the code under the test.
    const evidenceNodeId = records.evidence[0]!.id;
    const verifiedIds = await page
      .locator(".brain-map-hit[data-grade='verified']")
      .evaluateAll((elements) =>
        elements.map((element) => element.getAttribute("data-node-id")),
      );
    expect(verifiedIds.sort()).toEqual([evidenceNodeId, testNodeId].sort());

    // The inspector says it too, in the product's own badge.
    await verifiedHit.click();
    const inspector = page.getByRole("complementary", {
      name: "선택한 노드 상세",
    });
    await expect(inspector.locator(".status-badge")).toContainText(
      GRADE.verified,
    );

    // 4. The snapshot, both themes (1440×900).
    await expect.poll(() => themeOf(page)).toBe("dark");
    await page.screenshot({
      fullPage: true,
      path: path.join(EVIDENCE, "map-verified-dark.png"),
    });
    await page.evaluate(
      (key: string) => window.localStorage.setItem(key, "light"),
      THEME_STORAGE_KEY,
    );
    await page.reload();
    await expect.poll(() => themeOf(page)).toBe("light");
    await expect(stage).toHaveAttribute("data-settled", "true", {
      timeout: 30_000,
    });
    await expect(verifiedHit).toHaveAttribute("data-grade", "verified");
    await page.screenshot({
      fullPage: true,
      path: path.join(EVIDENCE, "map-verified-light.png"),
    });
  } finally {
    await sql.end();
    await deleteWorkspaceUser(user.userId);
  }
});
