import type { LucideIcon } from "lucide-react";

/**
 * Icon primitive (design roadmap step 3) — the only sanctioned way to size a
 * lucide glyph. Sizes come from the `--icon-*` tokens (14/16/20px), replacing
 * the twelve ad-hoc 12–28px sizes the screens had accumulated; migration to
 * this wrapper happens screen by screen in step 4.
 *
 * Decorative by default (`aria-hidden`); pass `label` only when the icon is
 * the sole content of its control.
 */

export type IconSize = "xs" | "sm" | "md";

export function Icon({
  icon: Glyph,
  label,
  size = "sm",
}: {
  readonly icon: LucideIcon;
  readonly label?: string;
  readonly size?: IconSize;
}) {
  return (
    <Glyph
      aria-hidden={label ? undefined : true}
      aria-label={label}
      className={`icon icon-${size}`}
      focusable={false}
    />
  );
}
