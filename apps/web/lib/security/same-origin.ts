/**
 * Same-origin check for state-changing routes (Phase 2C todo 5 defect 3).
 *
 * The old guard compared the Origin header against `new URL(request.url)`,
 * but Next normalises `request.url` to the host the server bound, not the
 * host the browser addressed. Visit the dev server as `127.0.0.1` while it
 * bound `localhost` and every guarded POST answered 403 — a break that only
 * shows up live, because tests construct the request and its Origin from the
 * same string.
 *
 * So the comparison is Origin-to-Host: both sides come from the same browser
 * request, so however the user addressed the server, a same-origin submission
 * matches and a cross-site one does not. The Host header survives proxies
 * that forward it correctly, which is the deployment shape Wave 4 assumes.
 */

/**
 * The origin the browser actually addressed, for building redirects.
 *
 * `new URL(request.url).origin` has the same normalisation problem as the old
 * guard: redirect a `127.0.0.1` user to `localhost` and the browser treats it
 * as another site — the session cookie stays behind and the user lands on the
 * login screen mid-flow. The scheme is taken from `request.url` (the browser
 * does not send one in Host) and the host from the Host header.
 */
export function addressedOrigin(request: Request): string {
  const requestUrl = new URL(request.url);
  const host = request.headers.get("host");
  return host ? `${requestUrl.protocol}//${host}` : requestUrl.origin;
}

/** True when the request's Origin targets the host the request addressed. */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  // No Origin at all (or the "null" opaque origin) fails closed: every
  // guarded caller is a same-origin form or fetch, which always sends one.
  if (!origin || !host || origin === "null") {
    return false;
  }
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
