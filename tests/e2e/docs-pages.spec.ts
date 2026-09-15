import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolve } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { DOCS } from "../../apps/web/lib/strings/docs";
import { THEME_STORAGE_KEY } from "../../apps/web/lib/theme/theme-preference";
import {
  buildDocSkeletonPages,
  type DocSkeletonRows,
} from "../../apps/worker/src/doc-skeleton-job";
import { scanRepository } from "../../packages/core/src/index";
import { createLocalRepositorySource } from "../../packages/cli/src/local-source";
import {
  createWorkspaceUser,
  deleteWorkspaceUser,
  serviceRoleClient,
  signIn,
} from "./helpers/session";

/**
 * The doc pages on a live workspace (Phase 4 Wave D todo 20): the skeleton
 * pass runs the worker's own builder over a real scan and stores through
 * the same RPC the worker calls; prose lands through the conditional write;
 * then the module gains a member in a new directory, which renames its page
 * and makes its prose stale. What is asserted is what a reader sees: the
 * list says which pages have current prose, the old address follows the
 * page, the stale prose is named rather than served, and the page that was
 * cited lists the page that cited it. Both themes are audited.
 */

const DRIFTED_DEMO = resolve("fixtures/drifted-demo");
const EVIDENCE = path.resolve(".omo/evidence/phase4/todo-20");
const REPO_PROSE = "저장소는 세션 정책과 감사 로그를 하나의 서비스로 묶습니다.";
const MODULE_PROSE = "세션 모듈은 ADR-001의 만료 규칙을 구현합니다.";

test.use({ viewport: { height: 900, width: 1440 } });

interface PageRow {
  readonly id: string;
  readonly member_digest: string;
  readonly member_paths: string[];
  readonly previous_slugs: string[];
  readonly scope: string;
  readonly slug: string;
  readonly summary: string | null;
  readonly title: string;
}

