import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { pushLocalProject } from "../../packages/cli/src/push";
import { SETTINGS } from "../../apps/web/lib/strings";
import {
  createWorkspaceUser,
  deleteWorkspaceUser,
  signIn,
} from "./helpers/session";

/**
 * `arr push` → live Supabase → a graph-only card (Phase 2C todo 5, ADR-015).
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

test("arr push renders a graph-only card on the workspace board", async ({
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
    expect(outcome, "arr push did not upload").toMatchObject({
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
