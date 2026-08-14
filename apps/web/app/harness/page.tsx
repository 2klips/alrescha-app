import { DEMO_LIBRARY_ITEM } from "../../lib/library/demo";
import { HarnessAssetCard } from "./harness-asset-card";

export default function DemoHarnessPage() {
  const { digest, id, name, source, tags, type } = DEMO_LIBRARY_ITEM;
  return (
    <main className="harness-shell">
      <header className="harness-hero">
        <p>Drifted demo · repository harness</p>
        <h1>Save what already works.</h1>
        <span>
          This fixture mirrors the authenticated save flow with an exact
          SKILL.md source commit.
        </span>
      </header>
      <section className="harness-assets" aria-label="Harness assets">
        <HarnessAssetCard asset={{ digest, id, name, source, tags, type }} />
      </section>
    </main>
  );
}
