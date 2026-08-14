"use client";

import { createBrowserClient } from "@supabase/ssr";

import { publicSupabaseEnv } from "./env";

export function createClient() {
  const environment = publicSupabaseEnv();
  return createBrowserClient(environment.url, environment.publishableKey);
}

