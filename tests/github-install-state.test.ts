import { describe, expect, it } from "vitest";

import {
  createGitHubInstallState,
  verifyGitHubInstallState,
} from "../apps/web/lib/github/state";

const SECRET = "test-install-state-secret";
const NOW = Date.parse("2026-08-27T00:00:00.000Z");

describe("GitHub installation state", () => {
  it("round-trips an existing installation id for the user OAuth path", () => {
    const state = createGitHubInstallState(
      SECRET,
      {
        installationId: 154_681_535,
        repositoryFullName: "2klips/arr-app",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      NOW,
    );

    expect(verifyGitHubInstallState(SECRET, state, NOW)).toMatchObject({
      installationId: 154_681_535,
      repositoryFullName: "2klips/arr-app",
      userId: "user-1",
      workspaceId: "workspace-1",
    });
  });
});
