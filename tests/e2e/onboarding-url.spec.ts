import { expect, test, type Page } from "@playwright/test";

import { ONBOARDING } from "../../apps/web/lib/strings";

async function reachRepositoryStep(page: Page) {
  await page.goto("/onboarding");
  await page.getByRole("button", { name: ONBOARDING.identity.cta }).click();
  await page.getByRole("button", { name: ONBOARDING.permission.cta }).click();
  await expect(
    page.getByRole("heading", { name: ONBOARDING.repository.titleDefault }),
  ).toBeVisible();
}

test("connects by pasted URL: install guidance, then completion", async ({ page }) => {
  await reachRepositoryStep(page);

  await page
    .getByLabel(ONBOARDING.repository.url.label)
    .fill("https://github.com/acme/checkout-service");
  await page.getByRole("button", { name: ONBOARDING.repository.url.submit }).click();

  await expect(
    page.getByText(ONBOARDING.repository.url.installNeeded("acme/checkout-service")),
  ).toBeVisible();

  await page.getByRole("button", { name: ONBOARDING.repository.url.installCta }).click();
  await expect(page.getByRole("heading", { name: ONBOARDING.scan.title })).toBeVisible();
  await page.getByRole("button", { name: ONBOARDING.scan.cta }).click();
  await expect(page.getByTestId("brain-map-stage")).toBeVisible();
});

test("connects immediately when the pasted URL is already visible to the App", async ({
  page,
}) => {
  await reachRepositoryStep(page);

  await page
    .getByLabel(ONBOARDING.repository.url.label)
    .fill(`git@github.com:${ONBOARDING.repository.defaultRepo}.git`);
  await page.getByRole("button", { name: ONBOARDING.repository.url.submit }).click();

  await expect(page.getByRole("heading", { name: ONBOARDING.scan.title })).toBeVisible();
});

test("explains an address it cannot parse", async ({ page }) => {
  await reachRepositoryStep(page);

  await page
    .getByLabel(ONBOARDING.repository.url.label)
    .fill("https://gitlab.com/acme/checkout-service");
  await page.getByRole("button", { name: ONBOARDING.repository.url.submit }).click();

  await expect(page.getByText(ONBOARDING.repository.url.invalid)).toBeVisible();
});
