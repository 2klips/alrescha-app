"use client";

import { useEffect } from "react";

/**
 * Brings the deep-linked receipt into view (follow-up to the live-receipts
 * observation: with 32 stored receipts, `?receipt=<id>` for an older one left
 * the selected rail item scrolled out of the list).
 *
 * The rail stays server-rendered and `aria-current` stays the only selection
 * signal — this reads that signal, scrolls the rail's own scrollbox by the
 * smallest amount that reveals the item, and renders nothing. `block: "nearest"`
 * is what keeps it minimal: an item already visible is left where it is, and
 * the page itself is not scrolled just to satisfy the rail.
 */
export function ReceiptRailScroll({
  selectedId,
}: {
  readonly selectedId: string | null;
}) {
  useEffect(() => {
    if (!selectedId) return;
    const selected = document.querySelector<HTMLElement>(
      '.receipt-list a[aria-current="true"]',
    );
    selected?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);
  return null;
}
