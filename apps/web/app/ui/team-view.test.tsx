import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { vibeGateResultsSchema } from "@alrescha/core";

import { buildDemoTeam } from "../../lib/team/fixtures";
import { GRADE, TEAM } from "../../lib/strings";
import { TeamView } from "./team-view";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

function render(state: "team" | "solo"): string {
  return renderToStaticMarkup(
    createElement(TeamView, { team: buildDemoTeam(state) }),
  );
}

describe("TeamView", () => {
  it("shows the roster with roles and the invited-is-powerless note", () => {
    const html = render("team");
    for (const role of Object.values(TEAM.roster.roles)) {
      expect(html).toContain(role);
    }
    expect(html).toContain(TEAM.roster.statuses.invited);
    expect(html).toContain(TEAM.roster.note);
  });

  it("states the capture boundaries: metadata-only and consent is private", () => {
    const html = render("team");
    expect(html).toContain(TEAM.capture.rawOff);
    expect(html).toContain(TEAM.capture.privacyNote);
    expect(html).toContain(TEAM.capture.localNote);
  });

  it("labels coaching output inferred and shows all six axes", () => {
    const html = render("team");
    expect(html).toContain(GRADE.inferred);
    for (const axis of Object.values(TEAM.coaching.axes)) {
      expect(html).toContain(axis);
    }
  });

  it("renders exactly the adopted metric — rejected and pending stay dark", () => {
    const html = render("team");
    // The 2026-08-25 real run adopted V1 and rejected V5/V6 (Goodhart).
    expect(html).toContain(TEAM.vibe.gateSummary(1, 7));
    expect(html).toContain("V1-verified-evidence-ratio");
    expect(html).not.toContain(TEAM.vibe.gatePending);
    // The comparison table stays locked without the workspace policy.
    expect(html).toContain(TEAM.vibe.comparisonLocked);
  });

  it("shows evidence-based contribution rows with the no-self-report note", () => {
    const html = render("team");
    expect(html).toContain(TEAM.contribution.note);
    expect(html).toContain("REQ-AUTH-003");
    expect(html).toContain("박구현");
  });

  it("renders a solo workspace without team-shaped emptiness", () => {
    const html = render("solo");
    expect(html).toContain(TEAM.roster.count(1));
    expect(html).toContain("김소유");
    expect(html).not.toContain("박구현");
  });

  it("mirrors the published gate file exactly", () => {
    const published = vibeGateResultsSchema.parse(
      JSON.parse(
        readFileSync(`${repoRoot}benchmarks/vibe/gate-results.json`, "utf8"),
      ),
    );
    expect(buildDemoTeam("team").gate).toEqual(published);
  });
});
