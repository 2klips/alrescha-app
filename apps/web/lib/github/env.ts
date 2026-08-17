function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function githubAppEnvironment() {
  return {
    appId: required("GITHUB_APP_ID", process.env.GITHUB_APP_ID),
    appSlug: required("GITHUB_APP_SLUG", process.env.GITHUB_APP_SLUG),
    clientId: required(
      "GITHUB_APP_CLIENT_ID",
      process.env.GITHUB_APP_CLIENT_ID,
    ),
    clientSecret: required(
      "GITHUB_APP_CLIENT_SECRET",
      process.env.GITHUB_APP_CLIENT_SECRET,
    ),
    installStateSecret: required(
      "GITHUB_INSTALL_STATE_SECRET",
      process.env.GITHUB_INSTALL_STATE_SECRET,
    ),
    privateKey: required(
      "GITHUB_APP_PRIVATE_KEY",
      process.env.GITHUB_APP_PRIVATE_KEY,
    ).replaceAll("\\n", "\n"),
  } as const;
}
