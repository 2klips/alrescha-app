import { DEMO_LIBRARY_ITEM } from "../../../lib/library/demo";
import { HARNESS } from "../../../lib/strings";
import { HarnessAssetCard } from "../../ui/harness-asset-card";

export default function DemoHarnessPage() {
  const { digest, id, name, source, tags, type } = DEMO_LIBRARY_ITEM;
  return (
    <main className="harness-shell">
      <header className="harness-hero">
        <p>{HARNESS.demo.kicker}</p>
        <h1>{HARNESS.title}</h1>
        <span>{HARNESS.demo.lead}</span>
      </header>
      <section className="harness-assets" aria-label={HARNESS.ariaAssets}>
        <HarnessAssetCard asset={{ digest, id, name, source, tags, type }} />
      </section>
    </main>
  );
}
