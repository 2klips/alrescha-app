import {
  findRepository,
  isWorkspaceMember,
} from "../../../../lib/auth/repository-access";
import { getCurrentUserId } from "../../../../lib/auth/current-user";
import { getRepositoryResponse } from "../../../../lib/auth/repository-route";

export async function GET(
  _request: Request,
  context: { params: Promise<{ repositoryId: string }> },
) {
  const { repositoryId } = await context.params;

  return getRepositoryResponse(repositoryId, {
    findRepository,
    getVerifiedUserId: getCurrentUserId,
    isWorkspaceMember,
  });
}
