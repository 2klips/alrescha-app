import type { WorkspacePilotReport } from "./pilot-report";

export interface PilotStatsExportDependencies {
  readonly getCurrentUserId: () => Promise<string | null>;
  readonly loadReport: (userId: string) => Promise<WorkspacePilotReport>;
}

export async function createPilotStatsExportResponse(
  dependencies: PilotStatsExportDependencies,
): Promise<Response> {
  const userId = await dependencies.getCurrentUserId();
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { report, workspaceId } = await dependencies.loadReport(userId);
  if (report.state === "consent-required") {
    return Response.json(
      { error: "pilot_measurement_consent_required" },
      { status: 403 },
    );
  }

  return Response.json(
    {
      report,
      schemaVersion: "arr.pilot-stats.v1",
      workspaceId,
    },
    {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition":
          'attachment; filename="arr-pilot-stats.json"',
      },
    },
  );
}
