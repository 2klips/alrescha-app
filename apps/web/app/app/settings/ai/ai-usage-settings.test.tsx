import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AiUsageSettings } from "./ai-usage-settings";

describe("AI judgment usage settings", () => {
  it("shows credit usage and configured BYOK providers without exposing secrets", () => {
    const html = renderToStaticMarkup(
      createElement(AiUsageSettings, {
        configuredProviders: ["openai"],
        ledger: [
          {
            amount: 50,
            createdAt: "2026-08-13T01:00:00.000Z",
            event: "grant",
            id: "grant-1",
            jobId: null,
          },
          {
            amount: -12,
            createdAt: "2026-08-13T02:00:00.000Z",
            event: "reserve",
            id: "reserve-1",
            jobId: "job-1",
          },
          {
            amount: 0,
            createdAt: "2026-08-13T02:01:00.000Z",
            event: "settle",
            id: "settle-1",
            jobId: "job-1",
          },
        ],
      }),
    );

    expect(html).toContain("38 credits");
    expect(html).toContain("12 used");
    expect(html).toContain("OpenAI BYOK configured");
    expect(html).toContain("BYOK judgments bypass credits");
    expect(html).toContain("encrypted at rest");
    expect(html).not.toContain("workspace-provider-secret");
    expect(html).toContain('name="apiKey"');
    expect(html).toContain('type="password"');
    expect(html).toContain('name="provider"');
    expect(html).not.toContain('value="workspace-provider-secret"');
  });

  it("shows top-up guidance while deterministic analysis remains available", () => {
    const html = renderToStaticMarkup(
      createElement(AiUsageSettings, {
        configuredProviders: [],
        ledger: [
          {
            amount: 10,
            createdAt: "2026-08-13T01:00:00.000Z",
            event: "grant",
            id: "grant-1",
            jobId: null,
          },
          {
            amount: -10,
            createdAt: "2026-08-13T02:00:00.000Z",
            event: "reserve",
            id: "reserve-1",
            jobId: "job-1",
          },
          {
            amount: 0,
            createdAt: "2026-08-13T02:01:00.000Z",
            event: "settle",
            id: "settle-1",
            jobId: "job-1",
          },
        ],
      }),
    );

    expect(html).toContain("Judgments paused");
    expect(html).toContain("Add credits or configure BYOK");
    expect(html).toContain(
      "Deterministic scans and drift analysis keep working",
    );
  });
});
