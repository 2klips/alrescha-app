import { redirect } from "next/navigation";

import { getCurrentUserId } from "../../../../../lib/auth/current-user";
import { SETTINGS } from "../../../../../lib/strings";
import { PrivacyBoundary } from "./privacy-boundary";
import { ProductPageHeader } from "../../../../ui/page-layout";

export default async function PrivacySettingsPage() {
  if (!(await getCurrentUserId())) redirect("/auth/login");

  return (
    <main className="mcp-settings-shell product-page">
      <ProductPageHeader
        description={SETTINGS.privacy.intro}
        kicker={SETTINGS.privacy.eyebrow}
        title={SETTINGS.privacy.title}
      />
      <PrivacyBoundary />
    </main>
  );
}