async function seedScan(workspaceId: string) {
  const service = serviceRoleClient();
  const repository = await service.rpc("ensure_local_repository", {
    target_workspace_id: workspaceId,
    target_full_name: "local/doc-pages",
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
  return { commitSha, repositoryId: String(repository.data) };
}

/** The same rows the worker store reads, through the service role. */
async function skeletonRows(
  workspaceId: string,
  repositoryId: string,
): Promise<DocSkeletonRows> {
  const service = serviceRoleClient();
  const scoped = <T extends string>(table: T) =>
    service
      .from(table)
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("repository_id", repositoryId);
  const [artifacts, directories, edges, nodes] = await Promise.all([
    scoped("artifacts"),
    scoped("directories"),
    scoped("edges"),
    scoped("graph_nodes"),
  ]);
  for (const result of [artifacts, directories, edges, nodes]) {
    expect(result.error?.message ?? null).toBeNull();
  }
  const storedArtifacts = (artifacts.data ?? []).map((row) => ({
    blobSha: (row.source_blob_sha as string | null) ?? null,
    exportedSymbols: (Array.isArray(row.exported_symbols)
      ? row.exported_symbols
      : []
    ).flatMap((entry: unknown) =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as { name?: unknown }).name === "string"
        ? [(entry as { name: string }).name]
        : [],
    ),
    nodeId: String(row.id),
    path: String(row.path),
  }));
  const storedDirectories = (directories.data ?? []).map((row) => ({
    nodeId: String(row.id),
    path: String(row.path),
  }));
  const pathById = new Map<string, string>([
    ...storedArtifacts.map((entry) => [entry.nodeId, entry.path] as const),
    ...storedDirectories.map((entry) => [entry.nodeId, entry.path] as const),
  ]);
  return {
    artifacts: storedArtifacts,
    directories: storedDirectories,
    edges: (edges.data ?? []).map((row) => ({
      relation: String(row.relation),
      sourceNodeId: String(row.source_node_id),
      targetNodeId: String(row.target_node_id),
    })),
    nodes: (nodes.data ?? []).map((row) => ({
      kind: String(row.kind),
      nodeId: String(row.id),
      path: pathById.get(String(row.id)) ?? null,
      title: String(row.label),
    })),
    repositoryFullName: "local/doc-pages",
  };
}

async function storedPages(workspaceId: string): Promise<PageRow[]> {
  const rows = await serviceRoleClient()
    .from("doc_pages")
    .select("id,scope,slug,previous_slugs,title,member_paths,member_digest,summary")
    .eq("workspace_id", workspaceId);
  expect(rows.error?.message ?? null).toBeNull();
  return (rows.data ?? []) as unknown as PageRow[];
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
}

test("doc pages over a real scan: list, old-address redirect, stale prose named, backlinks, both themes audited", async ({
  context,
  page,
}) => {
  test.setTimeout(150_000);
  const user = await createWorkspaceUser("doc-pages");
  const service = serviceRoleClient();
  try {
    await signIn(context, user);

    // Before the skeleton pass: the honest empty state, not a fixture.
    await page.goto("/app/docs");
    await expect(page.getByTestId("docs-empty")).toContainText(
      DOCS.empty.title,
    );

    const { commitSha, repositoryId } = await seedScan(user.workspaceId);
    const pages = buildDocSkeletonPages(
      await skeletonRows(user.workspaceId, repositoryId),
      commitSha,
    );
    expect(pages.some(({ scope }) => scope === "repo")).toBe(true);
    const applied = await service.rpc("apply_doc_page_skeletons", {
      target_workspace_id: user.workspaceId,
      target_repository_id: repositoryId,
      pages,
    });
    expect(applied.error?.message ?? null).toBeNull();
    expect(applied.data).toMatchObject({ renamed: 0, written: pages.length });

    const before = await storedPages(user.workspaceId);
    const repoPage = before.find(({ scope }) => scope === "repo")!;
    const modulePage = before.find(
      ({ member_paths, scope }) =>
        scope === "module" && member_paths.includes("src/session.ts"),
    )!;
    expect(repoPage).toBeTruthy();
    expect(modulePage).toBeTruthy();

    // Prose lands under the digest it was written for; the module's cites
    // the repository page's node.
    const prose = await service.rpc("apply_doc_page_prose", {
      target_workspace_id: user.workspaceId,
      target_repository_id: repositoryId,
      items: [
        {
          body: REPO_PROSE,
          citedNodeIds: [],
          memberDigest: repoPage.member_digest,
          model: "e2e-fixture",
          provider: "e2e",
          slug: repoPage.slug,
        },
        {
          body: MODULE_PROSE,
          citedNodeIds: [repoPage.id],
          memberDigest: modulePage.member_digest,
          model: "e2e-fixture",
          provider: "e2e",
          slug: modulePage.slug,
        },
      ],
    });
    expect(prose.error?.message ?? null).toBeNull();
    expect(prose.data).toMatchObject({ applied: 2, superseded: 0 });

    // The module gains a member in a directory it did not span: a new
    // address, the same page, and prose that no longer describes it.
    const moduleSkeleton = pages.find(
      ({ identityKey, scope }) =>
        scope === "module" && identityKey === `module:${modulePage.title}`,
    ) ?? pages.find(({ memberPaths, scope }) =>
      scope === "module" && memberPaths.includes("src/session.ts"),
    )!;
    const renamed = await service.rpc("apply_doc_page_skeletons", {
      target_workspace_id: user.workspaceId,
      target_repository_id: repositoryId,
      pages: [
        {
          ...moduleSkeleton,
          memberDigest: "f".repeat(64),
          memberPaths: [...moduleSkeleton.memberPaths, "docs/generated/session.md"],
        },
      ],
    });
    expect(renamed.error?.message ?? null).toBeNull();
    expect(renamed.data).toMatchObject({ renamed: 1, written: 1 });
    const after = await storedPages(user.workspaceId);
    const movedPage = after.find(({ id }) => id === modulePage.id)!;
    expect(movedPage.slug).not.toBe(modulePage.slug);
    expect(movedPage.previous_slugs).toContain(modulePage.slug);

    // The list: the repository page has current prose, the module's is stale.
    await page.goto("/app/docs");
    const list = page.getByTestId("docs-list");
    await expect(page.locator(".docs-main")).toContainText(
      DOCS.count(after.length),
    );
    const repoRow = list.locator(`.docs-row:has(a[href$='/${repoPage.slug}'])`);
    await expect(repoRow).toHaveAttribute("data-prose", "current");
    await expect(repoRow.locator(".status-badge.inferred")).toHaveCount(1);
    const moduleRow = list.locator(
      `.docs-row:has(a[href$='/${movedPage.slug}'])`,
    );
    await expect(moduleRow).toHaveAttribute("data-prose", "stale");
    await expect(moduleRow).toContainText(DOCS.proseState.stale);
    await expect(page.locator(".status-badge.verified")).toHaveCount(0);

    // The old address follows the page; the stale prose is named, not served.
    await page.goto(`/app/docs/${modulePage.slug}`);
    await expect(page).toHaveURL(new RegExp(`/app/docs/${movedPage.slug}$`));
    const moved = page.getByTestId("doc-page");
    await expect(moved).toHaveAttribute("data-prose", "stale");
    await expect(moved.getByTestId("doc-page-summary")).toContainText(
      DOCS.proseState.stale,
    );
    await expect(moved).not.toContainText(MODULE_PROSE);
    await expect(moved.getByTestId("doc-page-members")).toContainText(
      "docs/generated/session.md",
    );
    await expect(moved).toContainText(DOCS.page.previousSlugs(1));
    await expect(moved.locator(".status-badge")).toHaveCount(0);

    // The repository page: prose under the inferred badge, and the module
    // page listed as the page that cited it.
    await page.goto(`/app/docs/${repoPage.slug}`);
    const repo = page.getByTestId("doc-page");
    await expect(repo).toHaveAttribute("data-prose", "current");
    await expect(repo.getByTestId("doc-page-summary")).toContainText(
      REPO_PROSE,
    );
    await expect(
      repo.getByTestId("doc-page-summary").locator(".status-badge.inferred"),
    ).toHaveCount(1);
    await expect(repo.locator(".status-badge.verified")).toHaveCount(0);
    await expect(repo.getByTestId("doc-page-backlinks")).toContainText(
      movedPage.title,
    );
    // Names and counts only: an export name, never a signature.
    await expect(repo.getByTestId("doc-page-symbols")).toContainText(
      "SESSION_TIMEOUT_MS",
    );
    await expect(repo.getByTestId("doc-page-symbols")).not.toContainText("=");

    // An address nobody has answered to is a 404, not a page.
    const missing = await page.goto(`/app/docs/${"0".repeat(32)}`);
    expect(missing?.status()).toBe(404);

    await mkdir(EVIDENCE, { recursive: true });
    for (const theme of ["dark", "light"] as const) {
      await page.goto(`/app/docs/${repoPage.slug}`);
      await auditContrast(page, theme);
      await expect(page.getByTestId("doc-page")).toHaveAttribute(
        "data-prose",
        "current",
      );
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2aa", "wcag21aa"])
        .withRules(["color-contrast"])
        .include(".docs-main")
        .analyze();
      const violations = results.violations.flatMap((violation) =>
        violation.nodes.map((entry) => ({
          html: entry.html.slice(0, 220),
          target: entry.target.map(String).join(" "),
        })),
      );
      await writeFile(
        path.join(EVIDENCE, `axe-contrast-doc-page-${theme}.json`),
        `${JSON.stringify(
          {
            route: "/app/docs/[slug]",
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
        fullPage: true,
        path: path.join(EVIDENCE, `doc-page-${theme}.png`),
      });
    }
    await page.goto("/app/docs");
    await expect(page.getByTestId("docs-list")).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: path.join(EVIDENCE, "docs-list-light.png"),
    });
  } finally {
    await deleteWorkspaceUser(user.userId);
  }
});
