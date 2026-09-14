import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { INSPECTION } from "../../apps/web/lib/strings/inspection";
import { createUlid } from "../../packages/mcp/src/store";
import {
  createWorkspaceUser,
  deleteWorkspaceUser,
  serviceRoleClient,
  signIn,
} from "./helpers/session";

/**
 * A person takes a finding off the board (Phase 4 Wave D todo 19 ⑷), on a
 * live workspace: the row is seeded the way the analyze job writes it, the
 * reason is typed into the product's own form, and `dismiss_finding` runs as
 * that member. What is asserted is the decision's afterlife — it moves to
 * "제외한 문제" with its reason, leaves the open list and the judgment panel,
 * and the row names who dismissed it.
 */

test.use({ viewport: { height: 900, width: 1440 } });

const EVIDENCE = path.resolve(".omo/evidence/phase4/todo-19");
const TITLE = "문서가 코드보다 오래됐습니다";
const REASON = "설계상 의도된 차이입니다";

test("dismissing a finding with a reason keeps it reviewable and out of the open list", async ({
  context,
  page,
}) => {
  test.setTimeout(90_000);
  const user = await createWorkspaceUser("inspection-dismiss");
  const service = serviceRoleClient();
  try {
    await signIn(context, user);

    const repository = await service
      .from("repositories")
      .insert({
        default_branch: "main",
        full_name: "arr-e2e/dismiss",
        workspace_id: user.workspaceId,
      })
      .select("id")
      .single();
    expect(repository.error).toBeNull();
    const repositoryId = String(repository.data?.id);
    const artifactId = createUlid(new Date());
    const findingId = createUlid(new Date(Date.now() + 1));

    const nodes = await service.from("graph_nodes").insert([
      {
        id: artifactId,
        kind: "artifact",
        label: "spec.md",
        repository_id: repositoryId,
        workspace_id: user.workspaceId,
      },
      {
        id: findingId,
        kind: "finding",
        label: TITLE,
        repository_id: repositoryId,
        workspace_id: user.workspaceId,
      },
    ]);
    expect(nodes.error).toBeNull();
    const artifact = await service.from("artifacts").insert({
      classification: "spec",
      digest: "a".repeat(64),
      id: artifactId,
      kind: "spec",
      path: "spec.md",
      repository_id: repositoryId,
      source_commit_sha: "1".repeat(40),
      workspace_id: user.workspaceId,
    });
    expect(artifact.error).toBeNull();
    const finding = await service.from("findings").insert({
      confidence: 0.5,
      evidence_grade: "inferred",
      fingerprint: `stale-doc:spec.md:3:${findingId}`,
      id: findingId,
      kind: "stale-doc",
      provenance: {
        reason: "deterministic stale-doc rule",
        spans: [{ endLine: 3, path: "spec.md", startLine: 3 }],
        suggestedAction: "문서의 경로 참조를 갱신하세요.",
      },
      repository_id: repositoryId,
      severity: "medium",
      source_node_id: artifactId,
      status: "open",
      title: TITLE,
      workspace_id: user.workspaceId,
    });
    expect(finding.error).toBeNull();

    await page.goto("/app/inspection");
    // ⑶ on the live screen: the stored detail, not just a title.
    const open = page.getByTestId("inspection-findings");
    await expect(open).toContainText(TITLE);
    await expect(open).toContainText("spec.md:3");
    await expect(open).toContainText(INSPECTION.findings.detail.confidence(50));
    await expect(open).toContainText("문서의 경로 참조를 갱신하세요.");
    await expect(page.getByTestId("inspection-dismissed")).toContainText(
      INSPECTION.dismissed.empty,
    );

    const form = page.locator(`form[data-dismiss="${findingId}"]`);
    await form.getByLabel(INSPECTION.dismiss.reasonLabel).fill(REASON);
    await form.getByRole("button", { name: INSPECTION.dismiss.action }).click();

    await expect(page).toHaveURL(/dismiss=done/);
    await expect(page.getByTestId("dismiss-status")).toContainText(
      INSPECTION.dismiss.done,
    );
    const dismissed = page.getByTestId("inspection-dismissed");
    await expect(dismissed).toContainText(TITLE);
    await expect(dismissed).toContainText(REASON);
    await expect(dismissed).toContainText(INSPECTION.dismissed.count(1));
    await expect(page.getByTestId("inspection-findings")).not.toContainText(
      TITLE,
    );
    await expect(page.locator(`form[data-dismiss="${findingId}"]`)).toHaveCount(
      0,
    );

    await mkdir(EVIDENCE, { recursive: true });
    await page.screenshot({
      fullPage: true,
      path: path.join(EVIDENCE, "inspection-dismissed.png"),
    });

    // The row says who and why — a dismissal that cannot be attributed is a
    // deletion with a delay.
    const row = await service
      .from("findings")
      .select("status,dismissed_by,dismissed_reason")
      .eq("id", findingId)
      .single();
    expect(row.error).toBeNull();
    expect(row.data).toEqual({
      dismissed_by: user.userId,
      dismissed_reason: REASON,
      status: "dismissed",
    });

    // A second dismissal of the same row keeps the first reason and the
    // first person: the function coalesces both.
    await page.goto("/app/inspection?dismiss=already-resolved");
    await expect(page.getByTestId("dismiss-status")).toContainText(
      INSPECTION.dismiss.alreadyResolved,
    );
  } finally {
    await deleteWorkspaceUser(user.userId);
  }
});
