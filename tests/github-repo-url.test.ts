import { describe, expect, it, vi } from "vitest";

import {
  decideUrlConnect,
  type UrlConnectDependencies,
} from "../apps/web/lib/github/url-connect";

const WORKSPACE_ID = "01J0000000000000000000000W";
const AVAILABLE = {
  githubRepositoryId: 4242,
  installationId: "01J000000000000000000000IN",
};

function dependencies(
  overrides: Partial<UrlConnectDependencies> = {},
): UrlConnectDependencies {
  return {
    connectRepository: vi.fn().mockResolvedValue("01J000000000000000000000RE"),
    findAvailableRepository: vi.fn().mockResolvedValue(null),
    findConnectedRepository: vi.fn().mockResolvedValue(false),
    hasInstallation: vi.fn().mockResolvedValue(false),
    lookupPublicRepository: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

describe("URL onboarding decision", () => {
  it("rejects an unparseable address before any lookup", async () => {
    const findConnectedRepository = vi.fn();
    const outcome = await decideUrlConnect(
      {
        repositoryUrl: "https://gitlab.com/owner/repo",
        workspaceId: WORKSPACE_ID,
      },
      dependencies({ findConnectedRepository }),
    );

    expect(outcome).toEqual({
      kind: "invalid_url",
      reason: "unsupported_host",
    });
    expect(findConnectedRepository).not.toHaveBeenCalled();
  });

  it("reports a repository that is already connected to the workspace", async () => {
    const outcome = await decideUrlConnect(
      {
        repositoryUrl: "https://github.com/2klips/arr-app",
        workspaceId: WORKSPACE_ID,
      },
      dependencies({
        findConnectedRepository: vi.fn().mockResolvedValue(true),
      }),
    );

    expect(outcome).toEqual({
      fullName: "2klips/arr-app",
      kind: "already_connected",
    });
  });

  it("connects immediately when the App already sees the repository", async () => {
    const connectRepository = vi
      .fn()
      .mockResolvedValue("01J000000000000000000000RE");
    const outcome = await decideUrlConnect(
      {
        repositoryUrl: "git@github.com:2klips/arr-app.git",
        workspaceId: WORKSPACE_ID,
      },
      dependencies({
        connectRepository,
        findAvailableRepository: vi.fn().mockResolvedValue(AVAILABLE),
      }),
    );

    expect(outcome).toEqual({
      fullName: "2klips/arr-app",
      kind: "connected",
      repositoryId: "01J000000000000000000000RE",
    });
    expect(connectRepository).toHaveBeenCalledWith(AVAILABLE);
  });

  it("reports missing access when installed but the repo was not granted", async () => {
    const lookupPublicRepository = vi.fn();
    const outcome = await decideUrlConnect(
      { repositoryUrl: "2klips/private-only", workspaceId: WORKSPACE_ID },
      dependencies({
        hasInstallation: vi.fn().mockResolvedValue(true),
        lookupPublicRepository,
      }),
    );

    expect(outcome).toEqual({
      fullName: "2klips/private-only",
      kind: "no_access",
    });
    expect(lookupPublicRepository).not.toHaveBeenCalled();
  });

  it("guides installation with the repository pre-selected for a public repo", async () => {
    const outcome = await decideUrlConnect(
      { repositoryUrl: "github.com/2klips/arr", workspaceId: WORKSPACE_ID },
      dependencies({
        lookupPublicRepository: vi
          .fn()
          .mockResolvedValue({ githubRepositoryId: 987 }),
      }),
    );

    expect(outcome).toEqual({
      fullName: "2klips/arr",
      githubRepositoryId: 987,
      kind: "install",
    });
  });

  it("distinguishes private-or-missing when GitHub answers 404", async () => {
    const outcome = await decideUrlConnect(
      {
        repositoryUrl: "https://github.com/someone/secret",
        workspaceId: WORKSPACE_ID,
      },
      dependencies(),
    );

    expect(outcome).toEqual({
      fullName: "someone/secret",
      kind: "private_or_missing",
    });
  });
});
