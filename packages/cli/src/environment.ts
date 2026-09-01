export interface CliEnvironment {
  readonly server: string | null;
  readonly token: string | null;
}

/**
 * Canonical Alrescha variables win. Legacy Arr variables remain read-only
 * fallbacks for one compatibility window.
 */
export function resolveCliEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): CliEnvironment {
  return {
    server:
      environment["ALRESCHA_SERVER_URL"] ??
      environment["ARR_SERVER_URL"] ??
      null,
    token: environment["ALRESCHA_TOKEN"] ?? environment["ARR_TOKEN"] ?? null,
  };
}
