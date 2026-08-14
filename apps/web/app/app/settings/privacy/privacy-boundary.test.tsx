import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";

import { PrivacyBoundary } from "./privacy-boundary";

test("privacy boundary discloses storage, transient fetches, BYOK, retention, and measured claims", () => {
  const html = renderToStaticMarkup(createElement(PrivacyBoundary));

  expect(html).toContain("Metadata-only storage");
  expect(html).toContain("transient");
  expect(html).toContain("BYOK");
  expect(html).toContain("30 days");
  expect(html).toContain('href="/app/stats"');
  expect(html).toContain("No credits are used");
});
