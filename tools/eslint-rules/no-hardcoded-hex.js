/**
 * arr/no-hardcoded-hex — Phase 2A (ADR-009-3).
 *
 * Colours may only be declared in the Ink & Seal tokens stylesheet
 * (`apps/web/app/styles/tokens.css`). Components must reference `var(--token)`
 * so every surface is themable in both dark and light.
 *
 * Only strings that are *entirely* a CSS hex colour are reported, so prose that
 * happens to contain a `#1234` issue reference is untouched.
 */

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** True when a raw string is a bare CSS hex colour. */
export function isHexColorLiteral(value) {
  return typeof value === "string" && HEX_COLOR.test(value.trim());
}

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow hardcoded hex colours outside the Ink & Seal tokens stylesheet.",
    },
    schema: [],
    messages: {
      hardcodedHex:
        'Hardcoded colour "{{value}}". Use an Ink & Seal token (var(--token) from app/styles/tokens.css) instead.',
    },
  },
  create(context) {
    function report(node, value) {
      context.report({ node, messageId: "hardcodedHex", data: { value } });
    }

    return {
      Literal(node) {
        if (isHexColorLiteral(node.value)) report(node, node.value.trim());
      },
      TemplateElement(node) {
        const raw = node.value.cooked ?? node.value.raw;
        if (isHexColorLiteral(raw)) report(node, raw.trim());
      },
    };
  },
};

export default rule;
