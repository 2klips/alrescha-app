export interface RepositorySummary {
  readonly fullName: string;
  readonly id: string;
  readonly workspaceId: string;
}

export interface RepositoryRouteDependencies {
  readonly findRepository: (repositoryId: string) => Promise<RepositorySummary | null>;
  readonly getVerifiedUserId: () => Promise<string | null>;
  readonly isWorkspaceMember: (workspaceId: string, userId: string) => Promise<boolean>;
}

export async function getRepositoryResponse(
  repositoryId: string,
  dependencies: RepositoryRouteDependencies,
): Promise<Response> {
  const userId = await dependencies.getVerifiedUserId();

  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const repository = await dependencies.findRepository(repositoryId);

  if (!repository) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  if (!(await dependencies.isWorkspaceMember(repository.workspaceId, userId))) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  return Response.json({ repository: { fullName: repository.fullName, id: repository.id } });
}

