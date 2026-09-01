import { handleGitHubWebhook } from "@alrescha/core";

import { createGitHubWebhookStore } from "../../../../lib/github/webhook-store";

export async function POST(request: Request) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    return Response.json(
      { error: "github_webhook_not_configured" },
      { status: 503 },
    );
  }

  const result = await handleGitHubWebhook({
    deliveryId: request.headers.get("x-github-delivery"),
    event: request.headers.get("x-github-event"),
    rawBody: await request.text(),
    secret,
    signature: request.headers.get("x-hub-signature-256"),
    store: createGitHubWebhookStore(),
  });

  return Response.json(result.body, { status: result.status });
}
