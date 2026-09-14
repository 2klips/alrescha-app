"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUserId } from "../../../../lib/auth/current-user";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { createClient } from "../../../../lib/supabase/server";

/**
 * Ask a judgment job to confirm one ambiguous finding (WORK_SPEC §14).
 * Mirrors `runEnrichPass`: BYOK on the chosen provider wins over credits,
 * and the eligibility predicate (open finding, kind mapping, cost) lives in
 * `enqueue_judgment_job` where the database tests prove it.
 */
export async function requestFindingJudgment(
  formData: FormData,
): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/auth/login");

  const findingId = String(formData.get("findingId") ?? "").trim();
  if (!findingId) throw new Error("A finding id is required.");

  const client = await createClient();
  const workspace = await client
    .from("workspaces")
    .select("id")
    .eq("owner_user_id", userId)
    .limit(1)
    .single();
  if (workspace.error || !workspace.data) {
    throw new Error("Personal workspace is unavailable.");
  }

  const admin = createAdminClient();
  const keyed = await admin
    .from("workspace_ai_keys")
    .select("provider")
    .eq("workspace_id", workspace.data.id)
    .eq("provider", "anthropic")
    .maybeSingle();

  const queued = await admin.rpc("enqueue_judgment_job", {
    requested_billing_mode: keyed.data ? "byok" : "credits",
    requested_provider: "anthropic",
    target_finding_id: findingId,
    target_workspace_id: workspace.data.id,
  });
  if (queued.error) {
    throw new Error("Unable to enqueue the judgment job.");
  }

  revalidatePath("/app/inspection");
  redirect("/app/inspection?judgment=queued");
}

/**
 * Ask a judgment job to disambiguate one active requirement — the third
 * judgment kind of WORK_SPEC §14. Same shape as the finding action; the
 * eligibility rule (active requirement), the neutral baseline the strict
 * request needs, and the retry generation live in
 * `enqueue_requirement_judgment_job`.
 */
export async function requestRequirementJudgment(
  formData: FormData,
): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/auth/login");

  const requirementId = String(formData.get("requirementId") ?? "").trim();
  if (!requirementId) throw new Error("A requirement id is required.");

  const client = await createClient();
  const workspace = await client
    .from("workspaces")
    .select("id")
    .eq("owner_user_id", userId)
    .limit(1)
    .single();
  if (workspace.error || !workspace.data) {
    throw new Error("Personal workspace is unavailable.");
  }

  const admin = createAdminClient();
  const keyed = await admin
    .from("workspace_ai_keys")
    .select("provider")
    .eq("workspace_id", workspace.data.id)
    .eq("provider", "anthropic")
    .maybeSingle();

  const queued = await admin.rpc("enqueue_requirement_judgment_job", {
    requested_billing_mode: keyed.data ? "byok" : "credits",
    requested_provider: "anthropic",
    target_requirement_id: requirementId,
    target_workspace_id: workspace.data.id,
  });
  if (queued.error) {
    throw new Error("Unable to enqueue the requirement judgment job.");
  }

  revalidatePath("/app/inspection");
  redirect("/app/inspection?judgment=queued");
}

/**
 * Take one finding off the board, with a reason (Phase 4 Wave D todo 19 ⑷).
 *
 * Runs as the signed-in member: `dismiss_finding` is `security invoker`, so
 * RLS decides what this person may touch and the database requires the
 * reason. The function answers with a status rather than an error for the
 * cases a person can cause — an already-resolved finding, one that is not
 * theirs — and the screen repeats that answer instead of a stack trace.
 */
export async function dismissFinding(formData: FormData): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/auth/login");

  const findingId = String(formData.get("findingId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!findingId) throw new Error("A finding id is required.");
  if (!reason) redirect("/app/inspection?dismiss=needs-reason");

  const client = await createClient();
  const workspace = await client
    .from("workspaces")
    .select("id")
    .eq("owner_user_id", userId)
    .limit(1)
    .single();
  if (workspace.error || !workspace.data) {
    throw new Error("Personal workspace is unavailable.");
  }

  const result = await client.rpc("dismiss_finding", {
    dismissal_reason: reason,
    target_finding_id: findingId,
    target_workspace_id: workspace.data.id,
  });
  if (result.error) {
    throw new Error("Unable to dismiss the finding.");
  }
  const outcome = (result.data ?? null) as {
    dismissed?: boolean;
    reason?: string;
  } | null;
  const status = outcome?.dismissed
    ? "done"
    : outcome?.reason === "already-resolved" || outcome?.reason === "not-found"
      ? outcome.reason
      : "failed";

  revalidatePath("/app/inspection");
  redirect(`/app/inspection?dismiss=${status}`);
}
