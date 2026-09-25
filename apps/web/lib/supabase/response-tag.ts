/** A PostgREST (`PGRST116`) or SQLSTATE (`57014`) code, and nothing else. */
const RESPONSE_CODE = /^(?:PGRST\d{3}|[0-9A-Z]{5})$/;

/**
 * How a failed read's message begins: `[HTTP 406 PGRST116] `.
 *
 * The status and the response code are what tell a failure apart without
 * keeping its body (RE-04): `0` is no HTTP answer at all — the network —
 * while `401` is the token and `406 PGRST116` is a row the caller could not
 * see. A response with no status — only a test double's — gives nothing, and
 * a code that is neither PostgREST's nor an SQLSTATE is left out, because the
 * text in that field is not ours to vouch for.
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
