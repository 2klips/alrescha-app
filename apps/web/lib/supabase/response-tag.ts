/** A PostgREST (`PGRST116`) or SQLSTATE (`57014`) code, and nothing else. */
const RESPONSE_CODE = /^(?:PGRST\d{3}|[0-9A-Z]{5})$/;

/**
 * How a failed read's message begins: `[HTTP 406 PGRST116] `.
 *
 * The status and the response code tell one kind of failure from another
 * without keeping its body (RE-04). They narrow a failure; they do not name
 * its cause. `0` says no HTTP response came back, not why; `401` says the
 * credentials were refused, not which ones or why; `406 PGRST116` says the
 * one-row condition failed, not whether the row is missing or hidden. A
 * response with no status — only a test double's — gives nothing, and a code
 * that is neither PostgREST's nor an SQLSTATE is left out, because the text
 * in that field is not ours to vouch for.
 */
export function responseTag(response: {
  error: { code?: string } | null;
  status?: number;
}): string {
  if (typeof response.status !== "number") return "";
  const code = response.error?.code;
  const suffix =
    typeof code === "string" && RESPONSE_CODE.test(code) ? ` ${code}` : "";
  return `[HTTP ${response.status}${suffix}] `;
}
