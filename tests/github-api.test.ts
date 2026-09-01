import { describe, expect, it, vi } from "vitest";

import { lookupGitHubRepositoryInstallation } from "../apps/web/lib/github/api";

describe("GitHub repository installation lookup", () => {
  it("returns the existing installation id", async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: 154_681_535 }), { status: 200 }),
      );

    await expect(
      lookupGitHubRepositoryInstallation(
        "2klips/alrescha-app",
        "app-jwt",
        fetchImplementation,
      ),
    ).resolves.toEqual({ githubInstallationId: 154_681_535 });
    expect(fetchImplementation).toHaveBeenCalledWith(
      "https://api.github.com/repos/2klips/alrescha-app/installation",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer app-jwt" }),
      }),
    );
  });

  it("returns null when the App is not installed", async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 404 }));

    await expect(
      lookupGitHubRepositoryInstallation(
        "2klips/alrescha-app",
        "app-jwt",
        fetchImplementation,
      ),
    ).resolves.toBeNull();
  });
});
