import {
  handleLocalIngestPreviousState,
  handleLocalIngestUpload,
} from "@alrescha/core";

import { SupabaseLocalIngestStore } from "../../../../lib/ingest/supabase-local-ingest-store";
import { createAdminClient } from "../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function store(): SupabaseLocalIngestStore {
  return new SupabaseLocalIngestStore(createAdminClient());
}

export async function GET(request: Request): Promise<Response> {
  return handleLocalIngestPreviousState(request, store());
}

export async function POST(request: Request): Promise<Response> {
  return handleLocalIngestUpload(request, store());
}
