import { describe, expect, it, vi } from "vitest";

import {
  getRepositoryResponse,
  type RepositoryRouteDependencies,
} from "../apps/web/lib/auth/repository-route";

const REPOSITORY = {
  fullName: "owner/private-repo",
  id: "01J0000000000000000000000A",
  workspaceId: "01J0000000000000000000000W",
} as const;

function dependencies(
  overrides: Partial<RepositoryRouteDependencies> = {},
): RepositoryRouteDependencies {
  return {
    findRepository: vi.fn().mockResolvedValue(REPOSITORY),
    getVerifiedUserId: vi.fn().mockResolvedValue("user-a"),
    isWorkspaceMember: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe("server-side repository authorization", () => {
  it("returns 401 before looking up data when no verified user exists", async () => {
    const findRepository = vi.fn().mockResolvedValue(REPOSITORY);
    const response = await getRepositoryResponse(
      REPOSITORY.id,
      dependencies({
        findRepository,
        getVerifiedUserId: vi.fn().mockResolvedValue(null),
      }),
    );

    expect(response.status).toBe(401);
    expect(findRepository).not.toHaveBeenCalled();
  });

  it("returns 403 when an authenticated user requests another workspace repository", async () => {
    const response = await getRepositoryResponse(
      REPOSITORY.id,
      dependencies({ isWorkspaceMember: vi.fn().mockResolvedValue(false) }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "forbidden" });
  });

  it("returns only the authorized repository DTO", async () => {
    const response = await getRepositoryResponse(REPOSITORY.id, dependencies());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      repository: { fullName: REPOSITORY.fullName, id: REPOSITORY.id },
    });
  });
});
