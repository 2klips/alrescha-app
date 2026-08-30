import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

import { publicSupabaseEnv } from "./env";

/**
 * QW-7: wrapped in React `cache()` so every server component, layout, and
 * route handler in one request shares a single client instead of each
 * caller re-reading cookies and re-constructing its own (see
 * `getCurrentUserId`, which then shares this same cached client for its
 * `getClaims()` round-trip). Next's App Router sets up the request-scoped
 * cache for Server Components, Server Actions, and Route Handlers alike
 * (this is the documented `verifySession`/DAL pattern in Next's own auth
 * guide); if a future caller ever ran fully outside that scope, `cache()`
 * degrades to calling the body directly each time rather than throwing or
 * leaking a client across requests. Nothing in this codebase depends on a
 * *fresh* client per call within one request — the client is stateless
 * w.r.t. individual queries, only its construction and any cookie
 * snapshot are shared.
 */
export const createClient = cache(async () => {
  const cookieStore = await cookies();
  const environment = publicSupabaseEnv();

  return createServerClient(environment.url, environment.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, options, value } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot write cookies. Proxy refreshes them.
        }
      },
    },
  });
});
