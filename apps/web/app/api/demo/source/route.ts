import { NextResponse } from "next/server";

import { sourceForFinding } from "../../../../lib/assurance/fixtures";

export function GET(request: Request) {
  const findingId = new URL(request.url).searchParams.get("findingId") ?? "";
  const source = sourceForFinding(findingId);
  return source
    ? NextResponse.json(source, {
        headers: { "Cache-Control": "private, max-age=60" },
      })
    : NextResponse.json(
        { error: "Source fixture not found." },
        { status: 404 },
      );
}
