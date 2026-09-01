import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import {
  ProductEmptyState,
  ProductPageHeader,
  ProductSectionHeader,
} from "./page-layout";

describe("F4 product page primitives", () => {
  test("keep semantic heading and state structure", () => {
    const header = renderToStaticMarkup(
      createElement(ProductPageHeader, {
        actions: createElement("button", null, "내보내기"),
        description: "증거 기반 요약",
        kicker: "Repository",
        title: "분석 결과",
        titleId: "page-title",
      }),
    );
    const section = renderToStaticMarkup(
      createElement(ProductSectionHeader, {
        count: "3건",
        kicker: "Evidence",
        title: "열린 항목",
        titleId: "section-title",
      }),
    );
    const empty = renderToStaticMarkup(
      createElement(ProductEmptyState, {
        body: "조건을 바꾸거나 첫 분석을 실행하세요.",
        title: "표시할 증거가 없습니다",
      }),
    );

    expect(header).toContain('<h1 id="page-title">');
    expect(header).toContain("product-page-actions");
    expect(section).toContain('<h2 id="section-title">');
    expect(empty).toContain('role="status"');
  });
});
