import { cache } from "react";

import { createClient } from "../supabase/server";

/**
 * QW-7: wrapped in React `cache()` alongside `createClient` so one request
 * pays for a single `getClaims()` round-trip no matter how many server
 * components/layouts call this (previously each caller — e.g. the shell
 * layout and the page it wraps — paid its own serial auth round-trip).
 */
export const getCurrentUserId = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const subject = data?.claims.sub;

  if (error || typeof subject !== "string" || subject.length === 0) {
    return null;
  }

  return subject;
});
