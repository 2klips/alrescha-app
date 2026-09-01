/** Canonical configuration wins; Arr remains a one-release read fallback. */
export function resolveMcpUrlEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string | undefined {
  return environment["ALRESCHA_MCP_URL"] ?? environment["ARR_MCP_URL"];
}
