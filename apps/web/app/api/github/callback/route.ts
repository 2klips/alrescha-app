import { prepareGitHubOnboarding } from "@alrescha/core";
import { NextResponse } from "next/server";

import {
  createGitHubAppJwt,
  exchangeGitHubAppUserCode,
  getVerifiedUserInstallation,
} from "../../../../lib/github/api";
import { githubAppEnvironment } from "../../../../lib/github/env";
import { createGitHubOnboardingStore } from "../../../../lib/github/onboarding-store";
import { verifyGitHubInstallState } from "../../../../lib/github/state";
import { addressedOrigin } from "../../../../lib/security/same-origin";
import { getCurrentUserId } from "../../../../lib/auth/current-user";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const errorUrl = new URL("/auth/auth-code-error", addressedOrigin(request));

  try {
    const code = requestUrl.searchParams.get("code");
    const stateValue = requestUrl.searchParams.get("state");
    const userId = await getCurrentUserId();
    const environment = githubAppEnvironment();

    if (!code || !stateValue || !userId) {
      return NextResponse.redirect(errorUrl);
    }

    const state = verifyGitHubInstallState(
      environment.installStateSecret,
      stateValue,
    );
    if (state.userId !== userId) {
      return NextResponse.redirect(errorUrl);
    }
    const queryInstallationId = Number(
      requestUrl.searchParams.get("installation_id"),
    );
    const installationId =
      state.installationId ??
      (Number.isSafeInteger(queryInstallationId) && queryInstallationId > 0
        ? queryInstallationId
        : undefined);
    if (
      installationId === undefined ||
      !Number.isSafeInteger(installationId) ||
      installationId <= 0
    ) {
      return NextResponse.redirect(errorUrl);
    }

    const appJwt = createGitHubAppJwt(
      environment.appId,
      environment.privateKey,
    );
    const userAccessToken = await exchangeGitHubAppUserCode({
      clientId: environment.clientId,
      clientSecret: environment.clientSecret,
      code,
    });
    const prepared = await prepareGitHubOnboarding({
      getVerifiedInstallation: () =>
        getVerifiedUserInstallation({
          appJwt,
          installationId,
          userAccessToken,
        }),
      store: createGitHubOnboardingStore(),
      workspaceId: state.workspaceId,
    });

    const selectionUrl = new URL(
      "/app/connect/github/repositories",
      addressedOrigin(request),
    );
    selectionUrl.searchParams.set("installation", prepared.installationId);
    if (state.repositoryFullName) {
      selectionUrl.searchParams.set("repository", state.repositoryFullName);
    }
    return NextResponse.redirect(selectionUrl);
  } catch {
    return NextResponse.redirect(errorUrl);
  }
}
