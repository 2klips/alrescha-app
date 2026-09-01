/** Canonical Alrescha MCP endpoint configuration. */
export function resolveMcpUrlEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string | undefined {
  return environment["ALRESCHA_MCP_URL"];
}
