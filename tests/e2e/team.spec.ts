import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { TEAM } from "../../apps/web/lib/strings/team";

/**
 * Team surface journey (Phase 2B todo 9–13 wiring). The screen's job is to
 * make the ADR-011 boundaries visible, so the assertions are about what is
 * NOT shown as much as what is.
 */

const EVIDENCE = path.resolve(".omo/evidence/phase2b/team");

test.beforeAll(async () => {
  await mkdir(EVIDENCE, { recursive: true });
});

test("shows roles, capture boundaries, and coaching under the inferred label", async ({
  page,
}) => {
  await page.goto("/team");

  const roster = page.getByTestId("team-roster");
  await expect(roster).toContainText(TEAM.roster.roles.owner);
  await expect(roster).toContainText(TEAM.roster.statuses.invited);
  await expect(roster).toContainText(TEAM.roster.note);

  const capture = page.getByTestId("team-capture");
  await expect(capture).toContainText(TEAM.capture.rawOff);
  await expect(capture).toContainText(TEAM.capture.privacyNote);

  const coaching = page.getByTestId("team-coaching");
  await expect(coaching.locator(".grade-badge.inferred")).toBeVisible();
  await expect(coaching).toContainText(TEAM.coaching.axes.verifiability);

  await page.screenshot({
    fullPage: true,
    path: path.join(EVIDENCE, "team-overview.png"),
  });
});

test("renders only the VIBE metric adopted by the Goodhart gate", async ({
  page,
}) => {
  await page.goto("/team");
  const vibe = page.getByTestId("team-vibe");
  await expect(vibe).not.toContainText(TEAM.vibe.gatePending);
  await expect(vibe).toContainText(TEAM.vibe.gateSummary(1, 7));
  await expect(vibe).toContainText("V1-verified-evidence-ratio");
  await expect(vibe).toContainText(TEAM.vibe.comparisonLocked);
  // Published 2026-08-25 gate: V1 adopted, V2/V3/V4/V7 pending,
  // V5/V6 rejected. Only the adopted metric may expose a score.
  await expect(vibe.locator(".team-verdict.adopted")).toHaveCount(1);
  await expect(vibe.locator(".team-verdict.pending")).toHaveCount(4);
  await expect(vibe.locator(".team-verdict.rejected")).toHaveCount(2);
});

test("contribution rows come from evidence, and solo mode stays solo", async ({
  page,
}) => {
  await page.goto("/team");
  const contribution = page.getByTestId("team-contribution");
  await expect(contribution).toContainText("REQ-AUTH-003");
  await expect(contribution).toContainText(TEAM.contribution.note);

  await page.goto("/team?state=solo");
  await expect(page.getByTestId("team-roster")).toContainText(
    TEAM.roster.count(1),
  );
});
