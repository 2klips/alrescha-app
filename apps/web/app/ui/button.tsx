import type { ButtonHTMLAttributes } from "react";

/**
 * Button primitive (design roadmap step 3) — four variants replace the twelve
 * ad-hoc button styles:
 *
 * - `primary`   brand fill for the strongest action in a view
 * - `secondary` 1px `--line-strong` outline
 * - `ghost`     no chrome until hover
 * - `icon`      32px square; MUST carry `aria-label`
 *
 * Heights: `sm` 32px (dense areas) / `md` 40px (forms, CTAs) — both clear
 * the WCAG 24×24 CSS-px web target minimum with an 8px+ gap convention.
 * Destructive actions get an AlertDialog first; this component styles, it
 * does not confirm.
 */

export type ButtonVariant = "ghost" | "icon" | "primary" | "secondary";
export type ButtonSize = "md" | "sm";

export function Button({
  className,
  size = "sm",
  type = "button",
  variant = "secondary",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly size?: ButtonSize;
  readonly variant?: ButtonVariant;
}) {
  const classes = ["btn", `btn-${variant}`, `btn-${size}`, className]
    .filter(Boolean)
    .join(" ");
  return <button className={classes} type={type} {...rest} />;
}
