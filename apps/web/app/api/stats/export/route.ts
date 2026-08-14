import { getCurrentUserId } from "../../../../lib/auth/current-user";
import { createClient } from "../../../../lib/supabase/server";
import { createPilotStatsExportResponse } from "../../../../lib/stats/export";
import { loadWorkspacePilotReport } from "../../../../lib/stats/pilot-report";

export async function GET(): Promise<Response> {
  return createPilotStatsExportResponse({
    getCurrentUserId,
    loadReport: async (userId) => {
      const client = await createClient();
      return loadWorkspacePilotReport(client, userId);
    },
  });
}
