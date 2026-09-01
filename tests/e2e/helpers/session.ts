/**
 * A signed-in browser context, without GitHub (Phase 2C todo 5).
 *
 * `/app/*` redirects to `/auth/login` without a Supabase session, and the only
 * sign-in the product offers is GitHub OAuth. That is a deliberate product
 * decision, not a harness one: a browser sweep cannot drive a real GitHub login
 * (a human, a password, and a second factor sit in the middle), so waiting for
 * the GitHub App would not have unblocked these screens anyway.
 *
 * So the session is minted the way Supabase itself mints one — a confirmed
 * email user via the admin API, then a password grant — and the cookies are
 * written by `@supabase/ssr`, the same library the app reads them with. Nothing
 * here reimplements the cookie format, so a library upgrade cannot leave the
 * harness quietly disagreeing with the server about what a session looks like.
 *
 * The product surface is untouched: no email sign-in is exposed anywhere in the
 * UI, and this file is test-only.
 */

import { existsSync } from "node:fs";
import path from "node:path";

import type { BrowserContext } from "@playwright/test";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const ENV_FILE = path.resolve("apps/web/.env.local");

/** Long enough for Supabase's minimum, fixed so a failed run is reproducible. */
const PASSWORD = "arr-e2e-harness-password";

let envLoaded = false;

/**
 * The dev server reads `apps/web/.env.local` because Next reads its own project
 * root; the Playwright process is a separate process and has to be told.
 */
function loadEnvironment(): void {
  if (envLoaded) return;
  if (!existsSync(ENV_FILE)) {
    throw new Error(
      `${ENV_FILE} is missing. Phase 2C todo 4 documents the local Supabase ` +
        "start-up; the authenticated sweeps need that stack running.",
    );
  }
  process.loadEnvFile(ENV_FILE);
  envLoaded = true;
}

function required(name: string): string {
  loadEnvironment();
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export interface SignedInUser {
  /** Bearer token for API calls made outside the browser (`alrescha push`). */
  readonly accessToken: string;
  readonly email: string;
  readonly userId: string;
  readonly workspaceId: string;
}

interface WrittenCookie {
  readonly name: string;
  readonly options: CookieOptions;
  readonly value: string;
}

function adminClient() {
  return createClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/**
 * Create a confirmed user. `handle_new_user` gives it a personal workspace, so
 * every caller gets an isolated tenant and specs cannot see each other's rows.
 */
export async function createWorkspaceUser(label: string): Promise<{
  email: string;
  userId: string;
  workspaceId: string;
}> {
  const admin = adminClient();
  const email = `${label}-${process.pid}-${Date.now()}@alrescha.test`;
  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password: PASSWORD,
  });
  if (created.error || !created.data.user) {
    throw new Error(
      `Could not create the test user: ${created.error?.message ?? "no user"}`,
    );
  }
  const userId = created.data.user.id;

  const workspace = await admin
    .from("workspaces")
    .select("id")
    .eq("owner_user_id", userId)
    .single();
  if (workspace.error || !workspace.data) {
    throw new Error(
      "The new user has no personal workspace — handle_new_user did not run.",
    );
  }

  return { email, userId, workspaceId: String(workspace.data.id) };
}

export async function deleteWorkspaceUser(userId: string): Promise<void> {
  // workspaces.owner_user_id cascades, so the workspace and everything hanging
  // off it goes with the user and the next run starts from an empty tenant.
  await adminClient().auth.admin.deleteUser(userId);
}

/**
 * Sign the user in through `@supabase/ssr` and hand the resulting cookies to
 * the browser context. The cookie jar starts empty and is filled by the library
 * during `signInWithPassword`, which is exactly what the browser would hold.
 */
export async function signIn(
  context: BrowserContext,
  user: { email: string; userId: string; workspaceId: string },
): Promise<SignedInUser> {
  const written: WrittenCookie[] = [];
  const client = createServerClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    {
      cookies: {
        getAll: () =>
          written.map(({ name, value }) => ({
            name,
            value,
          })),
        setAll: (cookies) => {
          for (const cookie of cookies) {
            written.push(cookie as WrittenCookie);
          }
        },
      },
    },
  );

  const session = await client.auth.signInWithPassword({
    email: user.email,
    password: PASSWORD,
  });
  if (session.error || !session.data.session) {
    throw new Error(
      `Password grant failed: ${session.error?.message ?? "no session"}`,
    );
  }
  if (written.length === 0) {
    throw new Error(
      "@supabase/ssr wrote no cookies for the signed-in session.",
    );
  }

  const host = new URL(
    process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
  ).hostname;
  await context.addCookies(
    written.map(({ name, value }) => ({
      domain: host,
      httpOnly: false,
      name,
      path: "/",
      sameSite: "Lax" as const,
      secure: false,
      value,
    })),
  );

  return {
    accessToken: session.data.session.access_token,
    email: user.email,
    userId: user.userId,
    workspaceId: user.workspaceId,
  };
}
