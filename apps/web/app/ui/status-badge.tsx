import type { ReactNode } from "react";

import { GRADE } from "../../lib/strings/common";

/**
 * StatusBadge — the signature verification-status component (design §5.3).
 * Absorbs the scattered badge families (`.grade-badge`, `.arr-grade`, …)
 * into one contract:
 *
 * - system sans at the 12px floor, 1px currentColor border
 * - colour comes only from the AA-safe `*-text` tokens
 * - a text label is always rendered — colour alone never carries state (P2)
 * - `inferred` double-encodes with a dashed border, continuing the
 *   OQ-004 "recede via dashed" discipline
 * - the label never wraps (compact-label rule: bound values, not labels)
 */

export type StatusGrade = "verified" | "inferred" | "broken";

export function StatusBadge({
  children,
  grade,
}: {
  readonly children?: ReactNode;
  readonly grade: StatusGrade;
}) {
  return (
    <span className={`status-badge ${grade}`} data-grade={grade}>
      {children ?? GRADE[grade]}
    </span>
  );
}
