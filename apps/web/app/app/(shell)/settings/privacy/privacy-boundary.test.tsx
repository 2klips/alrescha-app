import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";

import { SETTINGS } from "../../../../../lib/strings";
import { PrivacyBoundary } from "./privacy-boundary";

test("privacy boundary discloses storage, transient fetches, BYOK, retention, and measured claims", () => {
  const html = renderToStaticMarkup(createElement(PrivacyBoundary));

  expect(html).toContain(SETTINGS.privacy.stored.title);
  expect(html).toContain(SETTINGS.privacy.transient.title);
  expect(html).toContain("BYOK");
  expect(html).toContain(SETTINGS.privacy.retention.title);
  expect(html).toContain('href="/app/stats"');
  expect(html).toContain(SETTINGS.privacy.credits.body);
});
