import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolve } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { WORKSPACE_MAP } from "../../apps/web/lib/strings/map";
import { THEME_STORAGE_KEY } from "../../apps/web/lib/theme/theme-preference";
import { scanRepository } from "../../packages/core/src/index";
import { createLocalRepositorySource } from "../../packages/cli/src/local-source";
import { createUlid } from "../../packages/mcp/src/store";
import {
  createWorkspaceUser,
  deleteWorkspaceUser,
  serviceRoleClient,
  signIn,
} from "./helpers/session";

/**
 * The inspector's cards on `/app/map`, over a real scan (Phase 4 Wave D
 * todo 19 ⑴): a file shows the shared card — path, exports, and the sentence
 * for a summary nobody has written — and says it is in no module; a
 * synthesised concept shows its summary under the inferred badge with its
 * member files. Both themes are audited with the card open.
 */

const DRIFTED_DEMO = resolve("fixtures/drifted-demo");
const STAGE = "[data-testid='brain-map-stage']";
const EVIDENCE = path.resolve(".omo/evidence/phase4/todo-19");

test.use({ viewport: { height: 900, width: 1440 } });

async function seedScan(workspaceId: string) {
  const service = serviceRoleClient();
  const repository = await service.rpc("ensure_local_repository", {
    target_workspace_id: workspaceId,
    target_full_name: "local/inspector-cards",
  });
  expect(repository.error?.message ?? null).toBeNull();
  const { commitSha, source } = await createLocalRepositorySource(DRIFTED_DEMO);
  const plan = await scanRepository({ commitSha, source });
  const applied = await service.rpc("apply_repository_scan", {
    target_workspace_id: workspaceId,
    target_repository_id: String(repository.data),
    plan,
  });
  expect(applied.error?.message ?? null).toBeNull();
  return String(repository.data);
}

async function auditContrast(page: Page, theme: "dark" | "light") {
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
  await expect(page.locator(STAGE)).toHaveAttribute("data-settled", "true", {
    timeout: 20_000,
  });
  return page;
}

test("a file's card and a concept's card on the live map, both themes audited", async ({
  context,
  page,
}) => {
  test.setTimeout(150_000);
  const user = await createWorkspaceUser("map-inspector-cards");
  const service = serviceRoleClient();
  try {
    await signIn(context, user);
    const repositoryId = await seedScan(user.workspaceId);

    // A synthesised concept, as the enrich pass writes it: a graph node of
    // kind `concept` and its row, over two of the scanned files.
    const conceptId = createUlid(new Date());
    const node = await service.from("graph_nodes").insert({
      id: conceptId,
      kind: "concept",
      label: "Session policy",
      repository_id: repositoryId,
      workspace_id: user.workspaceId,
    });
    expect(node.error?.message ?? null).toBeNull();
    const concept = await service.from("concepts").insert({
      id: conceptId,
      kind: "system",
      member_paths: ["src/session.ts", "docs/adr/ADR-001-session-timeout.md"],
      name: "Session policy",
      repository_id: repositoryId,
      slug: "session-policy",
      source_digest: "e".repeat(64),
      summary: "세션 만료는 ADR-001의 30분 규칙을 src/session.ts가 구현합니다.",
      workspace_id: user.workspaceId,
    });
    expect(concept.error?.message ?? null).toBeNull();

    await page.goto("/app/map");
    await expect(page.locator(STAGE)).toHaveAttribute("data-settled", "true", {
      timeout: 20_000,
    });

    // The file: its hit target names the node; the card follows selection.
    // The concept is anchored to the same path, so the file is the hit
    // target with that path that is not the concept.
    const sessionFile = page.locator(
      `.brain-map-hit[data-node-path='src/session.ts']:not([data-node-id='${conceptId}'])`,
    );
    const fileId = await sessionFile.getAttribute("data-node-id");
    expect(fileId).toBeTruthy();
    await sessionFile.click();
    const card = page.getByTestId("inspector-card");
    await expect(card).toHaveAttribute("data-card", "artifact");
    await expect(card).toHaveAttribute("data-summary-state", "missing");
    await expect(card).toContainText(
      WORKSPACE_MAP.inspector.card.absence.missing,
    );
    // Exports are names the scan stored — never a signature.
    await expect(card).toContainText("SESSION_TIMEOUT_MS");
    await expect(card).not.toContainText("=");
    // The file and its test are one import cluster; nothing has summarised
    // it, and the card says so rather than showing an empty module.
    await expect(card.locator(".arr-card-module")).toHaveAttribute(
      "data-module",
      "pending",
    );
    await expect(card).toContainText(
      WORKSPACE_MAP.inspector.card.module.states.pending,
    );
    await expect(card).toContainText(
      WORKSPACE_MAP.inspector.card.module.members(2),
    );
    await expect(card.locator(".status-badge.verified")).toHaveCount(0);

    // The concept: the summary under the inferred badge, its members listed.
    await page.locator(`.brain-map-hit[data-node-id='${conceptId}']`).click();
    await expect(card).toHaveAttribute("data-card", "concept");
    await expect(card).toContainText("30분 규칙");
    await expect(card.locator(".status-badge.inferred")).toHaveCount(1);
    await expect(card).toContainText(
      WORKSPACE_MAP.inspector.card.concept.members(2),
    );
    await expect(card).toContainText("docs/adr/ADR-001-session-timeout.md");

    await mkdir(EVIDENCE, { recursive: true });
    for (const theme of ["dark", "light"] as const) {
      await auditContrast(page, theme);
      await page.locator(`.brain-map-hit[data-node-id='${conceptId}']`).click();
      await expect(page.getByTestId("inspector-card")).toHaveAttribute(
        "data-card",
        "concept",
      );
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2aa", "wcag21aa"])
        .withRules(["color-contrast"])
        .include(".arr-inspector")
        .analyze();
      const violations = results.violations.flatMap((violation) =>
        violation.nodes.map((entry) => ({
          html: entry.html.slice(0, 220),
          target: entry.target.map(String).join(" "),
        })),
      );
      await writeFile(
        path.join(EVIDENCE, `axe-contrast-map-inspector-card-${theme}.json`),
        `${JSON.stringify(
          {
            route: "/app/map",
            theme,
            violationCount: violations.length,
            violations,
          },
          null,
          2,
        )}\n`,
      );
      expect(violations, theme).toEqual([]);
      await page.screenshot({
        path: path.join(EVIDENCE, `map-inspector-card-${theme}.png`),
      });
    }
  } finally {
    await deleteWorkspaceUser(user.userId);
  }
});
