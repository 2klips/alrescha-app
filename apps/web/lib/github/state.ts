import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

interface InstallState {
  readonly expiresAt: number;
  /** Existing installation reused by the GitHub App user OAuth path. */
  readonly installationId?: number;
  readonly nonce: string;
  /** Repository pasted during URL onboarding; pre-selected after install. */
  readonly repositoryFullName?: string;
  readonly userId: string;
  readonly workspaceId: string;
}

export function createGitHubInstallState(
  secret: string,
  context: {
    installationId?: number;
    repositoryFullName?: string;
    userId: string;
    workspaceId: string;
  },
  now = Date.now(),
): string {
  const payload = Buffer.from(
    JSON.stringify({
      ...context,
      expiresAt: now + 10 * 60 * 1000,
      nonce: randomUUID(),
    } satisfies InstallState),
  ).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyGitHubInstallState(
  secret: string,
  state: string,
  now = Date.now(),
): InstallState {
  const [payload, suppliedSignature, extra] = state.split(".");
  if (!payload || !suppliedSignature || extra) {
    throw new Error("GitHub installation state is malformed.");
  }

  const expectedSignature = createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
  const expected = Buffer.from(expectedSignature);
  const supplied = Buffer.from(suppliedSignature);
  if (
    expected.length !== supplied.length ||
    !timingSafeEqual(expected, supplied)
  ) {
    throw new Error("GitHub installation state signature is invalid.");
  }

  const parsed: unknown = JSON.parse(
    Buffer.from(payload, "base64url").toString("utf8"),
  );
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("expiresAt" in parsed) ||
    !("nonce" in parsed) ||
    !("userId" in parsed) ||
    !("workspaceId" in parsed) ||
    typeof parsed.expiresAt !== "number" ||
    typeof parsed.nonce !== "string" ||
    typeof parsed.userId !== "string" ||
    typeof parsed.workspaceId !== "string" ||
    ("installationId" in parsed &&
      parsed.installationId !== undefined &&
      (typeof parsed.installationId !== "number" ||
        !Number.isSafeInteger(parsed.installationId) ||
        parsed.installationId <= 0)) ||
    ("repositoryFullName" in parsed &&
      parsed.repositoryFullName !== undefined &&
      typeof parsed.repositoryFullName !== "string") ||
    parsed.expiresAt < now
  ) {
    throw new Error("GitHub installation state is invalid or expired.");
  }

  return parsed as InstallState;
}
