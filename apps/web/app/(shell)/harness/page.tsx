import { buildInstructionCostTable } from "@alrescha/core";

import { DEMO_INSTRUCTION_ARTIFACTS } from "../../../lib/dashboard/demo-harness";
import { DEMO_LIBRARY_ITEM } from "../../../lib/library/demo";
import { HARNESS } from "../../../lib/strings";
import { HarnessAssetCard } from "../../ui/harness-asset-card";
import { InstructionCostTable } from "../../ui/instruction-cost-table";
import { ProductPageHeader } from "../../ui/page-layout";

/**
 * The drifted-demo fixture's harness, priced with the same builder the live
 * screen uses (Phase 4 Wave E todo 24). Same code, fixture numbers — so the
 * page says which it is, above the table rather than in a footnote. The
 * fixture rows live in `lib/dashboard/demo-harness.ts`, shared with the demo
 * dashboard's "상시 로드" chip (Wave B todo 15).
 */
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
      <p className="harness-demo-badge">{HARNESS.demo.badge}</p>
      <p className="harness-cost-assumption">{HARNESS.demo.costNote}</p>
      <InstructionCostTable
        table={buildInstructionCostTable(DEMO_INSTRUCTION_ARTIFACTS)}
      />
      <section className="harness-assets" aria-label={HARNESS.ariaAssets}>
        <HarnessAssetCard asset={{ digest, id, name, source, tags, type }} />
      </section>
    </main>
  );
}
