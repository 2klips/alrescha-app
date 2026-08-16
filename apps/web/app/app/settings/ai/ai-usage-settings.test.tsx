import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SETTINGS } from "../../../../lib/strings";
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

    expect(html).toContain(SETTINGS.ai.creditUsage.balance(38));
    expect(html).toContain(SETTINGS.ai.creditUsage.used(12));
    expect(html).toContain(SETTINGS.ai.byok.configured(SETTINGS.ai.byok.providerNames.openai));
    expect(html).toContain(SETTINGS.ai.byok.intro);
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

    expect(html).toContain(SETTINGS.ai.creditUsage.pausedTitle);
    expect(html).toContain(SETTINGS.ai.creditUsage.pausedBody);
    expect(html).toContain(SETTINGS.ai.creditUsage.pausedNote);
  });
});
