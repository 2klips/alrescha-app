import { createClient } from "@supabase/supabase-js";

import { privateSupabaseEnv } from "./env";

export function createAdminClient() {
  const environment = privateSupabaseEnv();

  return createClient(environment.url, environment.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

