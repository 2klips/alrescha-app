/**
 * alrescha/no-adhoc-font-size + alrescha/no-adhoc-radius — design roadmap step 3 (P7:
 * a scale that is not machine-enforced drifts back to ad hoc within months).
 *
 * Inside a JSX `style={{ … }}` attribute, `fontSize` must come from the type
 * scale (`var(--text-*)`) and `borderRadius` from the radius tokens
 * (`var(--radius-*)`, or 0). Plain object literals elsewhere (e.g. the Pixi
 * renderer's text styles, which are canvas-space numbers, not CSS) are out of
 * scope on purpose.
 *
 * The CSS side of the same contract is the scale-adoption ratchet in
 * tests/design-tokens.test.ts — existing debt may only shrink.
 */

function isJsxStyleObjectProperty(node) {
  // Property -> ObjectExpression -> JSXExpressionContainer -> JSXAttribute(style)
  const objectExpression = node.parent;
  if (!objectExpression || objectExpression.type !== "ObjectExpression") {
    return false;
  }
  const container = objectExpression.parent;
  if (!container || container.type !== "JSXExpressionContainer") return false;
  const attribute = container.parent;
  return (
    attribute?.type === "JSXAttribute" &&
    attribute.name?.type === "JSXIdentifier" &&
    attribute.name.name === "style"
  );
}

function propertyName(node) {
  if (node.key.type === "Identifier") return node.key.name;
  if (node.key.type === "Literal") return String(node.key.value);
  return null;
}

function literalText(valueNode) {
  if (valueNode.type === "Literal") return String(valueNode.value);
  if (
    valueNode.type === "TemplateLiteral" &&
    valueNode.expressions.length === 0
  ) {
    return valueNode.quasis[0]?.value.cooked ?? null;
  }
  // Computed values (variables, conditionals) are not statically checkable.
  return null;
}

function makeRule(targetProperty, allowedPrefix, extraAllowed, messageId, msg) {
  return {
    meta: {
      type: "problem",
      docs: { description: msg },
      schema: [],
      messages: { [messageId]: msg + ' Got "{{value}}".' },
    },
    create(context) {
      return {
        Property(node) {
          if (propertyName(node) !== targetProperty) return;
          if (!isJsxStyleObjectProperty(node)) return;
          const text = literalText(node.value);
          if (text === null) return;
          const value = text.trim();
          if (value.startsWith(allowedPrefix)) return;
          if (extraAllowed.includes(value)) return;
          context.report({
            node: node.value,
            messageId,
            data: { value },
          });
        },
      };
    },
  };
}

export const noAdhocFontSize = makeRule(
  "fontSize",
  "var(--text-",
  [],
  "adhocFontSize",
  "Inline fontSize must come from the type scale: var(--text-*) (tokens.css).",
);

export const noAdhocRadius = makeRule(
  "borderRadius",
  "var(--radius-",
  ["0", "0px"],
  "adhocRadius",
  "Inline borderRadius must come from the radius tokens: var(--radius-*) or 0.",
);
