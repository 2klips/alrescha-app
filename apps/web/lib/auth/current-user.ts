import { createClient } from "../supabase/server";

export async function getCurrentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const subject = data?.claims.sub;

  if (error || typeof subject !== "string" || subject.length === 0) {
    return null;
  }

  return subject;
}

