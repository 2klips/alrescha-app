import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { pushLocalProject } from "../../packages/cli/src/push";
import {
  PROGRESS as PROGRESS_COPY,
  SETTINGS,
} from "../../apps/web/lib/strings";
import {
  createWorkspaceUser,
  deleteWorkspaceUser,
  signIn,
} from "./helpers/session";

/**
 * `alrescha push` → live Supabase → a graph-only card (Phase 2C todo 5, ADR-015).
 *
 * `tests/local-ingest.test.ts` already proves the card at the database level.
 * What it cannot prove is the seam: a real HTTP request, a real MCP token
 * issued through the real settings form, the real route handler and the real
 * screen. ADR-015's boundary — a locally scanned commit is worth a graph, not
 * an assurance — is only credible if the badge the user actually sees says so,
 * so this walks the whole path once and reads the rendered card.
 *
 * The pushed project is a throwaway directory rather than this repository:
 * `createLocalRepositorySource` derives a deterministic commit id from the tree
 * it walks, so a fixed tiny tree keeps the assertion stable and the upload small.
 */

const REPOSITORY = "arr-e2e/local-ingest";

const SPEC = `# 인증

## REQ-AUTH-001

세션은 GitHub OAuth로만 발급한다.
`;

const AGENTS = `# AGENTS.md

- 원본 코드 본문은 저장하지 않는다.
`;

const TODO = `# 진행

- [x] 로컬 스캔
- [ ] 실기 파일럿
`;

/** All four markers, so the board has something to put in every column. */
const PROGRESS = `# 진행

- [x] 로컬 스캔
- [ ] 실기 파일럿
- [~] 그래프 렌더
- [-] API 키 대기
`;

test("alrescha push renders a graph-only card on the workspace board", async ({
  context,
  page,
}) => {
  const user = await createWorkspaceUser("ingest");
  const projectDir = await mkdtemp(path.join(tmpdir(), "arr-push-"));

  try {
    await signIn(context, user);

    // 1. Issue an MCP token the way a user does — through the settings form.
    await page.goto("/app/settings/mcp");
    await page.getByLabel(SETTINGS.mcp.tokens.nameLabel).fill("e2e local push");
    await page
      .getByRole("checkbox", { name: SETTINGS.mcp.tokens.scopeWriteLabel })
      .check();
    await page.getByRole("button", { name: SETTINGS.mcp.tokens.issue }).click();

    const secret = await page
      .locator(".mcp-secret code")
      .innerText({ timeout: 15_000 });
    expect(secret.length).toBeGreaterThan(20);

    // 2. Push a small local project through the real CLI code path.
    await writeFile(path.join(projectDir, "AGENTS.md"), AGENTS, "utf8");
    await writeFile(path.join(projectDir, "spec.md"), SPEC, "utf8");
    await writeFile(path.join(projectDir, "PROGRESS.md"), TODO, "utf8");

    const outcome = await pushLocalProject({
      baseUrl: new URL(page.url()).origin,
      repositoryFullName: REPOSITORY,
      rootDir: projectDir,
      token: secret,
    });
    expect(outcome, "alrescha push did not upload").toMatchObject({
      status: "uploaded",
    });
    if (outcome.status !== "uploaded") return;
    expect(outcome.artifactCount).toBeGreaterThan(0);

    // 3. The commit shows up on the workspace board as graph-only.
    await page.goto("/app/commits");
    const card = page.locator(
      `.commit-card[data-assurance="graph-only"] code:has-text("${outcome.commitSha.slice(0, 7)}")`,
    );
    await expect(card).toHaveCount(1);

    // The badge is the user-visible half of ADR-015: a locally scanned commit
    // must never present itself as a fully observed one.
    await expect(
      page.locator(`.commit-card[data-assurance="full"]`),
    ).toHaveCount(0);
  } finally {
    await rm(projectDir, { force: true, recursive: true });
    await deleteWorkspaceUser(user.userId);
  }
});

/**
 * The first live-screen gate on a real scan (Phase 4 Wave A todo 5, D15).
 *
 * Every `/app/progress` assertion until now ran against the demo fixture, so
 * "the board works" meant "the fixture renders". This pushes a document with
 * the four checkbox states through the real CLI, the real route handler and
 * the real loader, and reads the board the user gets.
 */
test("a pushed PROGRESS.md fills the live todo board", async ({
  context,
  page,
}) => {
  const user = await createWorkspaceUser("progress");
  const projectDir = await mkdtemp(path.join(tmpdir(), "arr-progress-"));

  try {
    await signIn(context, user);

    await page.goto("/app/settings/mcp");
    await page.getByLabel(SETTINGS.mcp.tokens.nameLabel).fill("e2e progress");
    await page
      .getByRole("checkbox", { name: SETTINGS.mcp.tokens.scopeWriteLabel })
      .check();
    await page.getByRole("button", { name: SETTINGS.mcp.tokens.issue }).click();
    const secret = await page
      .locator(".mcp-secret code")
      .innerText({ timeout: 15_000 });

    await writeFile(path.join(projectDir, "AGENTS.md"), AGENTS, "utf8");
    await writeFile(path.join(projectDir, "PROGRESS.md"), PROGRESS, "utf8");

    const outcome = await pushLocalProject({
      baseUrl: new URL(page.url()).origin,
      repositoryFullName: `${REPOSITORY}-progress`,
      rootDir: projectDir,
      token: secret,
    });
    expect(outcome, "alrescha push did not upload").toMatchObject({
      status: "uploaded",
    });
    if (outcome.status !== "uploaded") return;

    await page.goto("/app/progress");

    // Each of the four markers reaches its own column, including the two
    // that were not todos at all before this wave (`[~]`, `[-]`).
    await expect(
      page.locator('.todo-column.done .todo-card:has-text("로컬 스캔")'),
    ).toHaveCount(1);
    await expect(
      page.locator('.todo-column.open .todo-card:has-text("실기 파일럿")'),
    ).toHaveCount(1);
    await expect(
      page.locator(
        '.todo-column.in-progress .todo-card:has-text("그래프 렌더")',
      ),
    ).toHaveCount(1);
    await expect(
      page.locator('.todo-column.blocked .todo-card:has-text("API 키 대기")'),
    ).toHaveCount(1);

    // Requirement coverage has no `implements` edge behind it on a
    // graph-only ingest, so the card must say so rather than print 0%
    // (Wave A todo 1).
    // Scoped to the coverage card: todo 19 added a second metric (todo
    // completion), and an unscoped locator would have started passing on
    // whichever card happened to match. The basis attribute is the claim —
    // "nobody measured this" is a state, not a missing number.
    const coverage = page.locator('.progress-metric[data-basis="no-data"]');
    await expect(coverage).toContainText(PROGRESS_COPY.metrics.notMeasured);
    // Three states, not two, and this scenario is the first: a graph-only
    // push has no requirements at all (`no-data`), which is a different fact
    // from having requirements with no `implements` edge (`no-links`) and a
    // different fact again from 0%. The card must not borrow either.
    await expect(coverage).not.toContainText(PROGRESS_COPY.metrics.noLinks);
    await expect(coverage).not.toContainText("0%");
    await expect(page.locator(".progress-metric")).toHaveCount(2);
  } finally {
    await rm(projectDir, { force: true, recursive: true });
    await deleteWorkspaceUser(user.userId);
  }
});
