import { DEMO_LIBRARY_ITEM } from "../../../lib/library/demo";
import { HARNESS } from "../../../lib/strings";
import { HarnessAssetCard } from "../../ui/harness-asset-card";
import { ProductPageHeader } from "../../ui/page-layout";

export default function DemoHarnessPage() {
  const { digest, id, name, source, tags, type } = DEMO_LIBRARY_ITEM;
  return (
    <main className="harness-shell product-page">
      <ProductPageHeader
        className="harness-hero"
        description={HARNESS.demo.lead}
        kicker={HARNESS.demo.kicker}
        title={HARNESS.title}
      />
      <section className="harness-assets" aria-label={HARNESS.ariaAssets}>
        <HarnessAssetCard asset={{ digest, id, name, source, tags, type }} />
      </section>
    </main>
  );
}
