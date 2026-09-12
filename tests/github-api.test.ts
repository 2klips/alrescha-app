import { describe, expect, it, vi } from "vitest";

import {
  fetchRepositoryById,
  lookupGitHubRepositoryInstallation,
} from "../apps/web/lib/github/api";

/**
 * GitHub's current record of a repository, by its stable id (PR #10
 * follow-up). The picker's inventory can carry a name from before a rename;
 * this read is what a selection stores instead.
 */
describe("GitHub repository record by id", () => {
  const request = { githubRepositoryId: 1_328_886_745, token: "ghs_secret" };

  it("reads by id with the installation token in the header, and returns the current name", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          default_branch: "main",
          full_name: "2klips/alrescha-app",
          id: 1_328_886_745,
        }),
        { status: 200 },
      ),
    );

    await expect(
      fetchRepositoryById(request, fetchImplementation),
    ).resolves.toEqual({
      repository: {
        defaultBranch: "main",
        fullName: "2klips/alrescha-app",
        githubRepositoryId: 1_328_886_745,
      },
    });
    const [url, options] = fetchImplementation.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://api.github.com/repositories/1328886745");
    expect(String(url)).not.toContain("ghs_secret");
    expect(new Headers(options?.headers).get("authorization")).toBe(
      "Bearer ghs_secret",
    );
  });

  it("refuses a record that names another repository", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          default_branch: "main",
          full_name: "someone/else",
          id: 42,
        }),
        { status: 200 },
      ),
    );

    await expect(
      fetchRepositoryById(request, fetchImplementation),
    ).resolves.toEqual({
      error: "GitHub repository response names another repository.",
    });
  });

  it("reports a refusal, a malformed body and a network failure as reasons, not exceptions", async () => {
    const refused = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("", { status: 403 }));
    const malformed = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "1328886745" }), { status: 200 }),
      );
    const offline = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("ECONNRESET"));

    await expect(fetchRepositoryById(request, refused)).resolves.toEqual({
      error: "GitHub repository request failed: 403",
    });
    await expect(fetchRepositoryById(request, malformed)).resolves.toEqual({
      error: "GitHub repository response is malformed.",
    });
    await expect(fetchRepositoryById(request, offline)).resolves.toEqual({
      error: "GitHub repository request failed: ECONNRESET",
    });
  });
});

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
